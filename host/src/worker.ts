// Entry point. Only /api/* and /ws/* reach this code (static files are served by the platform and cost nothing).
// Everything fails closed: anything not explicitly matched and authenticated is an empty 404/403.
import { HOST_CONFIG } from './config.ts';
import { newToken, randomHex, safeEqual, sanitizeName, sha256Hex, signRoomId, verifyRoomCap } from './crypto.ts';
import { DEFAULT_GAME, GAMES } from './registry.ts';
import type { Env } from './env.ts';
export { GameRoom } from './do-room.ts';
export { ProfileStore, UsageMeter } from './do-services.ts';

const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

const empty = (status: number): Response => new Response(null, { status, headers: HEADERS });
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: HEADERS });

async function hostAuthorized(request: Request, env: Env): Promise<boolean> {
  const m = /^Bearer (.{1,200})$/.exec(request.headers.get('Authorization') ?? '');
  return !!m && (await safeEqual(m[1]!, env.HOST_KEY));
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  if (!(await hostAuthorized(request, env))) return empty(403);
  const usage = env.USAGE.get(env.USAGE.idFromName('global'));
  const fraction = await usage.fraction();
  if (fraction >= HOST_CONFIG.quota.hardStopAtFraction) return json({ error: 'quota' }, 503);

  const raw = await request.text();
  if (raw.length > 1024) return empty(413);
  let body: { name?: unknown; game?: unknown } = {};
  try { body = raw ? (JSON.parse(raw) as typeof body) : {}; } catch { return empty(400); }
  const game = typeof body.game === 'string' && GAMES[body.game] ? body.game : DEFAULT_GAME;

  const roomId = randomHex(16);
  const invite = newToken();
  const hostToken = newToken();
  const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
  await stub.init({ roomId, hostName: sanitizeName(body.name, HOST_CONFIG.nameMaxLen, 'Host'), hostTokenHash: await sha256Hex(hostToken), inviteHash: await sha256Hex(invite), game });
  return json({ cap: await signRoomId(env.HOST_KEY, roomId), invite, hostToken, usage: fraction });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Misconfiguration must never open the door: no key (or a weak one) means everything is refused.
    if (typeof env.HOST_KEY !== 'string' || env.HOST_KEY.length < HOST_CONFIG.minHostKeyLength) return empty(503);
    const url = new URL(request.url);

    if (url.pathname === '/api/rooms' && request.method === 'POST') return createRoom(request, env);
    if (url.pathname === '/api/usage' && request.method === 'GET') {
      if (!(await hostAuthorized(request, env))) return empty(403);
      return json({ fraction: await env.USAGE.get(env.USAGE.idFromName('global')).fraction(), budget: HOST_CONFIG.quota.dailyRequestBudget });
    }

    const ws = /^\/ws\/([0-9a-f]{32}\.[A-Za-z0-9_-]{22})$/.exec(url.pathname);
    if (ws && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      // Browsers always send Origin on WebSocket handshakes; a foreign page must not be able to drive a visitor's connection.
      const origin = request.headers.get('Origin');
      if (origin !== null && origin !== url.origin) return empty(403);
      const roomId = await verifyRoomCap(env.HOST_KEY, ws[1]!);
      if (!roomId) return empty(403);
      return env.ROOMS.get(env.ROOMS.idFromName(roomId)).fetch(request);
    }
    return empty(404);
  },
} satisfies ExportedHandler<Env>;
