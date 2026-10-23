import { configFromSettings, createGame, addPlayer, startGame, reduce, viewFor, redactEvents, SYSTEM } from '../engine/index.js';
import { botPlan, createBots, actionDelayMs } from '../ai/driver.js';
import { TradeClock } from './clock.js';

export const HUMAN = 'p1';
export const SPEEDS = [0.5, 1, 2, 4, Infinity];
const START_RES = { none: 0, some: 5, plenty: 10 };

/**
 * Single-player transport: the whole game runs in this tab. The UI only talks to
 * subscribe()/send(), so the online transport (WebSocket to a Durable Object) is a drop-in swap.
 */
export class LocalTransport {
  constructor({ settings = {}, name = 'You', numBots = 2, seed, strategy = 'smart', now = () => Date.now(), sleep, log = [], autopilot = false, speed = 1 }) {
    this.settings = settings; this.name = name; this.numBots = numBots; this.seed = seed >>> 0; this.strategy = strategy;
    this.now = now;
    this.sleep = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.cfg = configFromSettings(settings);
    this.listeners = new Set();
    this.actionLog = [];
    this.pumping = false;
    this.destroyed = false;
    this.timer = null;
    this.autopilot = false;
    this.speed = speed >= 1e9 ? Infinity : speed;

    let s = createGame(this.cfg, { game_id: `local-${this.seed.toString(36)}`, seed: this.seed });
    s = addPlayer(this.cfg, s, { name, id: HUMAN });
    const spec = {};
    for (let i = 0; i < numBots; i++) {
      const id = `p${i + 2}`;
      s = addPlayer(this.cfg, s, { name: `Bot ${i + 1}`, id, is_ai: true });
      spec[id] = strategy;
    }
    this.state = startGame(this.cfg, s, { starting_resources: START_RES[settings.starting_resources] ?? 0, randomize_order: true }).state;
    this.bots = createBots(spec);
    this.botRng = { rng: (this.seed ^ 0x9e3779b9) >>> 0 };
    this.clock = new TradeClock(this.cfg);
    this.startEvents = [{ type: 'game_started' }];
    for (const a of log) { const r = reduce(this.cfg, this.state, a); if (r.ok) { this.state = r.state; this.actionLog.push(a); } }
    this.botRng.rng = (this.botRng.rng + this.actionLog.length) >>> 0;
    this.clock.sync(this.state, this.now());
    if (autopilot) this.applyAutopilot(true);
  }

  // Hand the human seat to a bot (or take it back). Not part of the game log: it is a seat setting, not a move.
  applyAutopilot(on) {
    const p = this.state.players[HUMAN];
    this.state = { ...this.state, players: { ...this.state.players, [HUMAN]: { ...p, is_ai: on } } };
    if (on) this.bots[HUMAN] = createBots({ [HUMAN]: this.strategy })[HUMAN];
    else delete this.bots[HUMAN];
    this.autopilot = on;
  }

  setAutopilot(on) {
    if (on === this.autopilot) return;
    this.applyAutopilot(on);
    this.emit([]);
    this.pump();
  }

  setSpeed(x) { this.speed = x; this.emit([]); }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  snapshot(events = [], extra = {}) {
    return {
      view: viewFor(this.cfg, this.state, HUMAN),
      events: redactEvents(events, HUMAN),
      cfg: this.cfg,
      deadlines: Object.fromEntries(this.clock.deadlines),
      now: this.now(),
      autopilot: this.autopilot,
      speed: this.speed,
      ...extra,
    };
  }

  emit(events, extra) {
    const snap = this.snapshot(events, extra);
    for (const fn of this.listeners) fn(snap);
  }

  start() { this.emit([]); this.pump(); }

  apply(action) {
    const r = reduce(this.cfg, this.state, action);
    if (!r.ok) return r;
    this.state = r.state;
    this.actionLog.push(action);
    this.clock.sync(this.state, this.now());
    this.emit(r.events);
    return r;
  }

  /** The human's only way to act. `player_id` is always forced to the human seat. */
  send(type, params = {}) {
    const r = this.apply({ type, player_id: HUMAN, params });
    if (!r.ok) this.emit([], { error: r.error });
    else this.pump();
    return r;
  }

  save() {
    return { v: 1, settings: this.settings, name: this.name, numBots: this.numBots, seed: this.seed, strategy: this.strategy, log: this.actionLog, autopilot: this.autopilot, speed: this.speed };
  }

  destroy() { this.destroyed = true; clearTimeout(this.timer); this.listeners.clear(); }

  async pump() {
    if (this.pumping || this.destroyed) return;
    this.pumping = true;
    let rejected = 0;
    try {
      for (let i = 0; i < 5000 && !this.destroyed; i++) {
        const due = this.clock.due(this.now());
        if (due.length) {
          for (const id of due) this.apply({ type: 'trade_expire', player_id: SYSTEM, params: { trade_id: id } });
          continue;
        }
        const plan = botPlan(this.cfg, this.state, this.bots, this.botRng);
        if (!plan.length) break;
        this.emit([], { thinking: plan[0].player_id });
        const version = this.actionLog.length;
        await this.sleep(this.speed === Infinity ? 0 : actionDelayMs(plan[0]) / this.speed);
        if (this.destroyed) break;
        if (this.actionLog.length !== version) continue; // the human acted while we waited: replan
        for (const a of plan) {
          if (a.player_id !== SYSTEM && !this.bots[a.player_id]) break; // seat was taken back while we waited
          const r = this.apply(a);
          if (!r.ok) { rejected++; console.warn('bot move rejected', r.error, a); }
        }
        if (rejected > 3) break;
      }
    } finally {
      this.pumping = false;
      if (!this.destroyed) {
        this.emit([], { thinking: null });
        const next = this.clock.next();
        clearTimeout(this.timer);
        if (next !== null) this.timer = setTimeout(() => this.pump(), Math.max(50, next - this.now()));
      }
    }
  }
}
