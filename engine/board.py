"""
Board generation — creates a hex board from a BoardTemplate config.

Uses axial coordinates (q, r) for hex positions.
Generates all hexes, intersections, edges, and adjacency lookups.
"""

from __future__ import annotations

import random
from typing import Optional

from .config import GameConfig, BoardTemplate
from .state import Board, HexTile, Intersection, Edge


# Axial direction vectors for hex neighbors
HEX_DIRECTIONS = [
    (1, 0), (1, -1), (0, -1),
    (-1, 0), (-1, 1), (0, 1),
]


def axial_to_cube(q: int, r: int) -> tuple[int, int, int]:
    return (q, -q - r, r)


def cube_to_axial(x: int, y: int, z: int) -> tuple[int, int]:
    return (x, z)


def hex_neighbors(q: int, r: int) -> list[tuple[int, int]]:
    return [(q + dq, r + dr) for dq, dr in HEX_DIRECTIONS]


def hex_corners_axial(q: int, r: int) -> list[tuple[float, float]]:
    """
    Return the 6 corner positions of a hex in axial-fractional coords.
    Each corner is shared by up to 3 hexes.
    Order matches pointy-top rendering: starting at -30° (NE), going clockwise.
    """
    corners = [
        (q + 2/3, r - 1/3),   # 0: NE  (angle -30°)
        (q + 1/3, r + 1/3),   # 1: SE  (angle  30°)
        (q - 1/3, r + 2/3),   # 2: S   (angle  90°)
        (q - 2/3, r + 1/3),   # 3: SW  (angle 150°)
        (q - 1/3, r - 1/3),   # 4: NW  (angle 210°)
        (q + 1/3, r - 2/3),   # 5: N   (angle 270°)
    ]
    return corners


def _round_corner(q: float, r: float) -> tuple[int, int]:
    """Round corner coordinates to a canonical key (multiply by 3 to get ints)."""
    return (round(q * 3), round(r * 3))


def generate_board(config: GameConfig, seed: Optional[int] = None) -> Board:
    """Generate a complete board from the game config."""
    rng = random.Random(seed)
    template = config.board_template

    board = Board()

    # --- Step 1: Generate hex positions ---
    hex_positions = _generate_hex_positions(template.num_rings)

    # --- Step 2: Assign terrains ---
    terrain_bag = []
    for terrain_id, count in template.terrain_counts.items():
        terrain_bag.extend([terrain_id] * count)
    rng.shuffle(terrain_bag)

    # If we have more positions than terrains, fill with first terrain
    while len(terrain_bag) < len(hex_positions):
        terrain_bag.append(list(template.terrain_counts.keys())[0])

    hex_id_map = {}  # (q, r) -> hex_id
    for i, (q, r) in enumerate(hex_positions):
        terrain = terrain_bag[i] if i < len(terrain_bag) else "desert"
        hex_tile = HexTile(
            id=i,
            terrain=terrain,
            q=q,
            r=r,
        )
        board.hexes[i] = hex_tile
        hex_id_map[(q, r)] = i

    # --- Step 3: Assign number tokens ---
    # Place tokens on non-desert hexes in spiral order
    number_tokens = list(template.number_tokens)
    token_idx = 0

    # Determine which hexes get numbers (those that produce resources)
    producing_hexes = []
    desert_hex_id = None
    for hid, h in board.hexes.items():
        terrain_type = config.terrain_types.get(h.terrain)
        if terrain_type and terrain_type.produces:
            producing_hexes.append(hid)
        else:
            # Desert — place robber here initially
            desert_hex_id = hid

    # Sort producing hexes by spiral order for token placement
    producing_hexes.sort(key=lambda hid: _spiral_key(board.hexes[hid].q, board.hexes[hid].r))

    for hid in producing_hexes:
        if token_idx < len(number_tokens):
            board.hexes[hid].number_token = number_tokens[token_idx]
            token_idx += 1

    # --- Step 4: Generate intersections ---
    corner_to_iid: dict[tuple[int, int], int] = {}
    next_iid = 0

    for hid, h in board.hexes.items():
        corners = hex_corners_axial(h.q, h.r)
        hex_iids = []
        for cq, cr in corners:
            key = _round_corner(cq, cr)
            if key not in corner_to_iid:
                corner_to_iid[key] = next_iid
                board.intersections[next_iid] = Intersection(
                    id=next_iid,
                    hex_ids=[hid],
                    q=cq,
                    r=cr,
                )
                next_iid += 1
            else:
                iid = corner_to_iid[key]
                if hid not in board.intersections[iid].hex_ids:
                    board.intersections[iid].hex_ids.append(hid)
            hex_iids.append(corner_to_iid[key])
        board.hex_intersections[hid] = hex_iids

    # --- Step 5: Generate edges ---
    next_eid = 0
    edge_set: dict[tuple[int, int], int] = {}

    for hid, iids in board.hex_intersections.items():
        for i in range(len(iids)):
            a = iids[i]
            b = iids[(i + 1) % len(iids)]
            key = (min(a, b), max(a, b))
            if key not in edge_set:
                edge_set[key] = next_eid
                board.edges[next_eid] = Edge(
                    id=next_eid,
                    intersection_ids=key,
                )
                next_eid += 1

    board.edge_between = edge_set

    # --- Step 6: Build adjacency lookups ---
    for iid in board.intersections:
        board.adjacent_intersections[iid] = []
        board.intersection_edges[iid] = []

    for eid, edge in board.edges.items():
        a, b = edge.intersection_ids
        if b not in board.adjacent_intersections[a]:
            board.adjacent_intersections[a].append(b)
        if a not in board.adjacent_intersections[b]:
            board.adjacent_intersections[b].append(a)
        board.intersection_edges[a].append(eid)
        board.intersection_edges[b].append(eid)

    # --- Step 7: Assign ports ---
    _assign_ports(board, config, rng)

    # --- Step 8: Place robber on desert ---
    if desert_hex_id is not None:
        board.hexes[desert_hex_id].has_robber = True

    return board, desert_hex_id


