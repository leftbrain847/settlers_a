// Declarative lobby settings: one source of truth for labels, defaults and how they map to configFromSettings().
import type { Settings } from '../engine/types.ts';

export type SettingValue = number | string | boolean;
interface Base { key: string; label: string }
export type Field =
  | { group: string }
  | (Base & { type: 'number'; def: number; min: number; max: number })
  | (Base & { type: 'range'; def: number; min: number; max: number; fmt: (v: number) => string })
  | (Base & { type: 'select'; def: string; options: [string, string][] })
  | (Base & { type: 'checkbox'; def: boolean });

export const FIELDS: Field[] = [
  { key: 'vp_to_win', label: 'Victory points to win', type: 'number', def: 10, min: 3, max: 100 },
  { key: 'board_rings', label: 'Board size', type: 'range', def: 3, min: 2, max: 8, fmt: (v: number) => `${v} rings, ${3 * v * (v - 1) + 1} hexes` },
  { key: 'starting_resources', label: 'Starting resources', type: 'select', def: 'none', options: [['none', 'None (standard)'], ['some', '5 random'], ['plenty', '10 random']] },
  { key: 'friendly_robber', label: 'Friendly robber (no stealing for the first 3 turns)', type: 'checkbox', def: false },
  { key: 'discard_threshold', label: 'Cards before a 7 forces a discard', type: 'number', def: 7, min: 1, max: 50 },
  { group: 'Pieces per player' },
  { key: 'max_roads', label: 'Roads', type: 'number', def: 15, min: 1, max: 99 },
  { key: 'max_settlements', label: 'Settlements', type: 'number', def: 5, min: 1, max: 99 },
  { key: 'max_cities', label: 'Cities', type: 'number', def: 4, min: 1, max: 99 },
  { group: 'Development cards in the deck' },
  { key: 'dev_cards.knight', label: 'Knights', type: 'number', def: 14, min: 0, max: 99 },
  { key: 'dev_cards.road_building', label: 'Road Building', type: 'number', def: 2, min: 0, max: 99 },
  { key: 'dev_cards.year_of_plenty', label: 'Year of Plenty', type: 'number', def: 2, min: 0, max: 99 },
  { key: 'dev_cards.monopoly', label: 'Monopoly', type: 'number', def: 2, min: 0, max: 99 },
  { key: 'dev_cards.victory_point', label: 'Victory Point', type: 'number', def: 5, min: 0, max: 99 },
  { group: 'Ports (standard board only)' },
  { key: 'port_counts.generic', label: '3:1 generic', type: 'number', def: 4, min: 0, max: 20 },
  { key: 'port_counts.clay_port', label: '2:1 Clay', type: 'number', def: 1, min: 0, max: 20 },
  { key: 'port_counts.wood_port', label: '2:1 Wood', type: 'number', def: 1, min: 0, max: 20 },
  { key: 'port_counts.rock_port', label: '2:1 Rock', type: 'number', def: 1, min: 0, max: 20 },
  { key: 'port_counts.wheat_port', label: '2:1 Wheat', type: 'number', def: 1, min: 0, max: 20 },
  { key: 'port_counts.sheep_port', label: '2:1 Sheep', type: 'number', def: 1, min: 0, max: 20 },
  { group: 'Trade timers (seconds)' },
  { key: 'human_response_timer', label: 'Humans answering a human offer', type: 'number', def: 70, min: 5, max: 600 },
  { key: 'bot_offer_timer', label: 'Bot offers waiting on humans', type: 'number', def: 20, min: 3, max: 120 },
  { key: 'counter_timer', label: 'Counter-offers', type: 'number', def: 15, min: 3, max: 120 },
];

export const defaults = (): Record<string, SettingValue> => {
  const out: Record<string, SettingValue> = {};
  for (const f of FIELDS) if (!('group' in f)) out[f.key] = f.def;
  return out;
};

/** values: flat { 'dev_cards.knight': 14, ... } -> nested settings for configFromSettings. */
export function toSettings(values: Record<string, SettingValue>): Settings {
  const out: Record<string, unknown> = {};
  const rings = Number(values.board_rings ?? 3);
  for (const [k, v] of Object.entries(values)) {
    if (k.startsWith('port_counts.') && rings !== 3) continue;
    const [a, b] = k.split('.');
    if (a === undefined) continue;
    if (b) ((out[a] ??= {}) as Record<string, unknown>)[b] = v;
    else out[a] = v;
  }
  // configFromSettings validates and coerces every field, so this is the one deliberate boundary cast.
  return out as Settings;
}
