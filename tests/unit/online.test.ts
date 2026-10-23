import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import type { App } from '../../games/settlers/client/app.ts';
import type { OnlineEnv } from '../../games/settlers/client/online.ts';
import { Net, LoopbackSocket } from '../host/net.ts';

const dom = new JSDOM('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>', { pretendToBeVisual: true, url: 'http://test/' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, Node: dom.window.Node, Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent,
});
const { boot: rawBoot } = await import('../../games/settlers/client/app.ts');

// Apps from finished tests must not keep rendering into the shared document.
const live: App[] = [];
const boot: typeof rawBoot = (root, opts) => { const app = rawBoot(root, opts); live.push(app); return app; };
afterEach(() => { for (const app of live.splice(0)) { app.online?.reset(); app.t?.destroy(); } });

const CAP = `${'a'.repeat(32)}.${'A'.repeat(22)}`;
const memStore = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m }; };
// Two apps share one document in these tests, and jsdom's scoped #id lookup can find the other app's copy.
const byAttr = (sel: string): string => sel.replace(/#([\w-]+)/g, '[id="$1"]');
const within = (root: HTMLElement) => ({
  maybe: (sel: string): HTMLElement | null => root.querySelector<HTMLElement>(byAttr(sel)),
  all: (sel: string): HTMLElement[] => [...root.querySelectorAll<HTMLElement>(byAttr(sel))],
  must: (sel: string): HTMLElement => { const el = root.querySelector<HTMLElement>(byAttr(sel)); if (!el) throw new Error(`missing ${sel}\n${root.textContent?.slice(0, 200)}`); return el; },
});
const until = async (cond: () => boolean, what: string, ms = 4000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error(`timed out: ${what} | A: ${document.getElementById('a')!.textContent!.slice(0, 160)} | B: ${document.getElementById('b')!.textContent!.slice(0, 160)}`); await new Promise((r) => setTimeout(r, 5)); }
};

function env(net: Net, path = '/', hash = ''): OnlineEnv {
  return {
    origin: 'http://test', path, hash,
    fetch: (async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(String(url), '/api/rooms');
      const key = String((init?.headers as Record<string, string>).Authorization);
      if (key !== 'Bearer goodkey') return new Response(null, { status: 403 });
      return new Response(JSON.stringify({ cap: CAP, invite: net.invite, hostToken: net.hostToken }), { status: 200 });
    }) as typeof fetch,
    makeSocket: () => new LoopbackSocket(net),
    replaceUrl: () => undefined,
    copy: async () => true,
  };
}

async function setup(): Promise<{ net: Net; hostApp: App; friendApp: App; H: ReturnType<typeof within>; F: ReturnType<typeof within> }> {
  const net = await Net.make();
  const a = document.getElementById('a')!, b = document.getElementById('b')!;
  a.innerHTML = ''; b.innerHTML = '';
  const hostApp = boot(a, { storage: memStore(), online: env(net), autoSleep: () => Promise.resolve() });
  const H = within(a);
  (H.must('#hostkey') as HTMLInputElement).value = 'goodkey';
  H.must('#create-room').click();
  await until(() => !!H.maybe('#invite-link'), 'host sees an invite link');
  const link = H.must('#invite-link').textContent!;
  assert.match(link, new RegExp(`^http://test/r/${CAP.replace('.', '\\.')}#k=[0-9a-f]{32}$`));
  const invite = link.split('#k=')[1]!;
  const friendApp = boot(b, { storage: memStore(), online: env(net, `/r/${CAP}`, `#k=${invite}`), autoSleep: () => Promise.resolve() });
  return { net, hostApp, friendApp, H, F: within(b) };
}