def _generate_hex_positions(num_rings: int) -> list[tuple[int, int]]:
    """Generate hex positions in axial coordinates for a board with N rings."""
    positions = [(0, 0)]  # center
    for ring in range(1, num_rings):
        # Start at direction[4] scaled by ring = (-ring, ring)
        q, r = -ring, ring
        for direction in range(6):
            dq, dr = HEX_DIRECTIONS[direction]
            for _ in range(ring):
                positions.append((q, r))
                q += dq
                r += dr
    return positions


def _spiral_key(q: int, r: int) -> tuple[int, int]:
    """Sort key for spiral ordering from center outward."""
    ring = max(abs(q), abs(-q - r), abs(r))
    return (ring, q * 100 + r)


def _assign_ports(board: Board, config: GameConfig, rng: random.Random):
    """Assign ports randomly along the outer ring's exterior edges.

    Ports are placed on coastal edge-pairs (two adjacent coastal intersections
    sharing an edge that borders only one hex). They are distributed randomly
    around the coast with minimum spacing to avoid clumping.
    """
    template = config.board_template

    # Find coastal intersections (those touching fewer than 3 hexes)
    coastal_set = set(
        iid for iid, inter in board.intersections.items()
        if len(inter.hex_ids) < 3
    )

    if not coastal_set or not template.port_counts:
        return

    # Build port bag
    port_bag = []
    for port_type_id, count in template.port_counts.items():
        port_bag.extend([port_type_id] * count)
    rng.shuffle(port_bag)

    if not port_bag:
        return

    # Find exterior edges: edges where BOTH intersections are coastal.
    # These are the edges on the outside perimeter of the board.
    exterior_edges = []
    for eid, edge in board.edges.items():
        a, b = edge.intersection_ids
        if a in coastal_set and b in coastal_set:
            exterior_edges.append((eid, a, b))

    if not exterior_edges:
        return

    # Order exterior edges into a chain around the perimeter by walking adjacency.
    # Build adjacency for coastal intersections along exterior edges.
    coastal_adj: dict[int, list[tuple[int, int]]] = {}  # iid -> [(neighbor_iid, eid)]
    for eid, a, b in exterior_edges:
        coastal_adj.setdefault(a, []).append((b, eid))
        coastal_adj.setdefault(b, []).append((a, eid))

    # Walk the perimeter chain starting from a random exterior intersection
    ordered_edges = []
    visited_edges = set()
    start_iid = exterior_edges[0][1]
    current = start_iid

    # Pick a direction to walk
    for _ in range(len(exterior_edges) + 1):
        moved = False
        for neighbor, eid in coastal_adj.get(current, []):
            if eid not in visited_edges:
                ordered_edges.append((eid, current, neighbor))
                visited_edges.add(eid)
                current = neighbor
                moved = True
                break
        if not moved:
            break

    if not ordered_edges:
        ordered_edges = exterior_edges

    # Group consecutive edge pairs that share an intersection into "port slots".
    # Each port slot is a pair of intersections (the two ends of an exterior edge).
    # We treat each exterior edge as a potential port slot.
    port_slots = ordered_edges  # Each slot: (eid, iid_a, iid_b)

    num_ports = len(port_bag)
    num_slots = len(port_slots)

    if num_ports == 0 or num_slots == 0:
        return

    # Distribute ports with even spacing around the perimeter, with random offset
    step = num_slots / num_ports
    offset = rng.random() * step  # random starting offset for variety

    used_intersections = set()
    port_idx = 0

    for i in range(num_ports):
        if port_idx >= len(port_bag):
            break

        target_pos = offset + i * step
        slot_idx = int(target_pos) % num_slots

        # Find nearest available slot (avoid sharing intersections with another port)
        found = False
        for delta in range(num_slots):
            for direction in (delta, -delta):
                check_idx = (slot_idx + direction) % num_slots
                _, iid_a, iid_b = port_slots[check_idx]
                if iid_a not in used_intersections and iid_b not in used_intersections:
                    port_type_id = port_bag[port_idx]
                    board.intersections[iid_a].port = port_type_id
                    board.intersections[iid_b].port = port_type_id
                    used_intersections.add(iid_a)
                    used_intersections.add(iid_b)
                    port_idx += 1
                    found = True
                    break
            if found:
                break
