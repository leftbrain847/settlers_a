// Small glyphs (24x24, drawn with currentColor) so the game can show things instead of describing them.
import { sv } from './dom.ts';

export type IconName =
  | 'clay' | 'wood' | 'rock' | 'wheat' | 'sheep' | 'dunes'
  | 'card' | 'deck' | 'dice' | 'house' | 'city' | 'road' | 'robber' | 'star' | 'knight' | 'plenty' | 'crown' | 'bank' | 'swap' | 'sword';

type Draw = () => SVGElement[];
const P = (d: string, extra: Record<string, string> = {}): SVGElement => sv('path', { d, ...extra });
const R = (x: number, y: number, w: number, h: number, rx = 1.2, extra: Record<string, string> = {}): SVGElement => sv('rect', { x, y, width: w, height: h, rx, ...extra });
const C = (cx: number, cy: number, r: number, extra: Record<string, string> = {}): SVGElement => sv('circle', { cx, cy, r, ...extra });
const dim = { opacity: '0.45' };

const DRAW: Record<IconName, Draw> = {
  clay: () => [R(2.5, 14, 9, 6), R(12.5, 14, 9, 6), R(7.5, 6.5, 9, 6), R(2.5, 6.5, 3.6, 6), R(17.9, 6.5, 3.6, 6)],
  wood: () => [P('M12 2 L19 11 H15 L21 19 H3 L9 11 H5 Z'), R(10.8, 19, 2.4, 3.5, 0.4)],
  rock: () => [P('M1.5 20.5 L8.5 6.5 L13 14 L16 9.5 L22.5 20.5 Z'), P('M8.5 6.5 L10.6 10.7 L8.5 9.6 L6.4 10.7 Z', { fill: '#fff', opacity: '0.85' })],
  wheat: () => [R(11.2, 8, 1.6, 14, 0.5), C(12, 4.6, 2.1), C(8.6, 8.2, 2.1), C(15.4, 8.2, 2.1), C(8.6, 12.4, 2.1), C(15.4, 12.4, 2.1), C(8.6, 16.6, 2.1), C(15.4, 16.6, 2.1)],
  sheep: () => [C(8, 11, 4.4), C(13, 8.6, 4.8), C(16.4, 12.4, 4.4), C(10.4, 14.6, 4.2), R(7, 17, 1.8, 4.4, 0.6), R(14.4, 17, 1.8, 4.4, 0.6), sv('ellipse', { cx: 19.6, cy: 9.6, rx: 2.4, ry: 3, fill: '#1c1c1c' })],
  dunes: () => [P('M1 19 Q6 9 11 15 Q15 8 23 19 Z'), C(18.5, 5.5, 2.6, dim)],
  card: () => [R(5, 2.5, 14, 19, 2.2), R(7.8, 5.5, 8.4, 13, 1.2, { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.2', opacity: '0.55' })],
  deck: () => [R(7, 4, 13, 17, 2, dim), R(4.5, 2.5, 13, 17, 2)],
  dice: () => [R(3, 3, 18, 18, 4), C(8.2, 8.2, 1.7, { fill: '#fff' }), C(15.8, 8.2, 1.7, { fill: '#fff' }), C(12, 12, 1.7, { fill: '#fff' }), C(8.2, 15.8, 1.7, { fill: '#fff' }), C(15.8, 15.8, 1.7, { fill: '#fff' })],
  house: () => [P('M3 11.5 L12 3 L21 11.5 H18.5 V20.5 H5.5 V11.5 Z')],
  city: () => [P('M2.5 20.5 V10.5 H8.5 V5 L12 2.5 L15.5 5 V10.5 H21.5 V20.5 Z')],
  road: () => [P('M9.5 2.5 H14.5 L19.5 21.5 H4.5 Z'), R(11.2, 4.5, 1.6, 3.4, 0.4, { fill: '#fff', opacity: '0.8' }), R(11.2, 10.5, 1.6, 3.4, 0.4, { fill: '#fff', opacity: '0.8' }), R(11.2, 16.5, 1.6, 3.4, 0.4, { fill: '#fff', opacity: '0.8' })],
  robber: () => [C(12, 6.2, 4), P('M6.5 21.5 L8.8 11 H15.2 L17.5 21.5 Z')],
  star: () => [P('M12 2.5 L14.9 8.8 L21.7 9.5 L16.6 14.1 L18.1 20.9 L12 17.4 L5.9 20.9 L7.4 14.1 L2.3 9.5 L9.1 8.8 Z')],
  knight: () => [P('M12 2.5 L20 5.5 V12 C20 17 16.5 20.2 12 21.8 C7.5 20.2 4 17 4 12 V5.5 Z'), P('M12 7 V17 M8 11 H16', { stroke: '#fff', 'stroke-width': '1.8', fill: 'none', opacity: '0.85' })],
  plenty: () => [R(3, 5, 10, 14, 1.8), R(11, 5, 10, 14, 1.8, dim), P('M8 9 V15 M5 12 H11', { stroke: '#fff', 'stroke-width': '1.8', fill: 'none' })],
  crown: () => [P('M3 18.5 L2.5 7 L8 12 L12 5 L16 12 L21.5 7 L21 18.5 Z')],
  bank: () => [C(9, 15, 5.5), C(15, 11, 5.5, { opacity: '0.7' }), C(10, 7, 4, { opacity: '0.45' })],
  swap: () => [P('M4 8 H17 L14 4.5 M20 16 H7 L10 19.5', { stroke: 'currentColor', 'stroke-width': '2.2', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })],
  sword: () => [P('M18.5 2.5 L21.5 5.5 L10 17 L7 14 Z'), R(3.6, 13.3, 8, 2.6, 1, { transform: 'rotate(45 7.6 14.6)' }), P('M3.5 20.5 L6 18', { stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' })],
};

export function icon(name: string, size = 20, cls = ''): SVGSVGElement {
  const draw = DRAW[name as IconName] ?? DRAW.card;
  const el = sv<SVGSVGElement>('svg', { viewBox: '0 0 24 24', width: size, height: size, class: `ico ico-${name}${cls ? ' ' + cls : ''}`, 'aria-hidden': 'true', focusable: 'false' }, ...draw());
  return el;
}

/** Resource id (or terrain-less desert) to icon name; unknown resources fall back to a card. */
export const resIcon = (res: string | null | undefined): IconName => (res && res in DRAW ? (res as IconName) : res === null ? 'dunes' : 'card');

export const DEV_ICON: Record<string, IconName> = { knight: 'knight', road_building: 'road', year_of_plenty: 'plenty', monopoly: 'crown', victory_point: 'star' };