test('host creates a room, a friend asks to join from the link, host lets them in', async () => {
  const { H, F } = await setup();
  assert.ok(F.maybe('#ask-join'), 'invite link opens the join screen');
  (F.must('#join-name') as HTMLInputElement).value = 'Sam';
  F.must('#ask-join').click();
  await until(() => /Waiting for the host/.test(F.must('#room-status').textContent!), 'friend is told to wait');
  await until(() => !!H.maybe('.approve'), 'host sees the request');
  assert.match(H.must('.approve').closest('.row')!.textContent!, /Sam/);
  H.must('.approve').click();
  await until(() => /Waiting for the host to start/.test(F.maybe('#room-status')?.textContent ?? ''), 'friend is seated');
  await until(() => H.all('.row').some((r) => /Sam/.test(r.textContent!)), 'host lists Sam as a player');
});

test('full game over the loopback: both humans on autopilot, bots on alarms, winner shown to both', async () => {
  const { net, hostApp, friendApp, H, F } = await setup();
  (F.must('#join-name') as HTMLInputElement).value = 'Sam';
  F.must('#ask-join').click();
  await until(() => !!H.maybe('.approve'), 'request');
  H.must('.approve').click();
  await until(() => !!F.maybe('#room-status') && /start/.test(F.must('#room-status').textContent!), 'seated');

  hostApp.prefs.values.vp_to_win = 4;
  (H.must('#room-bots') as HTMLSelectElement).value = '1';
  H.must('#room-bots').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  H.must('#start-room').click();
  await until(() => !!H.maybe('.game') && !!F.maybe('.game'), 'both screens switch to the game');
  await until(() => H.all('polygon.hex').length === 19 && F.all('polygon.hex').length === 19, 'boards render');

  // the speed button is the host's alone
  assert.equal(H.must('#speed').hidden, false);
  assert.equal(F.must('#speed').hidden, true);

  H.must('#watch').click();
  F.must('#watch').click();
  await until(() => net.core.phase === 'playing', 'game running');
  net.core.meta.botSpeed = 0;
  for (let i = 0; i < 8000 && net.core.phase === 'playing'; i++) await net.alarm();
  assert.equal(net.core.phase, 'finished');
  await until(() => !!H.maybe('.winner') && !!F.maybe('.winner'), 'winner overlay on both screens');
  void friendApp;
});

test('profile: created in the room, stored on the device, shown with a recovery code', async () => {
  const { H, F } = await setup();
  F.must('#ask-join').click();
  await until(() => !!H.maybe('.approve'), 'request');
  H.must('.approve').click();
  await until(() => !!F.maybe('#make-profile'), 'seated');
  F.must('#make-profile').click();
  await until(() => !!F.maybe('#recovery'), 'recovery code shown');
  assert.match(F.must('#recovery').textContent!, /^([0-9a-f]{4}-){11}[0-9a-f]{4}$/);
});

test('a friend whose socket drops reconnects with the seat token and keeps their seat', async () => {
  const { net, H, F } = await setup();
  F.must('#ask-join').click();
  await until(() => !!H.maybe('.approve'), 'request');
  H.must('.approve').click();
  await until(() => !!F.maybe('#make-profile'), 'seated');
  const seatsBefore = net.core.meta.seats.length;
  const sockets = [...net.clients.values()].filter((c) => !c.closed);
  const friendClient = sockets[sockets.length - 1]!;
  const before = net.clients.size;
  friendClient.onClose?.(1006); // network drop: the socket just goes away
  await until(() => net.clients.size > before, 'a new socket was opened', 4000);
  await until(() => net.core.meta.seats.length === seatsBefore, 'seat kept');
  await until(() => !!F.maybe('#room-status') && /start/.test(F.must('#room-status').textContent!), 'back in the room');
});

test('wrong host key and bad links fail cleanly', async () => {
  const net = await Net.make();
  const a = document.getElementById('a')!;
  a.innerHTML = '';
  boot(a, { storage: memStore(), online: env(net), autoSleep: () => Promise.resolve() });
  const H = within(a);
  (H.must('#hostkey') as HTMLInputElement).value = 'nope';
  H.must('#create-room').click();
  await until(() => /not accepted/.test(H.must('.err').textContent!), 'wrong key message');

  a.innerHTML = '';
  boot(a, { storage: memStore(), online: env(net, `/r/${CAP}`, ''), autoSleep: () => Promise.resolve() });
  assert.match(within(a).must('#room-message').textContent!, /missing its invite/);
});
