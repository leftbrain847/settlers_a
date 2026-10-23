import { h, sv, mount, inputOf, selectOf } from './dom.ts';
import { applyTheme, THEMES } from './theme.ts';
import { BoardView } from './board-svg.ts';
import type { BoardTap } from './board-svg.ts';
import { LocalTransport, SPEEDS } from '../../../client-sdk/local.ts';
import { describeEvent } from './format.ts';
import { newSeed } from '../engine/index.ts';
import { FIELDS, defaults, toSettings } from './settings.ts';
import type { SettingValue } from './settings.ts';
import * as sheets from './sheets.ts';
import { handOf, isLegal } from './ui-types.ts';
import type { BoardTargets, Kind, Mode, Move, SheetCtx, SheetName, UiState } from './ui-types.ts';
import type { ActionParams, ActionType, GameConfig, GameView, LegalAction, TradeOffer } from '../engine/types.ts';
import type { KeyValueStore, SaveData, Snapshot, Transport, TransportOptions } from '../../../client-sdk/transport.ts';

const SAVE_KEY = 'settlers.save.v1';
const PREF_KEY = 'settlers.prefs.v1';

interface Prefs {
  theme: string; name: string; bots: number; watch: boolean; speed: number;
  values: Record<string, SettingValue>;
}
type Sleep = (ms: number) => Promise<void>;
type MakeTransport = (o: TransportOptions) => Transport;
interface Dom {
  status: HTMLElement; dice: HTMLElement; watch: HTMLElement; speed: HTMLElement; menu: HTMLElement;
  players: HTMLElement; banner: HTMLElement; svg: SVGSVGElement; hand: HTMLElement; actions: HTMLElement;
  toasts: HTMLElement; sheetHost: HTMLElement; overlay: HTMLElement;
}
type SheetSpec =
  | { type: 'discard' | 'steal' | 'yop' | 'monopoly'; title: string; modal: true }
  | { type: 'incoming'; title: string; modal: true; offer: TradeOffer }
  | { type: 'waiting'; title: string; modal: true; offer: TradeOffer; counters: TradeOffer[] }
  | { type: SheetName; title: string; modal?: false };

