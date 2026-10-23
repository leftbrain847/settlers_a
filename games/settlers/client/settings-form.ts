import { h, inputOf, selectOf } from './dom.ts';
import { FIELDS } from './settings.ts';
import type { SettingValue } from './settings.ts';

/** The shared settings form (local lobby and room lobby). Edits `values` in place and calls onChange. */
export function settingsFields(values: Record<string, SettingValue>, onChange: () => void = () => undefined): HTMLElement[] {
  return FIELDS.map((f) => {
    if ('group' in f) return h('h4.group', f.group);
    const val = values[f.key] ?? f.def;
    const set = (v: SettingValue): void => { values[f.key] = v; onChange(); };
    let input: HTMLElement;
    if (f.type === 'select') input = h('select', { onchange: (e) => set(selectOf(e).value) }, f.options.map(([v, l]) => h('option', { value: v, selected: v === val }, l)));
    else if (f.type === 'checkbox') input = h('input', { type: 'checkbox', checked: !!val, onchange: (e) => set(inputOf(e).checked) });
    else if (f.type === 'range') {
      const out = h('span.dim.small', f.fmt(Number(val)));
      input = h('div.rangewrap', h('input', { type: 'range', min: f.min, max: f.max, value: val, oninput: (e) => { const n = Number(inputOf(e).value); out.textContent = f.fmt(n); set(n); } }), out);
    } else input = h('input', { type: 'number', inputmode: 'numeric', min: f.min, max: f.max, value: val, onchange: (e) => { const el = inputOf(e); const v = Math.min(f.max, Math.max(f.min, Number(el.value) || f.def)); el.value = String(v); set(v); } });
    return h('label.field', h('span', f.label), input);
  });
}
