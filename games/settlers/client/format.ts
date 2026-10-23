// Human-readable text for log entries and live events. Pure; takes the player's view for names.
import type { GameConfig, GameEvent, GameView, LogEntry, ResMap } from '../engine/types.ts';

export function names(view: GameView): { n: (id: string) => string; verb: (id: string, you: string, other: string) => string } {
  const n = (id: string): string => (id === view.me ? 'You' : view.players[id]?.name ?? id);
  const verb = (id: string, you: string, other: string): string => (id === view.me ? you : other);
  return { n, verb };
}

const resList = (cfg: GameConfig, m: ResMap): string =>
  Object.entries(m).map(([r, c]) => `${c} ${cfg.resource_types[r]?.name ?? r}`).join(', ');

export function describeEvent(ev: GameEvent, view: GameView, cfg: GameConfig): string | null {
  const { n, verb } = names(view);
  const s = (k: string): string => String(ev[k] ?? '');
  const res = (k: string): ResMap => (ev[k] ?? {}) as ResMap;
  switch (ev.type) {
    case 'dice_rolled': return `${n(s('player'))} ${verb(s('player'), 'rolled', 'rolled')} ${s('total')} (${((ev.rolls ?? []) as number[]).join(' + ')})`;
    case 'building_placed': return `${n(s('player'))} ${verb(s('player'), 'built', 'built')} a ${cfg.building_types[s('building')]?.name.toLowerCase() ?? s('building')}`;
    case 'must_discard': return `${n(s('player'))} must discard ${s('count')}`;
    case 'discarded': return `${n(s('player'))} discarded ${ev.count ?? resList(cfg, res('resources'))}`;
    case 'robber_moved': return `${n(s('player'))} moved the robber`;
    case 'resource_stolen': {
      const what = ev.resource ? ` (${cfg.resource_types[s('resource')]?.name})` : '';
      return `${n(s('stealer'))} ${verb(s('stealer'), 'stole', 'stole')} a card from ${n(s('target'))}${what}`;
    }
    case 'dev_card_bought': return `${n(s('player'))} bought a development card${ev.card ? ` (${cfg.dev_card_types[s('card')]?.name})` : ''}`;
    case 'dev_card_played': return `${n(s('player'))} played ${cfg.dev_card_types[s('card')]?.name ?? s('card')}`;
    case 'bank_trade': return `${n(s('player'))} traded ${resList(cfg, res('gave'))} to the bank for ${resList(cfg, res('received'))}`;
    case 'trade_offered': return ev.counter_to ? `${n(s('player'))} made a counter-offer` : `${n(s('player'))} offered a trade`;
    case 'trade_completed': return `${n(s('from'))} and ${n(s('to'))} completed a trade`;
    case 'trade_expired': return 'A trade offer expired';
    case 'trade_cancelled': return 'A trade offer was withdrawn';
    case 'monopoly': return `${n(s('player'))} took ${s('stolen')} ${cfg.resource_types[s('resource')]?.name} with Monopoly`;
    case 'resources_gained': return `${n(s('player'))} took ${resList(cfg, res('resources'))}`;
    case 'achievement_gained': return `${n(s('player'))} ${verb(s('player'), 'earned', 'earned')} ${cfg.achievements[s('achievement')]?.name}`;
    case 'achievement_lost': return `${n(s('player'))} lost ${cfg.achievements[s('achievement')]?.name}`;
    case 'turn_started': return ev.player === view.me ? 'Your turn' : `${n(s('player'))}'s turn`;
    case 'setup_complete': return 'Setup complete';
    case 'game_won': return `${n(s('player'))} won with ${s('vp')} points`;
    default: return null;
  }
}

export function describeLog(e: LogEntry, view: GameView, cfg: GameConfig): string | null {
  const { n } = names(view);
  const s = (k: string): string => String(e[k] ?? '');
  switch (e.type) {
    case 'player_joined': return `${n(s('player'))} joined`;
    case 'game_started': return 'Game started';
    case 'dice_rolled': return `${n(s('player'))} rolled ${s('total')}`;
    case 'build': return `${n(s('player'))} built a ${cfg.building_types[s('building')]?.name.toLowerCase()}`;
    case 'buy_dev_card': return `${n(s('player'))} bought a development card`;
    case 'play_dev_card': return `${n(s('player'))} played ${cfg.dev_card_types[s('card')]?.name}`;
    case 'trade_bank': return `${n(s('player'))} traded with the bank (${s('ratio')}:1)`;
    case 'trade_offer': return `${n(s('player'))} made an offer`;
    case 'trade_respond': return `${n(s('player'))} ${s('response')} an offer`;
    case 'trade_accept': return `${n(s('from_player'))} traded with ${n(s('player'))}`;
    case 'trade_expire': return 'An offer expired';
    case 'trade_cancel': return 'An offer was withdrawn';
    case 'discard': return `${n(s('player'))} discarded ${s('count')}`;
    case 'move_robber': return `${n(s('player'))} moved the robber`;
    case 'steal': return `${n(s('stealer'))} stole from ${n(s('target'))}`;
    case 'dev_card_action': return `${n(s('player'))} resolved a development card`;
    case 'end_turn': return `${n(s('player'))} ended their turn`;
    case 'setup_complete': return 'Setup complete';
    case 'game_won': return `${n(s('player'))} won with ${s('vp')} points`;
    default: return null;
  }
}
