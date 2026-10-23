import { addLog, bankRatio } from '../state.js';
import { SYSTEM, hasAll, validResMap } from './common.js';

const isCurrent = (s, pid) => pid === s.player_order[s.current_player_idx];

export function bankError(cfg, s, a) {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (!isCurrent(s, a.player_id)) return 'Not your turn';
  if (!s.dice_rolled) return 'Must roll dice first';
  if (!cfg.trade_rules.bank_trading_enabled) return 'Bank trading is disabled';
  const { give_resource: give, want_resource: want } = a.params;
  if (!(give in cfg.resource_types) || !(want in cfg.resource_types)) return 'Must specify give and want resources';
  if (give === want) return 'Cannot trade same resource';
  const ratio = bankRatio(cfg, s.players[a.player_id], give);
  if ((s.players[a.player_id].resources[give] ?? 0) < ratio) return `Need ${ratio} ${give} to trade`;
  return null;
}

export function applyBank(ctx, a) {
  const { cfg, s, events } = ctx;
  const p = s.players[a.player_id];
  const { give_resource: give, want_resource: want } = a.params;
  const ratio = bankRatio(cfg, p, give);
  p.resources[give] -= ratio;
  p.resources[want] = (p.resources[want] ?? 0) + 1;
  events.push({ type: 'bank_trade', player: a.player_id, gave: { [give]: ratio }, received: { [want]: 1 } });
  addLog(s, 'trade_bank', { player: a.player_id, give, want, ratio });
}

export function offerError(cfg, s, a) {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  if (!cfg.trade_rules.player_trading_enabled) return 'Player trading is disabled';
  const { offering, requesting, counter_to } = a.params;
  const pid = a.player_id;

  if (isCurrent(s, pid)) {
    if (!s.dice_rolled) return 'Must roll dice first';
    if (counter_to) return 'Cannot counter your own offer';
  } else {
    const parent = s.trade_offers[counter_to];
    if (!parent || parent.from_player !== s.player_order[s.current_player_idx]) return 'Not your turn';
  }
  if (!validResMap(cfg, offering) || !validResMap(cfg, requesting)) return 'Must specify what you offer and request';
  if (!hasAll(s.players[pid], offering)) return 'Not enough resources to offer';
  return null;
}

export function applyOffer(ctx, a) {
  const { s, events } = ctx;
  const id = `t${++s.trade_counter}`;
  s.trade_offers[id] = {
    id, from_player: a.player_id, offering: { ...a.params.offering }, requesting: { ...a.params.requesting },
    responses: {}, counter_ids: [],
  };
  const parentId = a.params.counter_to;
  if (parentId) {
    s.trade_offers[parentId].counter_ids.push(id);
    s.trade_offers[parentId].responses[a.player_id] = 'countered';
  }
  addLog(s, 'trade_offer', { player: a.player_id, trade_id: id });
  events.push({ type: 'trade_offered', player: a.player_id, trade_id: id, counter_to: parentId ?? null });
}

export function respondError(cfg, s, a) {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  const offer = s.trade_offers[a.params.trade_id];
  if (!offer) return 'Trade offer not found';
  if (!s.players[a.player_id]) return 'Unknown player';
  if (a.player_id === offer.from_player) return 'Cannot respond to your own trade';
  const r = a.params.response;
  if (r !== 'accept' && r !== 'decline') return "Response must be 'accept' or 'decline'";
  if (r === 'accept') {
    if (!hasAll(s.players[a.player_id], offer.requesting)) return 'Not enough resources';
    if (!hasAll(s.players[offer.from_player], offer.offering)) return 'Offerer no longer has those resources';
  }
  return null;
}

export function applyRespond(ctx, a) {
  const { s, events } = ctx;
  const offer = s.trade_offers[a.params.trade_id];
  const response = a.params.response === 'accept' ? 'accepted' : 'declined';
  offer.responses[a.player_id] = response;
  addLog(s, 'trade_respond', { player: a.player_id, trade_id: offer.id, response });
  events.push({ type: 'trade_response', player: a.player_id, trade_id: offer.id, response });

  // Auto-finalize when the offerer is not the one deciding (a bot, or a counter-offer from a non-current player).
  if (response === 'accepted') {
    const offerer = s.players[offer.from_player];
    if (offerer.is_ai || offer.from_player !== s.player_order[s.current_player_idx]) {
      finalize(ctx, offer, a.player_id);
    }
  }
}

export function acceptError(cfg, s, a) {
  if (s.phase !== 'playing') return 'Game is not in playing phase';
  const offer = s.trade_offers[a.params.trade_id];
  if (!offer) return 'Trade offer not found';
  let accepter = a.params.accepter_id;
  if (!accepter) {
    if (a.player_id === offer.from_player) return 'Must specify accepter_id';
    accepter = a.player_id;
  }
  if (!s.players[accepter] || accepter === offer.from_player) return 'Invalid accepter';
  if (a.player_id !== offer.from_player && a.player_id !== accepter) return 'Only the trade offerer or accepter can finalize';
  if (!hasAll(s.players[accepter], offer.requesting)) return 'Not enough resources';
  if (!hasAll(s.players[offer.from_player], offer.offering)) return 'Offerer no longer has those resources';
  return null;
}

export function applyAccept(ctx, a) {
  const offer = ctx.s.trade_offers[a.params.trade_id];
  finalize(ctx, offer, a.params.accepter_id || a.player_id);
}

function finalize(ctx, offer, accepterId) {
  const { s, events } = ctx;
  const offerer = s.players[offer.from_player];
  const accepter = s.players[accepterId];
  for (const [r, n] of Object.entries(offer.offering)) {
    offerer.resources[r] -= n;
    accepter.resources[r] = (accepter.resources[r] ?? 0) + n;
  }
  for (const [r, n] of Object.entries(offer.requesting)) {
    accepter.resources[r] -= n;
    offerer.resources[r] = (offerer.resources[r] ?? 0) + n;
  }
  for (const cid of offer.counter_ids) delete s.trade_offers[cid];
  delete s.trade_offers[offer.id];
  events.push({ type: 'trade_completed', from: offer.from_player, to: accepterId, trade_id: offer.id });
  addLog(s, 'trade_accept', { player: accepterId, from_player: offer.from_player, trade_id: offer.id });
}

export function cancelError(cfg, s, a) {
  const offer = s.trade_offers[a.params.trade_id];
  if (!offer) return 'Trade offer not found';
  if (a.player_id !== offer.from_player) return 'Only the offerer can cancel';
  return null;
}

// trade_expire is issued by the room when a timer fires; clients can never submit it.
export function expireError(cfg, s, a) {
  if (a.player_id !== SYSTEM) return 'System action';
  if (!s.trade_offers[a.params.trade_id]) return 'Trade offer not found';
  return null;
}

export function applyCancel(ctx, a) {
  const { s, events } = ctx;
  const offer = s.trade_offers[a.params.trade_id];
  for (const cid of offer.counter_ids) delete s.trade_offers[cid];
  delete s.trade_offers[offer.id];
  events.push({ type: a.type === 'trade_expire' ? 'trade_expired' : 'trade_cancelled', trade_id: offer.id });
  addLog(s, a.type, { trade_id: offer.id });
}
