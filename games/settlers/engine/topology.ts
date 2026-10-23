// Pure board geometry derived from the ring count. Not part of game state:
// both server and client rebuild it from `board.rings`, so it never crosses the wire.

export const HEX_DIRECTIONS: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export interface Topology {
  rings: number;
  hexes: { q: number; r: number }[];
  hexAdj: number[][];
  hexIntersections: number[][];
  intersections: { id: number; hexIds: number[]; q: number; r: number }[];
  edges: { id: number; a: number; b: number }[];
  adjInter: number[][];
  interEdges: number[][];
  edgeBetween: Map<string, number>;
}

export function hexPositions(rings: number): [number, number][] {
  const pos: [number, number][] = [[0, 0]];
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
export function hexCorners(q: number, r: number): [number, number][] {
  return [
    [q + 2 / 3, r - 1 / 3],
    [q + 1 / 3, r + 1 / 3],
    [q - 1 / 3, r + 2 / 3],
    [q - 2 / 3, r + 1 / 3],
    [q - 1 / 3, r - 1 / 3],
    [q + 1 / 3, r - 2 / 3],
  ];
}

const cache = new Map<number, Topology>();

export function edgeKey(a: number, b: number): string {
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
export function topology(rings: number): Topology {
  const hit = cache.get(rings);
  if (hit) return hit;

  const pos = hexPositions(rings);
  const hexes = pos.map(([q, r]) => ({ q, r }));
  const idByKey = new Map<string, number>(pos.map(([q, r], i) => [`${q},${r}`, i]));
  const hexAdj = pos.map(([q, r]) =>
    HEX_DIRECTIONS.map(([dq, dr]) => idByKey.get(`${q + dq},${r + dr}`)).filter((x): x is number => x !== undefined));

  const cornerToIid = new Map<string, number>();
  const intersections: Topology['intersections'] = [];
  const hexIntersections: number[][] = [];
  pos.forEach(([q, r], hid) => {
    const iids: number[] = [];
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

  const edges: Topology['edges'] = [];
  const edgeBetween = new Map<string, number>();
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

  const adjInter: number[][] = intersections.map(() => []);
  const interEdges: number[][] = intersections.map(() => []);
  for (const e of edges) {
    adjInter[e.a].push(e.b);
    adjInter[e.b].push(e.a);
    interEdges[e.a].push(e.id);
    interEdges[e.b].push(e.id);
  }

  const topo: Topology = { rings, hexes, hexAdj, hexIntersections, intersections, edges, adjInter, interEdges, edgeBetween };
  cache.set(rings, topo);
  return topo;
}
