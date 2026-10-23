import type { Action, GameConfig, GameView, ResMap } from '../engine/types.ts';
import type { RngSource } from '../engine/rng.ts';

export interface BotMemory { offeredTradeThisTurn: boolean }
export interface OfferShape { offering: ResMap; requesting: ResMap }

/** Bots only ever see a GameView (what a human at the table could see), never raw state. */
export interface Strategy {
  newMemory(): BotMemory;
  chooseAction(cfg: GameConfig, view: GameView, rng: RngSource, mem: BotMemory): Action | null;
  chooseDiscard(cfg: GameConfig, view: GameView, count: number, rng: RngSource): ResMap;
  chooseYearOfPlenty(cfg: GameConfig, view: GameView, count: number, rng: RngSource): ResMap;
  chooseMonopoly(cfg: GameConfig, view: GameView, rng: RngSource): string;
  evaluateTrade(cfg: GameConfig, view: GameView, offer: OfferShape, rng: RngSource): boolean;
  counterOffer(cfg: GameConfig, view: GameView, offer: OfferShape, rng: RngSource): OfferShape | null;
}
