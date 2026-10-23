// A believable mid-game board for previews and the style gallery (built through the real engine, then dressed up).
import { configFromSettings, createGame, addPlayer, startGame, reduce, legalActions, viewFor } from '../../engine/index.ts';
import type { Action, GameConfig, GameState, GameView } from '../../engine/index.ts';

export function sampleGame(seed = 11): { cfg: GameConfig; view: GameView; state: GameState } {
  const cfg = configFromSettings({});
  let s = createGame(cfg, { game_id: 'sample', seed });
  for (const n of ['You', 'Ada', 'Bo']) s = addPlayer(cfg, s, { name: n });
  s = startGame(cfg, s).state;
  while (s.phase === 'setup') {
    const pid = s.player_order[s.setup_player_idx]!;
    const legal = legalActions(cfg, s, pid);
    const pick = legal[(s.turn_number * 7 + legal.length * 3) % legal.length] ?? legal[0]!;
    const { type, ...params } = pick;
    const r = reduce(cfg, s, { type, player_id: pid, params } as Action);
    if (!r.ok) break;
    s = r.state;
  }
  // a few extra roads and one city, so the sample shows more than the opening
  const first = Object.entries(s.board.buildings.i)[0];
  if (first) s.board.buildings.i[Number(first[0])] = { type: 'city', player: first[1].player };
  return { cfg, state: s, view: viewFor(cfg, s, s.player_order[0]!) };
}
