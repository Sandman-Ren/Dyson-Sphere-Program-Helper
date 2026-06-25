import type { MachineOverrides, RecipeOverrides } from '../../calculator/index.js';
import type { TimeUnit } from '../hooks/useCalculator.js';

export interface SnapshotTarget { item: string; amount: number; unit: TimeUnit; }

export interface SetupSnapshot {
  v: 1;
  targets: SnapshotTarget[];
  displayUnit: TimeUnit;
  proliferatorId: string;
  machineOverrides: MachineOverrides;
  recipeOverrides: RecipeOverrides[];
}

export interface StoredSetup { id: string; name: string; snapshot: SetupSnapshot; }
export interface StoredSetups { v: 1; setups: StoredSetup[]; activeId: string | null; }

export interface SnapshotValidators {
  isValidItem(id: string): boolean;
  isValidMachine(id: string): boolean;
  isValidProliferator(id: string): boolean;
}

const STORAGE_KEY = 'dsp-setups';
const UNITS: TimeUnit[] = ['second', 'minute', 'hour'];
const emptyStore = (): StoredSetups => ({ v: 1, setups: [], activeId: null });

// ---- localStorage ----
export function loadStoredSetups(): StoredSetups {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.setups)) return emptyStore();
    return parsed as StoredSetups;
  } catch {
    return emptyStore();
  }
}

export function saveStoredSetups(s: StoredSetups): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore quota */ }
}

// ---- URL share (base64url of JSON, Unicode-safe, no deps) ----
function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSetupUrl(snapshot: SetupSnapshot): string {
  return toBase64Url(JSON.stringify(snapshot));
}

export function decodeSetupUrl(raw: string): SetupSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.targets)) return null;
    return parsed as SetupSnapshot;
  } catch {
    return null;
  }
}

// ---- canonical key for dirty detection (sorted object keys; array order kept) ----
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    return Object.keys(src).sort().reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = stable(src[k]);
      return acc;
    }, {});
  }
  return value;
}
export function canonicalSnapshotKey(s: SetupSnapshot): string {
  return JSON.stringify(stable(s));
}

// ---- sanitization of untrusted input (decoded URLs / corrupt storage) ----
const isUnit = (u: unknown): u is TimeUnit => typeof u === 'string' && (UNITS as string[]).includes(u);

function sanitizeRecord(value: unknown): RecipeOverrides {
  const out: RecipeOverrides = {};
  if (value && typeof value === 'object') {
    for (const [k, val] of Object.entries(value as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val;
    }
  }
  return out;
}

export function sanitizeSnapshot(input: unknown, v: SnapshotValidators): SetupSnapshot {
  const src = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  const rawTargets = Array.isArray(src.targets) ? src.targets : [];
  const rawRecipes = Array.isArray(src.recipeOverrides) ? src.recipeOverrides : [];

  const targets: SnapshotTarget[] = [];
  const recipeOverrides: RecipeOverrides[] = [];
  rawTargets.forEach((t, i) => {
    const tt = (t && typeof t === 'object') ? t as Record<string, unknown> : {};
    const item = typeof tt.item === 'string' ? tt.item : '';
    if (item && !v.isValidItem(item)) return; // drop unknown product
    const amount = typeof tt.amount === 'number' && Number.isFinite(tt.amount) && tt.amount >= 0 ? tt.amount : 0;
    const unit = isUnit(tt.unit) ? tt.unit : 'minute';
    targets.push({ item, amount, unit });
    recipeOverrides.push(sanitizeRecord(rawRecipes[i]));
  });
  if (targets.length === 0) {
    targets.push({ item: '', amount: 60, unit: 'minute' });
    recipeOverrides.push({});
  }

  const machineOverrides: MachineOverrides = {};
  const mo = (src.machineOverrides && typeof src.machineOverrides === 'object')
    ? src.machineOverrides as Record<string, unknown> : {};
  for (const [item, machine] of Object.entries(mo)) {
    if (typeof machine === 'string' && v.isValidItem(item) && v.isValidMachine(machine)) {
      machineOverrides[item] = machine;
    }
  }

  const proliferatorId = typeof src.proliferatorId === 'string' && v.isValidProliferator(src.proliferatorId)
    ? src.proliferatorId : 'none';
  const displayUnit = isUnit(src.displayUnit) ? src.displayUnit : 'minute';

  return { v: 1, targets, displayUnit, proliferatorId, machineOverrides, recipeOverrides };
}
