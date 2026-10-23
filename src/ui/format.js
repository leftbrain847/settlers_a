// Human-readable text for log entries and live events. Pure; takes the player's view for names.

export function names(view) {
  const n = (id) => (id === view.me ? 'You' : view.players[id]?.name ?? id);
  const verb = (id, you, other) => (id === view.me ? you : other);
  return { n, verb };
}

const resList = (cfg, m) => Object.entries(m).map(([r, c]) => `${c} ${cfg.resource_types[r]?.name ?? r}`).join(', ');

export function describeEvent(ev, view, cfg) {
  const { n, verb } = names(view);
  switch (ev.type) {
    case 'dice_rolled': return `${n(ev.player)} ${verb(ev.player, 'rolled', 'rolled')} ${ev.total} (${ev.rolls.join(' + ')})`;
    case 'building_placed': return `${n(ev.player)} ${verb(ev.player, 'built', 'built')} a ${cfg.building_types[ev.building]?.name.toLowerCase() ?? ev.building}`;
    case 'must_discard': return `${n(ev.player)} must discard ${ev.count}`;
    case 'discarded': return `${n(ev.player)} discarded ${ev.count ?? resList(cfg, ev.resources)}`;
    case 'robber_moved': return `${n(ev.player)} moved the robber`;
    case 'resource_stolen': {
      const what = ev.resource ? ` (${cfg.resource_types[ev.resource]?.name})` : '';
      return `${n(ev.stealer)} ${verb(ev.stealer, 'stole', 'stole')} a card from ${n(ev.target)}${what}`;
    }
    case 'dev_card_bought': return `${n(ev.player)} bought a development card${ev.card ? ` (${cfg.dev_card_types[ev.card]?.name})` : ''}`;
    case 'dev_card_played': return `${n(ev.player)} played ${cfg.dev_card_types[ev.card]?.name ?? ev.card}`;
    case 'bank_trade': return `${n(ev.player)} traded ${resList(cfg, ev.gave)} to the bank for ${resList(cfg, ev.received)}`;
    case 'trade_offered': return ev.counter_to ? `${n(ev.player)} made a counter-offer` : `${n(ev.player)} offered a trade`;
    case 'trade_completed': return `${n(ev.from)} and ${n(ev.to)} completed a trade`;
    case 'trade_expired': return 'A trade offer expired';
    case 'trade_cancelled': return 'A trade offer was withdrawn';
    case 'monopoly': return `${n(ev.player)} took ${ev.stolen} ${cfg.resource_types[ev.resource]?.name} with Monopoly`;
    case 'resources_gained': return `${n(ev.player)} took ${resList(cfg, ev.resources)}`;
    case 'achievement_gained': return `${n(ev.player)} ${verb(ev.player, 'earned', 'earned')} ${cfg.achievements[ev.achievement]?.name}`;
    case 'achievement_lost': return `${n(ev.player)} lost ${cfg.achievements[ev.achievement]?.name}`;
    case 'turn_started': return ev.player === view.me ? 'Your turn' : `${n(ev.player)}'s turn`;
    case 'setup_complete': return 'Setup complete';
    case 'game_won': return `${n(ev.player)} won with ${ev.vp} points`;
    default: return null;
  }
}

export function describeLog(e, view, cfg) {
  const { n } = names(view);
  switch (e.type) {
    case 'player_joined': return `${n(e.player)} joined`;
    case 'game_started': return 'Game started';
    case 'dice_rolled': return `${n(e.player)} rolled ${e.total}`;
    case 'build': return `${n(e.player)} built a ${cfg.building_types[e.building]?.name.toLowerCase()}`;
    case 'buy_dev_card': return `${n(e.player)} bought a development card`;
    case 'play_dev_card': return `${n(e.player)} played ${cfg.dev_card_types[e.card]?.name}`;
    case 'trade_bank': return `${n(e.player)} traded with the bank (${e.ratio}:1)`;
    case 'trade_offer': return `${n(e.player)} made an offer`;
    case 'trade_respond': return `${n(e.player)} ${e.response} an offer`;
    case 'trade_accept': return `${n(e.from_player)} traded with ${n(e.player)}`;
    case 'trade_expire': return 'An offer expired';
    case 'trade_cancel': return 'An offer was withdrawn';
    case 'discard': return `${n(e.player)} discarded ${e.count}`;
    case 'move_robber': return `${n(e.player)} moved the robber`;
    case 'steal': return `${n(e.stealer)} stole from ${n(e.target)}`;
    case 'dev_card_action': return `${n(e.player)} resolved a development card`;
    case 'end_turn': return `${n(e.player)} ended their turn`;
    case 'setup_complete': return 'Setup complete';
    case 'game_won': return `${n(e.player)} won with ${e.vp} points`;
    default: return null;
  }
}
