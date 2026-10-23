// Shape documentation (JSDoc only; becomes real TypeScript in the migration phase).

/** @typedef {{id:number, terrain:string, number_token:number|null, q:number, r:number}} Hex */
/** @typedef {{type:string, player:string}} Placed */
/** @typedef {{id:string, name:string, color:string, is_ai:boolean, resources:Record<string,number>,
 *   dev_cards:string[], played_dev_cards:string[], buildings_placed:Record<string,number>,
 *   achievements:string[], has_played_dev_card_this_turn:boolean, dev_cards_bought_this_turn:string[],
 *   hidden_vp:number, ports:string[]}} Player */
/** @typedef {{id:string, from_player:string, offering:Record<string,number>, requesting:Record<string,number>,
 *   responses:Record<string,string>, counter_ids:string[]}} TradeOffer */
/** @typedef {{type:string, player_id:string, params:Record<string,any>}} Action */
/** @typedef {{ok:boolean, error?:string, state:GameState, events:any[]}} ReduceResult */
/**
 * @typedef {object} GameState  Plain JSON. Never contains Maps/Sets/functions.
 * @property {string} game_id
 * @property {'lobby'|'setup'|'playing'|'finished'} phase
 * @property {number} rng  PRNG state. SECRET: never leaves the server (see view.js).
 * @property {{rings:number, hexes:Hex[], ports:Record<number,string>, robber_hex:number|null,
 *   buildings:{i:Record<number,Placed>, e:Record<number,Placed>}}} board
 * @property {Record<string,Player>} players
 * @property {string[]} player_order
 * @property {string[]} dev_card_deck  SECRET
 * @property {Record<string,TradeOffer>} trade_offers
 */
/** @typedef {object} GameConfig  see config.js */
export {};
