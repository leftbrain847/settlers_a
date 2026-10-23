#!/usr/bin/env python3
"""Replay JS-generated traces through the original Python engine and diff every step.

usage: python3 tests/oracle/replay.py <traceDir>

The JS engine owns randomness (board, deck, dice, steals); this script feeds those outcomes into the
Python engine so rules can be compared deterministically. Exit code 1 on any divergence.
"""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from engine.engine import GameEngine
from engine.actions import Action
from engine import handlers
from engine.config import WinCondition
from definitions.base_game import load_base_game


class FakeRandom:
    def __init__(self):
        self.dice, self.steal = [], []
    def randint(self, lo, hi):
        v = self.dice.pop(0)
        assert lo <= v <= hi
        return v
    def choice(self, seq):
        v = self.steal.pop(0)
        assert v in seq, f"{v} not in {seq}"
        return v


class FakeUuid:
    n = 0
    @classmethod
    def uuid4(cls):
        cls.n += 1
        return f"t{cls.n}"


def nz(d):
    return {k: v for k, v in d.items() if v != 0}


def norm(e):
    s = e.state
    players = {}
    for pid, p in s.players.items():
        players[pid] = {
            "resources": nz(p.resources), "dev_cards": sorted(p.dev_cards),
            "played_dev_cards": sorted(p.played_dev_cards), "buildings_placed": nz(p.buildings_placed),
            "achievements": sorted(p.achievements), "has_played": p.has_played_dev_card_this_turn,
            "bought": sorted(p.dev_cards_bought_this_turn), "hidden_vp": p.hidden_vp, "ports": sorted(p.ports),
        }
    return {
        "phase": s.phase.value, "turn_number": s.turn_number, "current_player_idx": s.current_player_idx,
        "dice_rolled": s.dice_rolled, "last_roll": list(s.last_roll) if s.last_roll else None,
        "setup": [s.setup_round, s.setup_player_idx, s.setup_settlements_placed, s.setup_roads_placed, s.setup_last_settlement],
        "robber_hex": s.robber_hex, "pending_robber_move": s.pending_robber_move,
        "pending_robber_steal": s.pending_robber_steal, "steal_candidates": sorted(s.robber_steal_candidates),
        "pending_discards": s.pending_discards, "pending_action": s.pending_action, "winner": s.winner,
        "deck": s.dev_card_deck, "players": players,
        "bi": {str(i): [x.building.building_type, x.building.player_id] for i, x in s.board.intersections.items() if x.building},
        "be": {str(i): [x.building.building_type, x.building.player_id] for i, x in s.board.edges.items() if x.building},
        "trade_offers": {tid: {"from": t.from_player, "offering": t.offering, "requesting": t.requesting,
                               "responses": t.responses, "counter_ids": t.counter_ids} for tid, t in s.trade_offers.items()},
    }


def diff(a, b, path=""):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a: yield f"{path}/{k}: missing in JS (py={b[k]!r})"
            elif k not in b: yield f"{path}/{k}: missing in PY (js={a[k]!r})"
            else: yield from diff(a[k], b[k], f"{path}/{k}")
    elif a != b:
        yield f"{path}: js={a!r} py={b!r}"


def build_engine(tr):
    cfg = load_base_game()
    st = tr["settings"]
    if st.get("vp_to_win"):
        cfg.win_conditions = [WinCondition(type="vp_threshold", params={"threshold": int(st["vp_to_win"])})]
    if "discard_threshold" in st:
        cfg.robber.discard_threshold = int(st["discard_threshold"])
    eng = GameEngine(cfg)
    for i in range(tr["n"]):
        eng.add_player(f"P{i + 1}")
    eng.start_game(seed=0)
    s = eng.state

    t = tr["topo"]
    assert len(s.board.intersections) == t["n_inter"], "intersection count differs"
    assert [list(e.intersection_ids) for e in s.board.edges.values()] == t["edges"], "edge order differs"
    assert [[round(i.q, 4), round(i.r, 4)] for i in s.board.intersections.values()] == t["coords"], "coords differ"
    assert [s.board.hex_intersections[h] for h in sorted(s.board.hex_intersections)] == t["hex_inter"], "hex corners differ"

    for h in tr["board"]["hexes"]:
        hx = s.board.hexes[h["id"]]
        assert (hx.q, hx.r) == (h["q"], h["r"]), "hex coords differ"
        hx.terrain, hx.number_token, hx.has_robber = h["terrain"], h["number_token"], False
    for i in s.board.intersections.values():
        i.port = None
    for iid, port in tr["board"]["ports"].items():
        s.board.intersections[int(iid)].port = port
    s.robber_hex = tr["board"]["robber_hex"]
    s.board.hexes[s.robber_hex].has_robber = True
    s.dev_card_deck = list(tr["deck"])
    return eng


def replay(path):
    tr = json.load(open(path))
    eng = build_engine(tr)
    fake = FakeRandom()
    handlers.random = fake
    FakeUuid.n = 0
    handlers.uuid = FakeUuid

    got = norm(eng)
    d = list(diff(tr["init"], got))
    if d:
        return f"initial state differs: {d[:5]}"

    for i, st in enumerate(tr["steps"]):
        a = st["action"]
        fake.dice = list(st["rolls"] or [])
        fake.steal = list(st["stolen"])
        r = eng.do_action(Action(type=a["type"], player_id=a["player_id"], params=a["params"]))
        if not r.success:
            return f"step {i} {a['type']}: Python rejected a move JS accepted: {r.error} {a}"
        types = [e["type"] for e in r.events]

        if a["type"] == "trade_offer" and a["params"].get("counter_to"):
            parent = eng.state.trade_offers[a["params"]["counter_to"]]
            new_tid = list(eng.state.trade_offers.keys())[-1]
            parent.counter_ids.append(new_tid)
            parent.responses[a["player_id"]] = "countered"

        if a["type"] == "trade_respond" and st["completed"]:
            offer = eng.state.trade_offers[a["params"]["trade_id"]]
            r2 = eng.do_action(Action(type="trade_accept", player_id=offer.from_player,
                                      params={"trade_id": offer.id, "accepter_id": a["player_id"]}))
            if not r2.success:
                return f"step {i}: auto-finalize rejected by Python: {r2.error}"
            types += [e["type"] for e in r2.events]

        d = list(diff(st["state"], norm(eng)))
        if d:
            return f"step {i} {a['type']} {json.dumps(a['params'])[:120]} by {a['player_id']}:\n    " + "\n    ".join(d[:8])
        if types != st["event_types"]:
            return f"step {i} {a['type']}: events differ js={st['event_types']} py={types}"
    return None


def main():
    paths = sorted(glob.glob(os.path.join(sys.argv[1], "trace_*.json")), key=lambda p: int(p.rsplit("_", 1)[1].split(".")[0]))
    bad = 0
    steps = 0
    for p in paths:
        err = replay(p)
        steps += len(json.load(open(p))["steps"])
        if err:
            bad += 1
            print(f"FAIL {os.path.basename(p)}: {err}")
    print(f"{len(paths) - bad}/{len(paths)} traces match Python ({steps} steps compared)")
    sys.exit(1 if bad else 0)


main()
