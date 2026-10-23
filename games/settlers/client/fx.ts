// Shows what happened instead of describing it: cards fly between the board, the bank and the players.
import { h } from './dom.ts';
import { DEV_ICON, icon, resIcon } from './icons.ts';
import type { GameConfig, GameEvent, GameView } from '../engine/types.ts';

export interface Pt { x: number; y: number }

/** Where things are on screen right now (the app answers from the live DOM). */
export interface FxAnchors {
  /** A player's chip, or (for the local player with a resource) the matching card in their hand. */
  seat(id: string, res?: string): Pt | null;
  bank(): Pt | null;
  center(): Pt | null;
  board(kind: 'h' | 'i' | 'e', id: number): Pt | null;
  bump(id: string): void;
}

const MAX_PER_SNAPSHOT = 28;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const resMap = (v: unknown): Record<string, number> => (v && typeof v === 'object' ? (v as Record<string, number>) : {});

export class Fx {
  private layer: HTMLElement;
  private budget = 0;

  constructor(layer: HTMLElement) { this.layer = layer; }

  private get canAnimate(): boolean {
    if (typeof this.layer.animate !== 'function') return false;
    return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** speed: playback multiplier (1 = normal). At 4x and above the cards are skipped; the board still shows the result. */
  play(events: GameEvent[], view: GameView, cfg: GameConfig, a: FxAnchors, speed = 1): void {
    if (!this.canAnimate || speed >= 4) return;
    const k = 1 / Math.min(2, Math.max(0.5, speed));
    this.budget = MAX_PER_SNAPSHOT;
    let t = 0; // sequence clock: effects of one snapshot play in the order things happened
    const me = view.me;
    const seatPt = (id: string, res?: string): Pt | null => a.seat(id, id === me ? res : undefined);

    for (const ev of events) {
      switch (ev.type) {
        case 'dice_rolled': t += 550 * k; break;

        case 'resource_produced': {
          const res = str(ev.resource), to = seatPt(str(ev.player), res), from = a.board('h', num(ev.hex));
          for (let i = 0; i < num(ev.amount); i++) this.fly(from, to, { res, delay: t + i * 120 * k, dur: 800 * k, bump: str(ev.player), a });
          t += 70 * k;
          break;
        }

        case 'building_placed': {
          if (!ev.paid) break;
          const owner = str(ev.player);
          const cost = cfg.building_types[str(ev.building)]?.cost ?? {};
          const at = ev.location_type === 'edge' ? a.board('e', num(ev.location)) : a.board('i', num(ev.location));
          let i = 0;
          for (const [res, n] of Object.entries(cost)) for (let j = 0; j < n; j++) this.fly(seatPt(owner, res), at, { res, delay: t + i++ * 90 * k, dur: 650 * k });
          break;
        }

        case 'bank_trade': {
          const who = str(ev.player);
          let i = 0;
          for (const [res, n] of Object.entries(resMap(ev.gave))) for (let j = 0; j < n; j++) this.fly(seatPt(who, res), a.bank(), { res, delay: t + i++ * 100 * k, dur: 650 * k });
          for (const [res, n] of Object.entries(resMap(ev.received))) for (let j = 0; j < n; j++) this.fly(a.bank(), seatPt(who, res), { res, delay: t + 450 * k + j * 100 * k, dur: 700 * k, bump: who, a });
          t += 500 * k;
          break;
        }

        case 'trade_completed': {
          const from = str(ev.from), to = str(ev.to);
          let i = 0;
          for (const [res, n] of Object.entries(resMap(ev.offering))) for (let j = 0; j < n; j++) this.fly(seatPt(from, res), seatPt(to, res), { res, delay: t + i++ * 110 * k, dur: 800 * k, bump: to, a });
          for (const [res, n] of Object.entries(resMap(ev.requesting))) for (let j = 0; j < n; j++) this.fly(seatPt(to, res), seatPt(from, res), { res, delay: t + i++ * 110 * k, dur: 800 * k, bump: from, a });
          t += 400 * k;
          break;
        }

        case 'resource_stolen': {
          const res = str(ev.resource) || undefined; // only the thief and the victim ever learn which card
          const from = seatPt(str(ev.target), res), to = seatPt(str(ev.stealer), res);
          this.fly(from, to, res ? { res, delay: t, dur: 800 * k, bump: str(ev.stealer), a } : { back: true, delay: t, dur: 800 * k, bump: str(ev.stealer), a });
          t += 300 * k;
          break;
        }

        case 'dev_card_bought': this.fly(a.bank(), seatPt(str(ev.player), 'dev'), { back: true, delay: t, dur: 750 * k, bump: str(ev.player), a }); t += 200 * k; break;

        case 'dev_card_played': {
          const card = str(ev.card);
          this.showcase(DEV_ICON[card] ?? 'card', a.center(), seatPt(str(ev.player), 'dev'), t);
          t += 500 * k;
          break;
        }

        case 'discarded': {
          const who = str(ev.player);
          const n = typeof ev.count === 'number' ? ev.count : Object.values(resMap(ev.resources)).reduce((x, y) => x + y, 0);
          const from = seatPt(who);
          for (let i = 0; i < Math.min(n, 8); i++) this.fly(from, from ? { x: from.x + (i - n / 2) * 6, y: from.y + 90 } : null, { back: true, delay: t + i * 70 * k, dur: 700 * k });
          t += 200 * k;
          break;
        }

        case 'monopoly': {
          const who = str(ev.player), res = str(ev.resource);
          const others = view.player_order.filter((id) => id !== who);
          const total = Math.min(num(ev.stolen), 10);
          for (let i = 0; i < total; i++) this.fly(seatPt(others[i % Math.max(1, others.length)] ?? who), seatPt(who, res), { res, delay: t + i * 90 * k, dur: 750 * k, bump: who, a });
          t += 300 * k;
          break;
        }

        case 'resources_gained':
          for (const [res, n] of Object.entries(resMap(ev.resources))) for (let j = 0; j < n; j++) this.fly(a.bank(), seatPt(str(ev.player), res), { res, delay: t + j * 120 * k, dur: 750 * k, bump: str(ev.player), a });
          t += 250 * k;
          break;
      }
    }
  }

  private fly(from: Pt | null, to: Pt | null, o: { res?: string; back?: boolean; delay: number; dur: number; bump?: string; a?: FxAnchors }): void {
    if (!from || !to || this.budget <= 0) return;
    this.budget--;
    const el = h('div.fxcard' + (o.back || !o.res ? '.back' : ''), o.res && !o.back ? { style: { '--c': `var(--r-${o.res})` } } : {},
      o.back || !o.res ? icon('deck', 13) : icon(resIcon(o.res), 15));
    el.style.left = `${from.x - 12}px`;
    el.style.top = `${from.y - 16}px`;
    this.layer.append(el);
    const dx = to.x - from.x, dy = to.y - from.y;
    const anim = el.animate([
      { transform: 'translate(0px, 0px) scale(0.4) rotate(-10deg)', opacity: 0 },
      { opacity: 1, offset: 0.16 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 22}px) scale(1.08) rotate(7deg)`, opacity: 1, offset: 0.58 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.75) rotate(0deg)`, opacity: 0.1 },
    ], { duration: o.dur, delay: Math.max(0, o.delay), easing: 'cubic-bezier(0.25, 0.7, 0.3, 1)', fill: 'both' });
    anim.onfinish = () => { el.remove(); if (o.bump && o.a) o.a.bump(o.bump); };
  }

  /** A played development card lifts out of the player's hand, shows itself, then fades. */
  private showcase(name: string, mid: Pt | null, from: Pt | null, delay: number): void {
    if (!mid || this.budget <= 0) return;
    this.budget--;
    const el = h('div.fxbig', icon(name, 44));
    el.style.left = `${mid.x - 36}px`;
    el.style.top = `${mid.y - 36}px`;
    this.layer.append(el);
    const dx = from ? from.x - mid.x : 0, dy = from ? from.y - mid.y : 0;
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0 },
      { transform: 'translate(0, 0) scale(1.25)', opacity: 1, offset: 0.35 },
      { transform: 'translate(0, 0) scale(1.1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(0, -16px) scale(1)', opacity: 0 },
    ], { duration: 1100, delay: Math.max(0, delay), easing: 'ease-out', fill: 'both' }).onfinish = () => el.remove();
  }
}
