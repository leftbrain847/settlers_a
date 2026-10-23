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

// Faithful to the Python oracle for now (ties go to the earlier seat; a holder is never stripped
// when nobody qualifies). Rule fixes are a separate, tested pass after the oracle is green.
function award(ctx: Ctx, ach: Achievement, metric: (pid: string) => number): void {
  const { s, events } = ctx;
  const holder = s.player_order.find((pid) => s.players[pid]!.achievements.includes(ach.id)) ?? null;
  let best: string | null = null;
  let bestVal = ach.min_value - 1;
  for (const pid of s.player_order) {
    const v = metric(pid);
    if (v > bestVal) { bestVal = v; best = pid; }
  }
  if (best && best !== holder) {
    if (holder) {
      const a = s.players[holder]!.achievements;
      a.splice(a.indexOf(ach.id), 1);
      events.push({ type: 'achievement_lost', player: holder, achievement: ach.id });
    }
    s.players[best]!.achievements.push(ach.id);
    events.push({ type: 'achievement_gained', player: best, achievement: ach.id, value: bestVal });
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
