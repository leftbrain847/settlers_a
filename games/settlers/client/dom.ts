const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'line', 'polygon', 'rect', 'text', 'defs']);

export type Child = Node | string | number | boolean | null | undefined | Child[];
export interface Props {
  [attr: string]: unknown;
  onclick?: (e: MouseEvent) => void;
  onchange?: (e: Event) => void;
  oninput?: (e: Event) => void;
  style?: Record<string, string>;
  dataset?: Record<string, string | number>;
}

const isChild = (x: unknown): x is Child =>
  x == null || x instanceof Node || typeof x === 'string' || typeof x === 'number' || Array.isArray(x);

function build(spec: string, propsOrChild: Props | Child, rest: Child[]): HTMLElement | SVGElement {
  let props: Props = {};
  const kids: Child[] = [...rest];
  if (isChild(propsOrChild)) {
    if (propsOrChild !== undefined && propsOrChild !== null) kids.unshift(propsOrChild);
  } else {
    props = propsOrChild as Props;
  }
  const [tagAndClass = '', id] = spec.split('#');
  const [tag = '', ...classes] = tagAndClass.split('.');
  const el: HTMLElement | SVGElement = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) as SVGElement : document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.setAttribute('class', classes.join(' '));
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v as Record<string, string>)) {
        // Custom properties (--c, --pc) only work through setProperty; plain assignment is silently ignored.
        if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
        else (el.style as unknown as Record<string, string>)[sk] = String(sv);
      }
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v as Record<string, string | number>)) el.dataset[dk] = String(dv);
    } else if (k === 'class') el.setAttribute('class', (el.getAttribute('class') ?? '') + ' ' + String(v));
    else if (k === 'disabled' || k === 'checked' || k === 'selected') { if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child): void => {
    if (c === undefined || c === null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

/** Tiny hyperscript: h('div.card#id', {onclick, style:{}, dataset:{}}, child, ...). */
export function h<T extends HTMLElement = HTMLElement>(spec: string, props?: Props | Child, ...kids: Child[]): T {
  return build(spec, props, kids) as T;
}

/** Same as h() for SVG elements. */
export function sv<T extends SVGElement = SVGElement>(spec: string, props?: Props | Child, ...kids: Child[]): T {
  return build(spec, props, kids) as T;
}

export function clear<T extends Element>(el: T): T {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount<T extends Element>(el: T, ...kids: (Node | null | undefined | false)[]): T {
  clear(el);
  kids.forEach((k) => k && el.append(k));
  return el;
}

export const inputOf = (e: Event): HTMLInputElement => e.target as HTMLInputElement;
export const selectOf = (e: Event): HTMLSelectElement => e.target as HTMLSelectElement;
