import { topology } from '../topology.ts';
import { addLog, playerVp } from '../state.ts';
import type { Achievement, Ctx, GameState } from '../types.ts';

export function updateAchievements(ctx: Ctx): void {
  const { cfg, s } = ctx;
  for (const ach of Object.values(cfg.achievements)) {
    if (ach.metric === 'road_length') award(ctx, ach, (pid) => roadLength(s, pid));
    else if (ach.metric === 'knight_count') {
      award(ctx, ach, (pid) => s.players[pid]!.played_dev_cards
        .filter((c) => cfg.dev_card_types[c]?.persistent_tag === 'knight').length);
    }
  }
}

// Standard rules: the holder keeps the card on a tie; a challenger must strictly beat them. If the holder
// falls below the minimum (or is overtaken by a tie of two others) the card is returned to the bank.
function award(ctx: Ctx, ach: Achievement, metric: (pid: string) => number): void {
  const { s, events } = ctx;
  const holder = s.player_order.find((pid) => s.players[pid]!.achievements.includes(ach.id)) ?? null;
  const values = new Map(s.player_order.map((pid) => [pid, metric(pid)] as const));
  const top = Math.max(...values.values());
  const contenders = top >= ach.min_value ? s.player_order.filter((pid) => values.get(pid) === top) : [];
  const next = holder && contenders.includes(holder) ? holder : contenders.length === 1 ? contenders[0]! : null;
  if (next === holder) return;
  if (holder) {
    const a = s.players[holder]!.achievements;
    a.splice(a.indexOf(ach.id), 1);
    events.push({ type: 'achievement_lost', player: holder, achievement: ach.id });
  }
  if (next) {
    s.players[next]!.achievements.push(ach.id);
    events.push({ type: 'achievement_gained', player: next, achievement: ach.id, value: top });
  }
}

export function roadLength(s: GameState, pid: string): number {
  const topo = topology(s.board.rings);
  const graph = new Map<number, number[]>();
  for (const [eid, b] of Object.entries(s.board.buildings.e)) {
    if (b.player !== pid) continue;
    const { a, b: bb } = topo.edges[Number(eid)]!;
    const la = graph.get(a) ?? [];
    const lb = graph.get(bb) ?? [];
    la.push(bb);
    lb.push(a);
    graph.set(a, la);
    graph.set(bb, lb);
  }
  if (!graph.size) return 0;
  const blocked = new Set<number>();
  for (const [iid, b] of Object.entries(s.board.buildings.i)) if (b.player !== pid) blocked.add(Number(iid));

  let max = 0;
  const visited = new Set<number>();
  const key = (x: number, y: number): number => (x < y ? x * 1e7 + y : y * 1e7 + x);
  const dfs = (node: number, len: number): void => {
    if (len > max) max = len;
    for (const nb of graph.get(node) ?? []) {
      const k = key(node, nb);
      if (visited.has(k)) continue;
      if (blocked.has(nb)) { if (len + 1 > max) max = len + 1; continue; }
      visited.add(k);
      dfs(nb, len + 1);
      visited.delete(k);
    }
  };
  for (const start of graph.keys()) dfs(start, 0);
  return max;
}

export function checkWin(ctx: Ctx): void {
  const { cfg, s, events } = ctx;
  for (const wc of cfg.win_conditions) {
    if (wc.type !== 'vp_threshold') continue;
    const pid = s.player_order[s.current_player_idx];
    if (!pid) continue;
    const vp = playerVp(cfg, s, pid, true);
    if (vp >= (wc.params.threshold ?? 10)) {
      s.phase = 'finished';
      s.winner = pid;
      events.push({ type: 'game_won', player: pid, vp });
      addLog(s, 'game_won', { player: pid, vp });
      break;
    }
  }
}
