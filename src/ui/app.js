import { h, mount, clear } from './dom.js';
import { applyTheme, THEMES } from './theme.js';
import { BoardView } from './board-svg.js';
import { LocalTransport, SPEEDS } from '../transport/local.js';
import { describeEvent } from './format.js';
import { newSeed } from '../engine/index.js';
import { FIELDS, defaults, toSettings } from './settings.js';
import * as sheets from './sheets.js';

const SAVE_KEY = 'settlers.save.v1';
const PREF_KEY = 'settlers.prefs.v1';

function safeStorage() {
  try { const s = window.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch { return null; }
}
const readJson = (st, k) => { try { return JSON.parse(st?.getItem(k) ?? 'null'); } catch { return null; } };
const writeJson = (st, k, v) => { try { st?.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: play on */ } };

export function boot(root, { storage = safeStorage(), makeTransport = (o) => new LocalTransport(o), autoSleep } = {}) {
  const app = new App(root, storage, makeTransport, autoSleep);
  app.showLobby();
  return app;
}

class App {
  constructor(root, storage, makeTransport, sleep) {
    this.root = root; this.storage = storage; this.makeTransport = makeTransport; this.sleep = sleep;
    this.prefs = { theme: 'ocean', name: 'You', bots: 2, watch: false, speed: 1, values: defaults(), ...(readJson(storage, PREF_KEY) ?? {}) };
    applyTheme(this.prefs.theme);
    this.ui = null;
    this.snap = null;
    this.t = null;
  }

  savePrefs() { writeJson(this.storage, PREF_KEY, this.prefs); }

  // ------------------------------------------------------------------ lobby
  showLobby() {
    this.t?.destroy(); this.t = null; this.snap = null;
    const p = this.prefs;
    const saved = readJson(this.storage, SAVE_KEY);
    const inputs = {};
    const fieldEls = FIELDS.map((f) => {
      if (f.group) return h('h4.group', f.group);
      const val = p.values[f.key] ?? f.def;
      let input;
      if (f.type === 'select') input = h('select', { onchange: (e) => { p.values[f.key] = e.target.value; } }, f.options.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
      else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!val, onchange: (e) => { p.values[f.key] = e.target.checked; } });
      else if (f.type === 'range') {
        const out = h('span.dim.small', f.fmt(val));
        input = h('div.rangewrap', h('input', { type: 'range', min: f.min, max: f.max, value: val, oninput: (e) => { p.values[f.key] = Number(e.target.value); out.textContent = f.fmt(p.values[f.key]); } }), out);
      } else input = h('input', { type: 'number', inputmode: 'numeric', min: f.min, max: f.max, value: val, onchange: (e) => { const v = Math.min(f.max, Math.max(f.min, Number(e.target.value) || f.def)); p.values[f.key] = v; e.target.value = v; } });
      inputs[f.key] = input;
      return h('label.field', h('span', f.label), input);
    });

    const view = h('div.lobby',
      h('h1', 'Settlers'),
      h('p.dim', 'Play against bots. Hosting games with friends comes next.'),
      h('div.card.form',
        h('label.field', h('span', 'Your name'), h('input#name', { type: 'text', value: p.name, maxlength: 16, onchange: (e) => { p.name = e.target.value.trim() || 'You'; } })),
        h('label.field', h('span', 'Bot opponents'), h('select#bots', { onchange: (e) => { p.bots = Number(e.target.value); } }, [1, 2, 3].map((n) => h('option', { value: n, selected: n === p.bots }, `${n} bot${n > 1 ? 's' : ''}`)))),
        h('label.field.check', h('input#watch', { type: 'checkbox', checked: !!p.watch, onchange: (e) => { p.watch = e.target.checked; } }), h('span', 'Watch only: a bot plays my seat too')),
        h('label.field', h('span', 'Color theme'), h('select#theme', { onchange: (e) => { p.theme = applyTheme(e.target.value); } }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k, selected: k === p.theme }, t.label)))),
        h('details.settings', h('summary', 'Game settings'), ...fieldEls,
          h('button.btn.small', { type: 'button', onclick: () => { p.values = defaults(); this.savePrefs(); this.showLobby(); } }, 'Reset to defaults')),
        h('button.btn.primary.big#start', { onclick: () => this.start() }, 'Start game'),
        saved ? h('button.btn#resume', { onclick: () => this.resume(saved) }, 'Resume saved game') : null));
    mount(this.root, view);
  }

  start() {
    const p = this.prefs;
    this.savePrefs();
    this.launch({ settings: toSettings(p.values), name: p.name, numBots: p.bots, seed: newSeed(), autopilot: p.watch, speed: p.speed });
  }

  resume(saved) {
    this.launch({ settings: saved.settings, name: saved.name, numBots: saved.numBots, seed: saved.seed, strategy: saved.strategy, log: saved.log, autopilot: saved.autopilot, speed: this.prefs.speed });
  }

  launch(opts) {
    this.t = this.makeTransport({ ...opts, sleep: this.sleep });
    this.ui = { sheet: null, draft: {}, pending: null, buildMode: null, toasts: [], muteUntilTurn: 0, lastSaved: 0 };
    this.buildGameDom();
    this.t.subscribe((snap) => this.onSnapshot(snap));
    this.t.start();
  }

  // ------------------------------------------------------------------ game dom
  buildGameDom() {
    const svg = h('svg#board', { xmlns: 'http://www.w3.org/2000/svg', preserveAspectRatio: 'xMidYMid meet' });
    this.dom = {
      status: h('div.status'), dice: h('div.dice'), watch: h('button.pill#watch', { onclick: () => this.t.setAutopilot(!this.snap.autopilot) }), speed: h('button.pill#speed', { 'aria-label': 'Playback speed', onclick: () => this.cycleSpeed() }), menu: h('button.icon#menu', { 'aria-label': 'Menu', onclick: () => this.openSheet('menu') }, '☰'),
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

  send = (type, params) => this.t.send(type, params);

  cycleSpeed() {
    const i = SPEEDS.indexOf(this.snap.speed);
    const next = SPEEDS[(i + 1) % SPEEDS.length];
    this.prefs.speed = next === Infinity ? 1e9 : next;
    this.savePrefs();
    this.t.setSpeed(next);
  }

  openSheet(type) { this.ui.sheet = this.ui.sheet === type ? null : type; this.render(); }

  onBoardTap({ kind, id }) {
    const mode = this.mode;
    if (mode && mode.kind === kind && mode.ids.has(id)) this.ui.pending = { kind, id };
    else this.ui.pending = null;
    this.render();
  }

  // ------------------------------------------------------------------ snapshots
  onSnapshot(snap) {
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
    if (this.ui.buildMode && !v.legal_actions.some((a) => a.type === 'build' && a.building_type === this.ui.buildMode)) this.ui.buildMode = null;
    this.autoDecline(v);
    this.render();
  }

  persist() {
    if (!this.storage || !this.t?.save) return;
    const v = this.snap.view;
    if (v.phase === 'finished') { try { this.storage.removeItem(SAVE_KEY); } catch { /* ignore */ } } else writeJson(this.storage, SAVE_KEY, this.t.save());
  }

  toast(text, bad = false) {
    const item = { text, bad, id: Math.random() };
    this.ui.toasts.push(item);
    if (this.ui.toasts.length > 3) this.ui.toasts.shift();
    setTimeout(() => { this.ui.toasts = this.ui.toasts.filter((t) => t !== item); if (this.dom && this.snap) this.renderToasts(); }, 3200);
  }

  autoDecline(v) {
    if (!this.ui.muteUntilTurn || v.turn_number >= this.ui.muteUntilTurn || this.declining) return;
    const t = this.trades(v).incoming[0];
    if (!t) return;
    this.declining = true;
    queueMicrotask(() => { this.declining = false; this.send('trade_respond', { trade_id: t.id, response: 'decline' }); });
  }

  // ------------------------------------------------------------------ derived UI state
  trades(v) {
    const counters = new Set(Object.values(v.trade_offers).flatMap((o) => o.counter_ids));
    const out = { mine: [], incoming: [], countersToMe: [] };
    for (const o of Object.values(v.trade_offers)) {
      const isCounter = counters.has(o.id);
      if (o.from_player === v.me) { if (!isCounter) out.mine.push(o); } else if (isCounter) { if (v.current_player === v.me) out.countersToMe.push(o); } else if (!(v.me in o.responses)) out.incoming.push(o);
    }
    return out;
  }

  targetsFor(v, cfg) {
    if (this.snap?.autopilot) return null;
    const legal = v.legal_actions;
    const myTurn = v.current_player === v.me;
    const fromBuild = (list, bt) => {
      const loc = cfg.building_types[bt].placement.location_type === 'edge' ? 'e' : 'i';
      return { kind: loc, ids: new Set(list.map((a) => a.location)), piece: bt, apply: (id) => ['build', { building_type: bt, location: id }], label: `Place ${cfg.building_types[bt].name.toLowerCase()} here` };
    };
    if (v.phase === 'setup') {
      const b = legal.filter((a) => a.type === 'build');
      return b.length ? fromBuild(b, b[0].building_type) : null;
    }
    if (v.phase !== 'playing' || !myTurn) return null;
    if (v.pending_robber_move) {
      return { kind: 'h', ids: new Set(legal.filter((a) => a.type === 'move_robber').map((a) => a.hex_id)), apply: (id) => ['move_robber', { hex_id: id }], label: 'Move the robber here' };
    }
    if (v.pending_action?.type === 'build_free_roads') {
      const spots = legal.filter((a) => a.type === 'dev_card_action' && a.location !== -1);
      return { kind: 'e', ids: new Set(spots.map((a) => a.location)), piece: 'road', apply: (id) => ['dev_card_action', { location: id }], label: 'Build free road here' };
    }
    if (this.ui.buildMode) return fromBuild(legal.filter((a) => a.type === 'build' && a.building_type === this.ui.buildMode), this.ui.buildMode);
    return null;
  }

  bannerText(v, cfg, thinking) {
    const name = (id) => v.players[id]?.name ?? id;
    if (v.phase === 'finished') return `${name(v.winner)} wins!`;
    const discarding = Object.keys(v.pending_discards);
    if (v.pending_discards[v.me]) return `Discard ${v.pending_discards[v.me]} cards`;
    if (discarding.length) return `Waiting for ${discarding.map(name).join(', ')} to discard`;
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
  render() {
    if (!this.snap || !this.dom) return;
    const { view: v, cfg } = this.snap;
    this.mode = this.targetsFor(v, cfg);
    const ghost = this.mode && this.ui.pending ? { kind: this.mode.kind, id: this.ui.pending.id, type: this.mode.piece, player: v.me } : null;
    const targets = this.mode ? { [this.mode.kind]: this.mode.ids, ghost } : {};
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

    const fmtSpeed = (x) => (x === Infinity || x >= 1e9 ? 'Max' : `${x}x`);
    this.dom.watch.textContent = this.snap.autopilot ? 'Take over' : 'Watch';
    this.dom.watch.classList.toggle('on', !!this.snap.autopilot);
    this.dom.speed.textContent = fmtSpeed(this.snap.speed);
    this.dom.banner.textContent = this.bannerText(v, cfg, this.snap.thinking);
    this.dom.banner.classList.toggle('urgent', v.current_player === v.me && v.phase !== 'finished');
    this.renderToasts();

    mount(this.dom.hand, ...Object.keys(cfg.resource_types).map((r) => h('div.hcard', { style: { '--c': `var(--r-${r})` } }, h('span.hn', me.resources[r] ?? 0), h('span.hl', cfg.resource_types[r].name))),
      h('div.hcard.dev', h('span.hn', me.dev_card_count), h('span.hl', 'Dev')));

    this.renderActions(v, cfg);
    this.renderSheet(v, cfg);
    this.renderOverlay(v, cfg);
  }

  renderToasts() {
    mount(this.dom.toasts, ...this.ui.toasts.map((t) => h('div.toast' + (t.bad ? '.bad' : ''), t.text)));
  }

  renderActions(v, cfg) {
    const legal = v.legal_actions;
    const has = (t) => legal.some((a) => a.type === t);
    const btns = [];
    const b = (label, onclick, o = {}) => btns.push(h('button.btn' + (o.primary ? '.primary' : '') + (o.cls ? '.' + o.cls : ''), { onclick, disabled: o.disabled }, label));

    if (v.phase === 'finished') { mount(this.dom.actions); return; }
    if (this.snap.autopilot) { b('Take over my seat', () => this.t.setAutopilot(false), { primary: true }); mount(this.dom.actions, ...btns); return; }
    const sel = this.ui.pending && this.mode;
    if (sel) {
      b('Confirm', () => { const [type, params] = this.mode.apply(this.ui.pending.id); this.ui.pending = null; this.ui.buildMode = null; this.send(type, params); }, { primary: true });
      b('Cancel', () => { this.ui.pending = null; this.render(); });
    } else if (this.ui.buildMode) {
      b('Cancel building', () => { this.ui.buildMode = null; this.render(); });
    } else if (v.pending_action?.type === 'build_free_roads' && v.current_player === v.me) {
      if (legal.some((a) => a.type === 'dev_card_action' && a.skip)) b('Skip', () => this.send('dev_card_action', { skip: true, location: -1 }), { primary: true });
    } else if (v.phase === 'playing' && v.current_player === v.me && !v.pending_robber_move && !v.pending_robber_steal && !v.pending_action && !Object.keys(v.pending_discards).length) {
      if (!v.dice_rolled) {
        b('Roll dice', () => this.send('roll_dice'), { primary: true, cls: 'big' });
        if (has('play_dev_card')) b('Dev cards', () => this.openSheet('dev'));
      } else {
        b('Build', () => this.openSheet('build'), { disabled: !legal.some((a) => a.type === 'build' || a.type === 'buy_dev_card') });
        b('Trade', () => this.openSheet('trade'));
        b(`Dev (${v.players[v.me].dev_card_count})`, () => this.openSheet('dev'), { disabled: !v.players[v.me].dev_card_count });
        b('End turn', () => { this.ui.sheet = null; this.send('end_turn'); }, { primary: true });
      }
    } else if (v.players[v.me].dev_card_count) {
      b(`Dev (${v.players[v.me].dev_card_count})`, () => this.openSheet('dev'));
    }
    mount(this.dom.actions, ...btns);
  }

  autoSheet(v) {
    if (v.phase === 'finished' || this.snap.autopilot) return null;
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

  renderSheet(v, cfg) {
    const auto = this.autoSheet(v);
    const chosen = auto ?? (this.ui.sheet ? { type: this.ui.sheet, title: { build: 'Build', trade: 'Trade', dev: 'Development cards', log: 'Game log', menu: 'Menu' }[this.ui.sheet] } : null);
    if (!chosen) { mount(this.dom.sheetHost); return; }
    const ctx = { view: v, cfg, ui: this.ui, snap: this.snap, send: this.send, rerender: () => this.render(), ...chosen };
    const body = sheets.withCtx(ctx, () => ({
      discard: sheets.discardSheet, steal: sheets.stealSheet, yop: sheets.yopSheet, monopoly: sheets.monopolySheet,
      build: sheets.buildSheet, dev: sheets.devSheet, trade: sheets.tradeSheet, incoming: sheets.incomingSheet,
      waiting: sheets.waitingSheet, log: sheets.logSheet, menu: () => this.menuSheet(v, cfg),
    })[chosen.type](ctx));
    mount(this.dom.sheetHost,
      h('div.backdrop' + (chosen.modal ? '.modal' : ''), { onclick: () => { if (!chosen.modal) { this.ui.sheet = null; this.render(); } } }),
      h('div.sheet', { role: 'dialog', 'aria-label': chosen.title },
        h('div.sheet-head', h('strong', chosen.title), chosen.modal ? null : h('button.icon', { 'aria-label': 'Close', onclick: () => { this.ui.sheet = null; this.render(); } }, '✕')),
        h('div.sheet-body', body)));
  }

  menuSheet(v, cfg) {
    return h('div.list',
      h('label.field', h('span', 'Color theme'), h('select', { onchange: (e) => { this.prefs.theme = applyTheme(e.target.value); this.savePrefs(); } }, Object.entries(THEMES).map(([k, t]) => h('option', { value: k, selected: k === this.prefs.theme }, t.label)))),
      h('button.btn', { onclick: () => { this.ui.sheet = 'log'; this.render(); } }, 'Game log'),
      h('button.btn', { onclick: () => { this.board.vb = { ...this.board.full }; this.board.applyVb(); this.ui.sheet = null; this.render(); } }, 'Reset board zoom'),
      h('p.dim.small', `${cfg.name} · ${cfg.win_conditions[0]?.params.threshold} VP to win · ${v.board.rings} rings`),
      h('button.btn.danger', { onclick: () => { if (this.ui.confirmLeave) this.showLobby(); else { this.ui.confirmLeave = true; this.render(); } } }, this.ui.confirmLeave ? 'Tap again to leave (progress is saved)' : 'Leave game'));
  }

  renderOverlay(v, cfg) {
    if (v.phase !== 'finished') { mount(this.dom.overlay); return; }
    const rows = [...v.player_order].sort((a, b) => v.players[b].vp - v.players[a].vp).map((id) => h('div.score' + (id === v.winner ? '.win' : ''), h('span', v.players[id].name), h('strong', `${v.players[id].vp} VP`)));
    mount(this.dom.overlay, h('div.winner', h('h2', v.winner === v.me ? 'You win!' : `${v.players[v.winner].name} wins`), ...rows, h('button.btn.primary.big', { onclick: () => this.showLobby() }, 'New game')));
  }
}
