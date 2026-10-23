// A fake network around RoomCore: connections, delivery, and a controllable clock.
import { RoomCore, Out } from '../../host/src/room-core.ts';
import { MemoryStore } from '../../host/src/services.ts';
import { ProfilesCore } from '../../host/src/profiles-core.ts';
import { UsageCore } from '../../host/src/usage-core.ts';
import { newToken, sha256Hex } from '../../host/src/crypto.ts';
import { settlersModule } from '../../games/settlers/game.ts';
import type { S2C } from '../../host/src/protocol.ts';
import type { HostConfig } from '../../host/src/config.ts';

export class Client {
  id: string;
  inbox: S2C[] = [];
  closed: { code: number; reason: string } | null = null;
  token = newToken();
  seat: string | null = null;
  net: Net;
  constructor(net: Net, id: string) { this.net = net; this.id = id; }
  async send(msg: object | string): Promise<void> { await this.net.deliver(this.id, typeof msg === 'string' ? msg : JSON.stringify(msg)); }
  last<T extends S2C['t']>(t: T): Extract<S2C, { t: T }> | undefined { return [...this.inbox].reverse().find((m): m is Extract<S2C, { t: T }> => m.t === t); }
  all<T extends S2C['t']>(t: T): Extract<S2C, { t: T }>[] { return this.inbox.filter((m): m is Extract<S2C, { t: T }> => m.t === t); }
  errors(): string[] { return this.all('error').map((e) => e.code); }
}

export class Net {
  core!: RoomCore;
  now = 1_000_000;
  clients = new Map<string, Client>();
  seq = 0;
  invite = newToken();
  hostToken = newToken();
  profiles = new ProfilesCore(new MemoryStore(), () => this.now);
  usage = new UsageCore(new MemoryStore(), () => this.now);
  everySent: string[] = [];

  static async make(host?: HostConfig, profiles?: ProfilesCore): Promise<Net> {
    const net = new Net();
    if (profiles) net.profiles = profiles;
    net.core = await RoomCore.create(
      { store: new MemoryStore(), game: settlersModule, profiles: net.profiles, usage: net.usage, ...(host ? { host } : {}) },
      { roomId: 'a'.repeat(32), now: net.now, hostName: 'Hosty', hostTokenHash: await sha256Hex(net.hostToken), inviteHash: await sha256Hex(net.invite) },
    );
    return net;
  }

  connect(): Client {
    const id = `c${++this.seq}`;
    const c = new Client(this, id);
    this.clients.set(id, c);
    this.core.connect(id);
    return c;
  }

  async deliver(id: string, raw: string): Promise<void> { this.flush(await this.core.message(id, raw, this.now)); }

  flush(out: Out): void {
    for (const s of out.sends) { this.everySent.push(JSON.stringify(s.msg)); this.clients.get(s.to)?.inbox.push(s.msg); }
    for (const c of out.closes) {
      const cl = this.clients.get(c.to);
      if (cl && !cl.closed) { cl.closed = { code: c.code, reason: c.reason }; void this.core.close(c.to, this.now); }
    }
  }

  async host(): Promise<Client> {
    const c = this.connect();
    c.token = this.hostToken;
    await c.send({ t: 'resume', token: c.token });
    c.seat = c.last('joined')!.seat;
    return c;
  }

  /** Friend opens the shared link, asks to join, host approves. */
  async friend(host: Client, name: string): Promise<Client> {
    const c = this.connect();
    await c.send({ t: 'join', name, invite: this.invite, token: c.token });
    const req = host.last('lobby')!.pending!.find((p) => p.name === name || p.id === c.last('pending') as unknown as string)!;
    await host.send({ t: 'host', cmd: { c: 'approve', request: req.id } });
    c.seat = c.last('joined')!.seat;
    return c;
  }

  async alarm(): Promise<boolean> {
    const next = this.core.nextAlarm(this.now);
    if (next === null) return false;
    this.now = Math.max(this.now, next);
    const { out, dead } = await this.core.alarm(this.now);
    this.flush(out);
    return !dead;
  }
}
