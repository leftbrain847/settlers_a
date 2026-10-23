// Trade timers live here, not in the engine. The room feeds it every new state; whoever owns real time
// (setTimeout locally, a Durable Object alarm on Cloudflare) asks which offers are due and submits
// a SYSTEM trade_expire for each.
import type { GameConfig, GameState, TradeOffer } from './engine/types.ts';

export const GRACE_MS = 1500; // let the offerer see "everyone declined" before the offer disappears

export class TradeClock {
  cfg: GameConfig;
  deadlines: Map<string, number>;

  constructor(cfg: GameConfig) {
    this.cfg = cfg;
    this.deadlines = new Map();
  }

  seconds(s: GameState, offer: TradeOffer, isCounter: boolean): number {
    const t = this.cfg.trade_rules;
    if (isCounter) return t.counter_timer;
    return s.players[offer.from_player]?.is_ai ? t.bot_offer_timer : t.human_response_timer;
  }

  sync(s: GameState, now: number): void {
    const counters = new Set(Object.values(s.trade_offers).flatMap((o) => o.counter_ids));
    for (const id of [...this.deadlines.keys()]) if (!(id in s.trade_offers)) this.deadlines.delete(id);
    for (const offer of Object.values(s.trade_offers)) {
      const isCounter = counters.has(offer.id);
      if (!this.deadlines.has(offer.id)) this.deadlines.set(offer.id, now + this.seconds(s, offer, isCounter) * 1000);
      if (!isCounter && !offer.counter_ids.length) {
        const others = s.player_order.filter((p) => p !== offer.from_player);
        if (others.length && others.every((p) => offer.responses[p] === 'declined')) {
          this.deadlines.set(offer.id, Math.min(this.deadlines.get(offer.id) ?? Infinity, now + GRACE_MS));
        }
      }
    }
  }

  due(now: number): string[] {
    return [...this.deadlines].filter(([, t]) => t <= now).map(([id]) => id);
  }

  next(): number | null {
    let min: number | null = null;
    for (const t of this.deadlines.values()) if (min === null || t < min) min = t;
    return min;
  }
}
