const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'line', 'polygon', 'rect', 'text', 'defs']);

/** Tiny hyperscript: h('div.card#id', {onclick, style:{}, dataset:{}}, child, ...). */
export function h(spec, props, ...kids) {
  if (props instanceof Node || typeof props === 'string' || typeof props === 'number' || Array.isArray(props) || props == null) {
    if (props !== undefined && props !== null) kids.unshift(props);
    props = {};
  }
  const [tagAndClass, id] = spec.split('#');
  const [tag, ...classes] = tagAndClass.split('.');
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.setAttribute('class', classes.join(' '));
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'class') el.setAttribute('class', (el.getAttribute('class') ?? '') + ' ' + v);
    else if (k === 'disabled' || k === 'checked' || k === 'selected') { if (v) el.setAttribute(k, ''); }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c) => {
    if (c === undefined || c === null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...kids) {
  clear(el);
  kids.forEach((k) => k && el.append(k));
  return el;
}
