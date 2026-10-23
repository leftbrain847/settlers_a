// Host defaults. Everything here is overridable per room via the host controls; no magic numbers in logic.
export const HOST_CONFIG = {
  maxMsgBytes: 4096,
  maxMsgsPerSec: 25,          // per connection; sustained excess disconnects
  abuseStrikesBeforeClose: 3,
  seatGraceMs: 30_000,
  emptyRoomTtlMs: 5 * 60_000,
  finishedRoomTtlMs: 7 * 24 * 3600_000,
  inviteTtlMs: 24 * 3600_000,
  joinRequestTtlMs: 5 * 60_000,
  maxPendingJoins: 8,
  nameMaxLen: 16,
  minHostKeyLength: 32,
  usageFlushMs: 30_000,
  botStepMs: 800,
  afkBotReleaseOnAction: true,
  quota: {
    dailyRequestBudget: 100_000,
    inboundWsPerRequest: 20,  // 20 inbound WS messages bill as one request
    warnAtFraction: 0.7,
    hardStopAtFraction: 0.95, // refuse NEW rooms past this
  },
} as const;
export type HostConfig = typeof HOST_CONFIG;
