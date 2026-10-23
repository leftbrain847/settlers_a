// Trade timers live here, not in the engine. The room feeds it every new state; whoever owns real time
// (setTimeout locally, a Durable Object alarm on Cloudflare) asks which offers are due and submits
// a SYSTEM trade_expire for each.

export const GRACE_MS = 1500; // let the offerer see "everyone declined" before the offer disappears

export class TradeClock {
  constructor(cfg) {
    this.cfg = cfg;
    this.deadlines = new Map();
  }

  seconds(s, offer, isCounter) {
    const t = this.cfg.trade_rules;
    if (isCounter) return t.counter_timer;
    return s.players[offer.from_player]?.is_ai ? t.bot_offer_timer : t.human_response_timer;
  }

  sync(s, now) {
    const counters = new Set(Object.values(s.trade_offers).flatMap((o) => o.counter_ids));
    for (const id of [...this.deadlines.keys()]) if (!(id in s.trade_offers)) this.deadlines.delete(id);
    for (const offer of Object.values(s.trade_offers)) {
      const isCounter = counters.has(offer.id);
      if (!this.deadlines.has(offer.id)) this.deadlines.set(offer.id, now + this.seconds(s, offer, isCounter) * 1000);
      if (!isCounter && !offer.counter_ids.length) {
        const others = s.player_order.filter((p) => p !== offer.from_player);
        if (others.length && others.every((p) => offer.responses[p] === 'declined')) {
          this.deadlines.set(offer.id, Math.min(this.deadlines.get(offer.id), now + GRACE_MS));
        }
      }
    }
  }

  due(now) {
    return [...this.deadlines].filter(([, t]) => t <= now).map(([id]) => id);
  }

  next() {
    let min = null;
    for (const t of this.deadlines.values()) if (min === null || t < min) min = t;
    return min;
  }
}
