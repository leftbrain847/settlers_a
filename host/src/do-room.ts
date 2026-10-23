import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.ts';
import { RoomCore, Out } from './room-core.ts';
import type { RoomDeps } from './room-core.ts';
import { GAMES, DEFAULT_GAME } from './registry.ts';
import { randomHex } from './crypto.ts';
import type { ProfileService, Store, UsageService } from './services.ts';

function kvStore(ctx: DurableObjectState): Store {
  return {
    get: <T>(k: string) => ctx.storage.kv.get(k) as T | undefined,
    put: (k, v) => ctx.storage.kv.put(k, v),
    delete: (k) => { ctx.storage.kv.delete(k); },
    deleteAll: () => { throw new Error('use ctx.storage.deleteAll()'); },
  };
}

/** One Durable Object per room. Thin shell: sockets, storage and alarms; all decisions live in RoomCore. */
export class GameRoom extends DurableObject<Env> {
  private core: RoomCore | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  /** Serialize everything that touches the core: awaits on other objects must not interleave with new messages. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private deps(): RoomDeps {
    const profiles = this.env.PROFILES.get(this.env.PROFILES.idFromName('global'));
    const usage = this.env.USAGE.get(this.env.USAGE.idFromName('global'));
    const profileSvc: ProfileService = {
      create: (n) => profiles.create(n), verify: (i, s) => profiles.verify(i, s), stats: (i) => profiles.stats(i),
      remove: (i, s) => profiles.remove(i, s), record: (g, e) => profiles.record(g, e),
    };
    const usageSvc: UsageService = { add: (n) => usage.add(n), fraction: () => usage.fraction() };
    const gameId = (this.ctx.storage.kv.get('gameId') as string | undefined) ?? DEFAULT_GAME;
    return { store: kvStore(this.ctx), game: GAMES[gameId] ?? GAMES[DEFAULT_GAME]!, profiles: profileSvc, usage: usageSvc };
  }

  private getCore(): RoomCore | null {
    if (this.core) return this.core;
    const core = RoomCore.load(this.deps(), Date.now());
    if (!core) return null;
    // After hibernation the sockets survive; re-register them with the freshly loaded room.
    for (const ws of this.ctx.getWebSockets()) {
      const connId = this.ctx.getTags(ws)[0];
      if (connId) core.connect(connId, ws.deserializeAttachment() ?? undefined);
    }
    this.core = core;
    return core;
  }

  /** RPC from the Worker, which has already checked the host key. */
  async init(args: { roomId: string; hostName: string; hostTokenHash: string; inviteHash: string; game: string }): Promise<void> {
    return this.serial(async () => {
      if (this.ctx.storage.kv.get('meta')) throw new Error('room exists');
      this.ctx.storage.kv.put('gameId', GAMES[args.game] ? args.game : DEFAULT_GAME);
      this.core = await RoomCore.create(this.deps(), { ...args, now: Date.now() });
      await this.reschedule();
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response(null, { status: 404 });
    const core = this.getCore();
    if (!core) return new Response(null, { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const connId = randomHex(8);
    this.ctx.acceptWebSocket(server, [connId]);
    server.serializeAttachment({ seatId: null, pendingId: null });
    core.connect(connId);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') { ws.close(1003, 'text only'); return; }
    const connId = this.ctx.getTags(ws)[0];
    if (!connId) return;
    return this.serial(async () => {
      const core = this.getCore();
      if (!core) { ws.close(1011, 'room missing'); return; }
      const out = await core.message(connId, message, Date.now());
      this.flush(out, core);
      await this.reschedule();
    });
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const connId = this.ctx.getTags(ws)[0];
    if (!connId) return;
    return this.serial(async () => {
      const core = this.getCore();
      if (!core) return;
      this.flush(await core.close(connId, Date.now()), core);
      await this.reschedule();
    });
  }

  override async webSocketError(ws: WebSocket): Promise<void> { return this.webSocketClose(ws); }

  override async alarm(): Promise<void> {
    return this.serial(async () => {
      const core = this.getCore();
      if (!core) return;
      const { out, dead } = await core.alarm(Date.now());
      this.flush(out, core);
      if (dead) {
        for (const ws of this.ctx.getWebSockets()) try { ws.close(1000, 'room closed'); } catch { /* already closed */ }
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
        this.core = null;
        return;
      }
      await this.reschedule();
    });
  }

  private flush(out: Out, core: RoomCore): void {
    const socketFor = (id: string): WebSocket | undefined => this.ctx.getWebSockets(id)[0];
    for (const s of out.sends) { try { socketFor(s.to)?.send(JSON.stringify(s.msg)); } catch { /* peer went away */ } }
    for (const c of out.closes) { const ws = socketFor(c.to); try { ws?.close(c.code, c.reason); } catch { /* already closed */ } }
    for (const ws of this.ctx.getWebSockets()) {
      const id = this.ctx.getTags(ws)[0];
      if (id) { try { ws.serializeAttachment(core.attachment(id)); } catch { /* closed */ } }
    }
  }

  private async reschedule(): Promise<void> {
    const next = this.core?.nextAlarm(Date.now()) ?? null;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}