function safeStorage(): KeyValueStore | null {
  try { const s = window.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch { return null; }
}
// Storage holds only what this app wrote; a corrupt value just falls back to defaults at the call site.
const readJson = <T,>(st: KeyValueStore | null, k: string): T | null => { try { return JSON.parse(st?.getItem(k) ?? 'null') as T | null; } catch { return null; } };
const writeJson = (st: KeyValueStore | null, k: string, v: unknown): void => { try { st?.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: play on */ } };

export interface BootOptions { storage?: KeyValueStore | null; makeTransport?: MakeTransport; autoSleep?: Sleep }

export function boot(root: HTMLElement, { storage = safeStorage(), makeTransport = (o) => new LocalTransport(o), autoSleep }: BootOptions = {}): App {
  const app = new App(root, storage, makeTransport, autoSleep);
  app.showLobby();
  return app;
}

const emptyUi = (): UiState => ({ sheet: null, draft: {}, pending: null, buildMode: null, toasts: [], muteUntilTurn: 0, lastSaved: 0 });

export class App {
  root: HTMLElement;
  storage: KeyValueStore | null;
  makeTransport: MakeTransport;
  sleep: Sleep | undefined;
  prefs: Prefs;
  ui: UiState;
  snap: Snapshot | null;
  t: Transport | null;
  dom!: Dom;
  board!: BoardView;
  mode: Mode | null = null;
  declining = false;

  constructor(root: HTMLElement, storage: KeyValueStore | null, makeTransport: MakeTransport, sleep: Sleep | undefined) {
    this.root = root; this.storage = storage; this.makeTransport = makeTransport; this.sleep = sleep;
    this.prefs = { theme: 'ocean', name: 'You', bots: 2, watch: false, speed: 1, values: defaults(), ...(readJson<Partial<Prefs>>(storage, PREF_KEY) ?? {}) };
    applyTheme(this.prefs.theme);
    this.ui = emptyUi();
    this.snap = null;
    this.t = null;
  }

  /** The active transport; only valid while a game screen is up. */
  get tr(): Transport {
    if (!this.t) throw new Error('No game is running');
    return this.t;
  }

  savePrefs(): void { writeJson(this.storage, PREF_KEY, this.prefs); }

  // ------------------------------------------------------------------ lobby
  showLobby(): void {
    this.t?.destroy(); this.t = null; this.snap = null;
    const p = this.prefs;
    const saved = readJson<SaveData>(this.storage, SAVE_KEY);
    const fieldEls = FIELDS.map((f) => {
      if ('group' in f) return h('h4.group', f.group);
      const val = p.values[f.key] ?? f.def;
      let input: HTMLElement;
      if (f.type === 'select') input = h('select', { onchange: (e) => { p.values[f.key] = selectOf(e).value; } }, f.options.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
      else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!val, onchange: (e) => { p.values[f.key] = inputOf(e).checked; } });
      else if (f.type === 'range') {
        const out = h('span.dim.small', f.fmt(Number(val)));
        input = h('div.rangewrap', h('input', { type: 'range', min: f.min, max: f.max, value: val, oninput: (e) => { const n = Number(inputOf(e).value); p.values[f.key] = n; out.textContent = f.fmt(n); } }), out);
      } else input = h('input', { type: 'number', inputmode: 'numeric', min: f.min, max: f.max, value: val, onchange: (e) => { const el = inputOf(e); const v = Math.min(f.max, Math.max(f.min, Number(el.value) || f.def)); p.values[f.key] = v; el.value = String(v); } });
      return h('label.field', h('span', f.label), input);
    });

    const lobby = h('div.lobby',
      h('h1', 'Settlers'),
      h('p.dim', 'Play against bots. Hosting games with friends comes next.'),
      h('div.card.form',
        h('label.field', h('span', 'Your name'), h('input#name', { type: 'text', value: p.name, maxlength: 16, onchange: (e) => { p.name = inputOf(e).value.trim() || 'You'; } })),
        h('label.field', h('span', 'Bot opponents'), h('select#bots', { onchange: (e) => { p.bots = Number(selectOf(e).value); } }, [1, 2, 3].map((n) => h('option', { value: n, selected: n === p.bots }, `${n} bot${n > 1 ? 's' : ''}`)))),
        h('label.field.check', h('input#watch', { type: 'checkbox', checked: !!p.watch, onchange: (e) => { p.watch = inputOf(e).checked; } }), h('span', 'Watch only: a bot plays my seat too')),
        h('label.field', h('span', 'Color theme'), h('select#theme', { onchange: (e) => { p.theme = applyTheme(selectOf(e).value); } }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k, selected: k === p.theme }, t.label)))),
        h('details.settings', h('summary', 'Game settings'), ...fieldEls,
          h('button.btn.small', { type: 'button', onclick: () => { p.values = defaults(); this.savePrefs(); this.showLobby(); } }, 'Reset to defaults')),
        h('button.btn.primary.big#start', { onclick: () => this.start() }, 'Start game'),
        saved ? h('button.btn#resume', { onclick: () => this.resume(saved) }, 'Resume saved game') : null));
    mount(this.root, lobby);
  }

  start(): void {
    const p = this.prefs;
    this.savePrefs();
    this.launch({ settings: toSettings(p.values), name: p.name, numBots: p.bots, seed: newSeed(), autopilot: p.watch, speed: p.speed });
  }

  resume(saved: SaveData): void {
    this.launch({ settings: saved.settings, name: saved.name, numBots: saved.numBots, seed: saved.seed, strategy: saved.strategy, log: saved.log, autopilot: saved.autopilot, speed: this.prefs.speed });
  }

  launch(opts: Omit<TransportOptions, 'sleep'>): void {
    const t = this.makeTransport({ ...opts, sleep: this.sleep });
    this.t = t;
    this.ui = emptyUi();
    this.buildGameDom();
    t.subscribe((snap) => this.onSnapshot(snap));
    t.start();
  }

  // ------------------------------------------------------------------ game dom
  buildGameDom(): void {
    const svg = sv<SVGSVGElement>('svg#board', { xmlns: 'http://www.w3.org/2000/svg', preserveAspectRatio: 'xMidYMid meet' });
    this.dom = {
      status: h('div.status'), dice: h('div.dice'), watch: h('button.pill#watch', { onclick: () => this.tr.setAutopilot(!this.snap?.autopilot) }), speed: h('button.pill#speed', { 'aria-label': 'Playback speed', onclick: () => this.cycleSpeed() }), menu: h('button.icon#menu', { 'aria-label': 'Menu', onclick: () => this.openSheet('menu') }, '☰'),
      players: h('div.players'), banner: h('div.banner'), svg, hand: h('div.hand'), actions: h('div.actions'),
      toasts: h('div.toasts'), sheetHost: h('div.sheet-host'), overlay: h('div.overlay'),
    };
    this.board = new BoardView(svg, { onTap: (t) => this.onBoardTap(t) });
    mount(this.root,
      h('div.game',
        h('div.top', this.dom.status, this.dom.dice, this.dom.watch, this.dom.speed, this.dom.menu),
        this.dom.players,
        h('div.boardwrap', svg, this.dom.banner, this.dom.toasts),
        h('div.dock', this.dom.hand, this.dom.actions),
        this.dom.sheetHost, this.dom.overlay));
  }

  send = <T extends ActionType>(type: T, params?: ActionParams[T]): void => { this.tr.send(type, params); };

  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.snap?.speed ?? 1);
    const next = SPEEDS[(i + 1) % SPEEDS.length];
    this.prefs.speed = next === Infinity ? 1e9 : next;
    this.savePrefs();
    this.tr.setSpeed(next);
  }

  openSheet(type: SheetName): void { this.ui.sheet = this.ui.sheet === type ? null : type; this.render(); }

  onBoardTap({ kind, id }: BoardTap): void {
    const mode = this.mode;
    if (mode && mode.kind === kind && mode.ids.has(id)) this.ui.pending = { kind, id };
    else this.ui.pending = null;
    this.render();
  }

  // ------------------------------------------------------------------ snapshots
  onSnapshot(snap: Snapshot): void {
    this.snap = snap;
    const v = snap.view;
    for (const ev of snap.events) {
      const text = describeEvent(ev, v, snap.cfg);
      if (text && ev.type !== 'turn_started') this.toast(text);
    }
    if (snap.error) this.toast(snap.error, true);
    if (snap.events.length) this.persist();
    // Leaving a decision resets any half-made choice.
    if (this.ui.pending && !this.targetsFor(v, snap.cfg)?.ids.has(this.ui.pending.id)) this.ui.pending = null;
    if (this.ui.buildMode && !v.legal_actions.filter(isLegal('build')).some((a) => a.building_type === this.ui.buildMode)) this.ui.buildMode = null;
    this.autoDecline(v);
    this.render();
  }

  persist(): void {
    if (!this.storage || !this.t?.save || !this.snap) return;
    const v = this.snap.view;
    if (v.phase === 'finished') { try { this.storage.removeItem(SAVE_KEY); } catch { /* ignore */ } } else writeJson(this.storage, SAVE_KEY, this.t.save());
  }

  toast(text: string, bad = false): void {
    const item = { text, bad, id: Math.random() };
    this.ui.toasts.push(item);
    if (this.ui.toasts.length > 3) this.ui.toasts.shift();
    setTimeout(() => { this.ui.toasts = this.ui.toasts.filter((t) => t !== item); if (this.dom && this.snap) this.renderToasts(); }, 3200);
  }

  autoDecline(v: GameView): void {
    if (!this.ui.muteUntilTurn || v.turn_number >= this.ui.muteUntilTurn || this.declining) return;
    const t = this.trades(v).incoming[0];
    if (!t) return;
    this.declining = true;
    queueMicrotask(() => { this.declining = false; this.send('trade_respond', { trade_id: t.id, response: 'decline' }); });
  }

  // ------------------------------------------------------------------ derived UI state
  trades(v: GameView): { mine: TradeOffer[]; incoming: TradeOffer[]; countersToMe: TradeOffer[] } {
    const counters = new Set(Object.values(v.trade_offers).flatMap((o) => o.counter_ids));
    const out: { mine: TradeOffer[]; incoming: TradeOffer[]; countersToMe: TradeOffer[] } = { mine: [], incoming: [], countersToMe: [] };
    for (const o of Object.values(v.trade_offers)) {
      const isCounter = counters.has(o.id);
      if (o.from_player === v.me) { if (!isCounter) out.mine.push(o); } else if (isCounter) { if (v.current_player === v.me) out.countersToMe.push(o); } else if (!(v.me in o.responses)) out.incoming.push(o);
    }
    return out;
  }

  targetsFor(v: GameView, cfg: GameConfig): Mode | null {
    if (this.snap?.autopilot) return null;
    const legal = v.legal_actions;
    const myTurn = v.current_player === v.me;
    const fromBuild = (list: Extract<LegalAction, { type: 'build' }>[], bt: string): Mode => {
      const kind: Kind = cfg.building_types[bt].placement.location_type === 'edge' ? 'e' : 'i';
      return { kind, ids: new Set(list.map((a) => a.location)), piece: bt, apply: (id): Move => ['build', { building_type: bt, location: id }], label: `Place ${cfg.building_types[bt].name.toLowerCase()} here` };
    };
    if (v.phase === 'setup') {
      const b = legal.filter(isLegal('build'));
      return b.length ? fromBuild(b, b[0].building_type) : null;
    }
    if (v.phase !== 'playing' || !myTurn) return null;
    if (v.pending_robber_move) {
      return { kind: 'h', ids: new Set(legal.filter(isLegal('move_robber')).map((a) => a.hex_id)), apply: (id): Move => ['move_robber', { hex_id: id }], label: 'Move the robber here' };
    }
    if (v.pending_action?.type === 'build_free_roads') {
      const spots = legal.filter(isLegal('dev_card_action')).filter((a) => a.location !== undefined && a.location !== -1);
      return { kind: 'e', ids: new Set(spots.map((a) => a.location as number)), piece: 'road', apply: (id): Move => ['dev_card_action', { location: id }], label: 'Build free road here' };
    }
    const bm = this.ui.buildMode;
    if (bm) return fromBuild(legal.filter(isLegal('build')).filter((a) => a.building_type === bm), bm);
    return null;
  }

  bannerText(v: GameView, _cfg: GameConfig, thinking: string | null | undefined): string {
    const name = (id: string | null): string | null => (id === null ? undefined : v.players[id]?.name) ?? id;
    if (v.phase === 'finished') return `${name(v.winner)} wins!`;
    const discarding = Object.keys(v.pending_discards);
    if (v.pending_discards[v.me]) return `Discard ${v.pending_discards[v.me]} cards`;
    if (discarding.length) return `Waiting for ${discarding.map((id) => name(id)).join(', ')} to discard`;
    if (this.snap?.autopilot) return thinking || v.current_player !== v.me ? `Watching \u2014 ${name(v.current_player)} is playing\u2026` : 'Watching';
    const me = v.current_player === v.me;
    if (v.phase === 'setup') {
      const st = v.setup;
      if (!me) return `${name(v.current_player)} is placing…`;
      return st.settlements_placed < 1 ? 'Place a settlement' : 'Place a road next to it';
    }
    if (!me) return thinking ? `${name(v.current_player)} is playing…` : `${name(v.current_player)}'s turn`;
    if (v.pending_robber_move) return 'Move the robber';
    if (v.pending_robber_steal) return 'Choose who to steal from';
    if (v.pending_action?.type === 'build_free_roads') return `Build ${v.pending_action.remaining} free road${v.pending_action.remaining > 1 ? 's' : ''}`;
    if (v.pending_action) return 'Finish your card';
    if (!v.dice_rolled) return 'Your turn — roll the dice';
    if (this.ui.buildMode) return 'Tap a highlighted spot';
    return 'Your turn';
  }

  // ------------------------------------------------------------------ render
  render(): void {
    if (!this.snap || !this.dom) return;
    const { view: v, cfg } = this.snap;
    this.mode = this.targetsFor(v, cfg);
    const ghost = this.mode && this.ui.pending ? { kind: this.mode.kind, id: this.ui.pending.id, type: this.mode.piece, player: v.me } : null;
    const targets: BoardTargets = {};
    if (this.mode) { targets[this.mode.kind] = this.mode.ids; targets.ghost = ghost; }
    this.board.update(v, cfg, targets);

    const me = v.players[v.me];
    this.dom.status.textContent = v.phase === 'setup' ? 'Setup' : v.phase === 'finished' ? 'Game over' : `Turn ${v.turn_number}`;
    mount(this.dom.dice, ...(v.last_roll ? v.last_roll.map((n) => h('span.die', n)) : [h('span.die.off', '•'), h('span.die.off', '•')]), v.last_roll ? h('span.dice-total', v.last_roll.reduce((a, b) => a + b, 0)) : null);

    mount(this.dom.players, ...v.player_order.map((id, i) => {
      const p = v.players[id];
      const badges = p.achievements.map((a) => h('span.badge', { title: cfg.achievements[a]?.name }, a === 'longest_road' ? 'LR' : a === 'largest_army' ? 'LA' : '★'));
      const knights = p.played_dev_cards.filter((c) => cfg.dev_card_types[c]?.persistent_tag === 'knight').length;
      return h('div.pchip' + (id === v.current_player && v.phase !== 'finished' ? '.active' : '') + (id === v.me ? '.me' : ''), { style: { '--pc': `var(--p${i})` } },
        h('span.dot'), h('span.pname', id === v.me ? `${p.name} (you)` : p.name), h('span.pvp', `${p.vp} VP`),
        h('span.pmeta', `${p.resource_count} cards · ${p.dev_card_count} dev${knights ? ` · ${knights} knight${knights > 1 ? 's' : ''}` : ''}`), ...badges);
    }));

    const fmtSpeed = (x: number): string => (x === Infinity || x >= 1e9 ? 'Max' : `${x}x`);
    this.dom.watch.textContent = this.snap.autopilot ? 'Take over' : 'Watch';
    this.dom.watch.classList.toggle('on', !!this.snap.autopilot);
    this.dom.speed.textContent = fmtSpeed(this.snap.speed);
    this.dom.banner.textContent = this.bannerText(v, cfg, this.snap.thinking);
    this.dom.banner.classList.toggle('urgent', v.current_player === v.me && v.phase !== 'finished');
    this.renderToasts();

    mount(this.dom.hand, ...Object.keys(cfg.resource_types).map((r) => h('div.hcard', { style: { '--c': `var(--r-${r})` } }, h('span.hn', handOf(me)[r] ?? 0), h('span.hl', cfg.resource_types[r].name))),
      h('div.hcard.dev', h('span.hn', me.dev_card_count), h('span.hl', 'Dev')));

    this.renderActions(v, cfg);
    this.renderSheet(v, cfg);
    this.renderOverlay(v, cfg);
  }

  renderToasts(): void {
    mount(this.dom.toasts, ...this.ui.toasts.map((t) => h('div.toast' + (t.bad ? '.bad' : ''), t.text)));
  }

  renderActions(v: GameView, _cfg: GameConfig): void {
    const legal = v.legal_actions;
    const has = (t: LegalAction['type']): boolean => legal.some((a) => a.type === t);
    const btns: HTMLElement[] = [];
    const b = (label: string, onclick: () => void, o: { primary?: boolean; cls?: string; disabled?: boolean } = {}): void => { btns.push(h('button.btn' + (o.primary ? '.primary' : '') + (o.cls ? '.' + o.cls : ''), { onclick, disabled: o.disabled }, label)); };

    if (v.phase === 'finished') { mount(this.dom.actions); return; }
    if (this.snap?.autopilot) { b('Take over my seat', () => this.tr.setAutopilot(false), { primary: true }); mount(this.dom.actions, ...btns); return; }
    const mode = this.mode;
    const pending = this.ui.pending;
    if (pending && mode) {
      b('Confirm', () => { const [type, params] = mode.apply(pending.id); this.ui.pending = null; this.ui.buildMode = null; this.tr.send(type, params); }, { primary: true });
      b('Cancel', () => { this.ui.pending = null; this.render(); });
    } else if (this.ui.buildMode) {
      b('Cancel building', () => { this.ui.buildMode = null; this.render(); });
    } else if (v.pending_action?.type === 'build_free_roads' && v.current_player === v.me) {
      if (legal.filter(isLegal('dev_card_action')).some((a) => a.skip)) b('Skip', () => this.send('dev_card_action', { skip: true, location: -1 }), { primary: true });
    } else if (v.phase === 'playing' && v.current_player === v.me && !v.pending_robber_move && !v.pending_robber_steal && !v.pending_action && !Object.keys(v.pending_discards).length) {
      if (!v.dice_rolled) {
        b('Roll dice', () => this.send('roll_dice'), { primary: true, cls: 'big' });
        if (has('play_dev_card')) b('Dev cards', () => this.openSheet('dev'));
      } else {
        b('Build', () => this.openSheet('build'), { disabled: !(has('build') || has('buy_dev_card')) });
        b('Trade', () => this.openSheet('trade'));
        b(`Dev (${v.players[v.me].dev_card_count})`, () => this.openSheet('dev'), { disabled: !v.players[v.me].dev_card_count });
        b('End turn', () => { this.ui.sheet = null; this.send('end_turn'); }, { primary: true });
      }
    } else if (v.players[v.me].dev_card_count) {
      b(`Dev (${v.players[v.me].dev_card_count})`, () => this.openSheet('dev'));
    }
    mount(this.dom.actions, ...btns);
  }

  autoSheet(v: GameView): SheetSpec | null {
    if (v.phase === 'finished' || this.snap?.autopilot) return null;
    if (v.pending_discards[v.me]) return { type: 'discard', title: 'Discard cards', modal: true };
    const myTurn = v.current_player === v.me;
    if (myTurn && v.pending_robber_steal) return { type: 'steal', title: 'Steal from', modal: true };
    if (myTurn && v.pending_action?.type === 'choose_resources') return { type: 'yop', title: 'Year of Plenty', modal: true };
    if (myTurn && v.pending_action?.type === 'choose_monopoly_resource') return { type: 'monopoly', title: 'Monopoly', modal: true };
    const t = this.trades(v);
    if (t.incoming.length && !(this.ui.muteUntilTurn && v.turn_number < this.ui.muteUntilTurn)) return { type: 'incoming', title: 'Trade offer', modal: true, offer: t.incoming[0] };
    if (t.mine.length) return { type: 'waiting', title: 'Your offer', modal: true, offer: t.mine[0], counters: t.countersToMe };
    return null;
  }

  renderSheet(v: GameView, cfg: GameConfig): void {
    if (!this.snap) return;
    const titles: Record<SheetName, string> = { build: 'Build', trade: 'Trade', dev: 'Development cards', log: 'Game log', menu: 'Menu' };
    const chosen: SheetSpec | null = this.autoSheet(v) ?? (this.ui.sheet ? { type: this.ui.sheet, title: titles[this.ui.sheet] } : null);
    if (!chosen) { mount(this.dom.sheetHost); return; }
    const ctx: SheetCtx = { view: v, cfg, ui: this.ui, snap: this.snap, send: this.send, rerender: () => this.render() };
    const body = sheets.withCtx(ctx, (): HTMLElement => {
      switch (chosen.type) {
        case 'discard': return sheets.discardSheet(ctx);
        case 'steal': return sheets.stealSheet(ctx);
        case 'yop': return sheets.yopSheet(ctx);
        case 'monopoly': return sheets.monopolySheet(ctx);
        case 'incoming': return sheets.incomingSheet({ ...ctx, offer: chosen.offer });
        case 'waiting': return sheets.waitingSheet({ ...ctx, offer: chosen.offer, counters: chosen.counters });
        case 'build': return sheets.buildSheet(ctx);
        case 'dev': return sheets.devSheet(ctx);
        case 'trade': return sheets.tradeSheet(ctx);
        case 'log': return sheets.logSheet(ctx);
        case 'menu': return this.menuSheet(v, cfg);
      }
    });
    mount(this.dom.sheetHost,
      h('div.backdrop' + (chosen.modal ? '.modal' : ''), { onclick: () => { if (!chosen.modal) { this.ui.sheet = null; this.render(); } } }),
      h('div.sheet', { role: 'dialog', 'aria-label': chosen.title },
        h('div.sheet-head', h('strong', chosen.title), chosen.modal ? null : h('button.icon', { 'aria-label': 'Close', onclick: () => { this.ui.sheet = null; this.render(); } }, '✕')),
        h('div.sheet-body', body)));
  }

  menuSheet(v: GameView, cfg: GameConfig): HTMLElement {
    return h('div.list',
      h('label.field', h('span', 'Color theme'), h('select', { onchange: (e) => { this.prefs.theme = applyTheme(selectOf(e).value); this.savePrefs(); } }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k, selected: k === this.prefs.theme }, t.label)))),
      h('button.btn', { onclick: () => { this.ui.sheet = 'log'; this.render(); } }, 'Game log'),
      h('button.btn', { onclick: () => { this.board.resetZoom(); this.ui.sheet = null; this.render(); } }, 'Reset board zoom'),
      h('p.dim.small', `${cfg.name} · ${cfg.win_conditions[0]?.params.threshold} VP to win · ${v.board.rings} rings`),
      h('button.btn.danger', { onclick: () => { if (this.ui.confirmLeave) this.showLobby(); else { this.ui.confirmLeave = true; this.render(); } } }, this.ui.confirmLeave ? 'Tap again to leave (progress is saved)' : 'Leave game'));
  }

  renderOverlay(v: GameView, _cfg: GameConfig): void {
    if (v.phase !== 'finished') { mount(this.dom.overlay); return; }
    const rows = [...v.player_order].sort((a, b) => v.players[b].vp - v.players[a].vp).map((id) => h('div.score' + (id === v.winner ? '.win' : ''), h('span', v.players[id].name), h('strong', `${v.players[id].vp} VP`)));
    mount(this.dom.overlay, h('div.winner', h('h2', v.winner === v.me ? 'You win!' : `${v.winner ? v.players[v.winner].name : ''} wins`), ...rows, h('button.btn.primary.big', { onclick: () => this.showLobby() }, 'New game')));
  }
}
