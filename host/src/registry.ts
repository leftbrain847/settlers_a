import type { ErasedGame } from './game-module.ts';
import { settlersModule } from '../../games/settlers/game.ts';

// Adding a game = add a folder under /games and register it here. The host itself does not change.
export const GAMES: Record<string, ErasedGame> = { settlers: settlersModule };
export const DEFAULT_GAME = 'settlers';
