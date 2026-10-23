// Pure board geometry derived from the ring count. Not part of game state:
// both server and client rebuild it from `board.rings`, so it never crosses the wire.

export const HEX_DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function hexPositions(rings) {
  const pos = [[0, 0]];
  for (let ring = 1; ring < rings; ring++) {
    let q = -ring, r = ring;
    for (let d = 0; d < 6; d++) {
      const [dq, dr] = HEX_DIRECTIONS[d];
      for (let i = 0; i < ring; i++) {
        pos.push([q, r]);
        q += dq; r += dr;
      }
    }
  }
  return pos;
}

// Pointy-top corners in axial-fractional coords, starting NE and going clockwise.
export function hexCorners(q, r) {
  return [
    [q + 2 / 3, r - 1 / 3],
    [q + 1 / 3, r + 1 / 3],
    [q - 1 / 3, r + 2 / 3],
    [q - 2 / 3, r + 1 / 3],
    [q - 1 / 3, r - 1 / 3],
    [q + 1 / 3, r - 2 / 3],
  ];
}

const cache = new Map();

export function edgeKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

/**
 * @returns {{
 *  rings:number, hexes:{q:number,r:number}[], hexAdj:number[][], hexIntersections:number[][],
 *  intersections:{id:number,hexIds:number[],q:number,r:number}[],
 *  edges:{id:number,a:number,b:number}[], adjInter:number[][], interEdges:number[][],
 *  edgeBetween:Map<string,number>
 * }}
 */
export function topology(rings) {
  const hit = cache.get(rings);
  if (hit) return hit;

  const pos = hexPositions(rings);
  const hexes = pos.map(([q, r]) => ({ q, r }));
  const idByKey = new Map(pos.map(([q, r], i) => [`${q},${r}`, i]));
  const hexAdj = pos.map(([q, r]) =>
    HEX_DIRECTIONS.map(([dq, dr]) => idByKey.get(`${q + dq},${r + dr}`)).filter((x) => x !== undefined));

  const cornerToIid = new Map();
  const intersections = [];
  const hexIntersections = [];
  pos.forEach(([q, r], hid) => {
    const iids = [];
    for (const [cq, cr] of hexCorners(q, r)) {
      const key = `${Math.round(cq * 3)},${Math.round(cr * 3)}`;
      let iid = cornerToIid.get(key);
      if (iid === undefined) {
        iid = intersections.length;
        cornerToIid.set(key, iid);
        intersections.push({ id: iid, hexIds: [hid], q: cq, r: cr });
      } else if (!intersections[iid].hexIds.includes(hid)) {
        intersections[iid].hexIds.push(hid);
      }
      iids.push(iid);
    }
    hexIntersections.push(iids);
  });

  const edges = [];
  const edgeBetween = new Map();
  for (const iids of hexIntersections) {
    for (let i = 0; i < 6; i++) {
      const a = iids[i], b = iids[(i + 1) % 6];
      const key = edgeKey(a, b);
      if (!edgeBetween.has(key)) {
        edgeBetween.set(key, edges.length);
        edges.push({ id: edges.length, a: Math.min(a, b), b: Math.max(a, b) });
      }
    }
  }

  const adjInter = intersections.map(() => []);
  const interEdges = intersections.map(() => []);
  for (const e of edges) {
    adjInter[e.a].push(e.b);
    adjInter[e.b].push(e.a);
    interEdges[e.a].push(e.id);
    interEdges[e.b].push(e.id);
  }

  const topo = { rings, hexes, hexAdj, hexIntersections, intersections, edges, adjInter, interEdges, edgeBetween };
  cache.set(rings, topo);
  return topo;
}
