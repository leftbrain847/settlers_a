import type { GameRoom } from './do-room.ts';
import type { ProfileStore, UsageMeter } from './do-services.ts';

export interface Env {
  /** Secret set with `wrangler secret put HOST_KEY`. Creates rooms and signs room capabilities. */
  HOST_KEY: string;
  ROOMS: DurableObjectNamespace<GameRoom>;
  PROFILES: DurableObjectNamespace<ProfileStore>;
  USAGE: DurableObjectNamespace<UsageMeter>;
  ASSETS: Fetcher;
}
