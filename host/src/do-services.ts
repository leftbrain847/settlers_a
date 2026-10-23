import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env.ts';
import { ProfilesCore } from './profiles-core.ts';
import { UsageCore } from './usage-core.ts';
import type { Stats } from './protocol.ts';
import type { GameResult } from './game-module.ts';
import type { Store } from './services.ts';

function kvStore(ctx: DurableObjectState): Store {
  return {
    get: <T>(k: string) => ctx.storage.kv.get(k) as T | undefined,
    put: (k, v) => ctx.storage.kv.put(k, v),
    delete: (k) => { ctx.storage.kv.delete(k); },
    deleteAll: () => { throw new Error('use ctx.storage.deleteAll()'); },
  };
}

/** One global instance holding every profile. Methods are called over RPC by rooms only (never reachable from the internet). */
export class ProfileStore extends DurableObject<Env> {
  private core: ProfilesCore;
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); this.core = new ProfilesCore(kvStore(ctx)); }
  create(name: string): Promise<{ id: string; secret: string }> { return this.core.create(name); }
  verify(id: string, secret: string): Promise<{ name: string } | null> { return this.core.verify(id, secret); }
  stats(id: string): Promise<Stats | null> { return this.core.stats(id); }
  remove(id: string, secret: string): Promise<boolean> { return this.core.remove(id, secret); }
  record(gameId: string, entries: { profileId: string; result: GameResult['seats'][string] }[]): Promise<void> { return this.core.record(gameId, entries); }
}

export class UsageMeter extends DurableObject<Env> {
  private core: UsageCore;
  constructor(ctx: DurableObjectState, env: Env) { super(ctx, env); this.core = new UsageCore(kvStore(ctx)); }
  add(requests: number): Promise<void> { return this.core.add(requests); }
  fraction(): Promise<number> { return this.core.fraction(); }
}
