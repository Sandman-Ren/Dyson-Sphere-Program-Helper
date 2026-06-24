import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  solve, findIntegerMultiplierForValues, familyOfMachine, MACHINE_FAMILY_ORDER,
  type MachineFamily, type MachineOverrides, type MachineTiers, type RecipeOverrides,
  type ProductionPlan,
} from '../../calculator/index.js';
import {
  combinePlans, collectMachineCounts, buildSharedComponents,
  type CombinedTotals, type SharedComponentsResult,
} from '../../calculator/shared-components.js';
import { graph, proliferators } from '../data.js';

export type TimeUnit = 'second' | 'minute' | 'hour';
const UNIT_SECONDS: Record<TimeUnit, number> = { second: 1, minute: 60, hour: 3600 };

const TIERS_KEY = 'dsp-machine-tiers';
let rowSeq = 0;

export interface CalcTarget {
  id: string;
  item: string;
  amount: number;
}

function sanitizeTiers(value: unknown): MachineTiers {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const tiers: MachineTiers = {};
  for (const family of MACHINE_FAMILY_ORDER) {
    const id = source[family];
    if (typeof id === 'string' && familyOfMachine(id) === family) tiers[family] = id;
  }
  return tiers;
}
function loadMachineTiers(): MachineTiers {
  try {
    const raw = localStorage.getItem(TIERS_KEY);
    return raw ? sanitizeTiers(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export interface SolvedTarget {
  target: CalcTarget;
  plan: ProductionPlan;
}

export interface CalculatorState {
  targets: CalcTarget[];
  addTarget: (item: string) => void;
  removeTarget: (id: string) => void;
  setTargetItem: (id: string, item: string) => void;
  setTargetAmount: (id: string, amount: number) => void;
  /** Replace the whole list with one item (deep-link from other tabs). */
  setSingleTarget: (item: string) => void;
  timeUnit: TimeUnit;
  setTimeUnit: (u: TimeUnit) => void;
  scaleAllAmounts: (k: number) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  machineTiers: MachineTiers;
  setMachineTier: (family: MachineFamily, machineId: string | null) => void;
  resetFamilyOverrides: (family: MachineFamily) => void;
  recipeOverridesByTarget: Record<string, RecipeOverrides>;
  setRecipeOverride: (targetId: string, path: string, recipeId: string | null) => void;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  focusedItem: string | null;
  setFocusedItem: (item: string | null) => void;
  // Derived
  solved: SolvedTarget[];
  combined: CombinedTotals | null;
  integerMultiplier: number | null;
  shared: SharedComponentsResult;
}

const newTarget = (item: string, amount = 60): CalcTarget => ({ id: `t${rowSeq++}`, item, amount });

export function useCalculator(): CalculatorState {
  const [targets, setTargets] = useState<CalcTarget[]>(() => [newTarget('')]);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minute');
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  const [machineTiers, setMachineTiers] = useState<MachineTiers>(loadMachineTiers);
  const [recipeOverridesByTarget, setRecipeOverridesByTarget] = useState<Record<string, RecipeOverrides>>({});
  const [proliferatorId, setProliferatorId] = useState<string>('none');
  const [focusedItem, setFocusedItem] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(TIERS_KEY, JSON.stringify(machineTiers)); } catch { /* ignore */ }
  }, [machineTiers]);

  const addTarget = useCallback((item: string) => {
    setTargets((prev) => [...prev, newTarget(item)]);
  }, []);
  const removeTarget = useCallback((id: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== id));
    setRecipeOverridesByTarget((prev) => {
      const next = { ...prev }; delete next[id]; return next;
    });
  }, []);
  const setTargetItem = useCallback((id: string, item: string) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, item } : t)));
    // Recipe overrides are keyed by this target's tree paths — drop them on item change.
    setRecipeOverridesByTarget((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev }; delete next[id]; return next;
    });
  }, []);
  const setTargetAmount = useCallback((id: string, amount: number) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, amount: Math.max(0, amount) } : t)));
  }, []);
  const setSingleTarget = useCallback((item: string) => {
    setTargets([newTarget(item)]);
    setRecipeOverridesByTarget({});
  }, []);
  const scaleAllAmounts = useCallback((k: number) => {
    setTargets((prev) => prev.map((t) => ({ ...t, amount: t.amount * k })));
  }, []);

  const setMachineTier = useCallback((family: MachineFamily, machineId: string | null) => {
    setMachineTiers((prev) => {
      const next = { ...prev };
      if (machineId) next[family] = machineId; else delete next[family];
      return next;
    });
  }, []);
  const resetFamilyOverrides = useCallback((family: MachineFamily) => {
    setMachineOverrides((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([, mid]) => familyOfMachine(mid) !== family)));
  }, []);
  const setRecipeOverride = useCallback((targetId: string, path: string, recipeId: string | null) => {
    setRecipeOverridesByTarget((prev) => {
      const cur = { ...(prev[targetId] ?? {}) };
      if (recipeId) cur[path] = recipeId; else delete cur[path];
      return { ...prev, [targetId]: cur };
    });
  }, []);

  const proliferator = useMemo(() => proliferators.find((p) => p.id === proliferatorId) ?? null, [proliferatorId]);

  const solved = useMemo<SolvedTarget[]>(() =>
    targets
      .filter((t) => graph.itemToRecipe.has(t.item) && t.amount > 0)
      .map((t) => ({
        target: t,
        plan: solve(
          graph, t.item, t.amount / UNIT_SECONDS[timeUnit],
          machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id],
        ),
      })),
    [targets, timeUnit, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget],
  );

  const plans = useMemo(() => solved.map((s) => s.plan), [solved]);
  const combined = useMemo(() => (plans.length ? combinePlans(plans) : null), [plans]);
  const integerMultiplier = useMemo(() => {
    const values = collectMachineCounts(plans);
    return values.length ? findIntegerMultiplierForValues(values) : null;
  }, [plans]);
  const shared = useMemo(() => buildSharedComponents(plans), [plans]);

  return {
    targets, addTarget, removeTarget, setTargetItem, setTargetAmount, setSingleTarget,
    timeUnit, setTimeUnit, scaleAllAmounts,
    machineOverrides, setMachineOverrides,
    machineTiers, setMachineTier, resetFamilyOverrides,
    recipeOverridesByTarget, setRecipeOverride,
    proliferatorId, setProliferatorId,
    focusedItem, setFocusedItem,
    solved, combined, integerMultiplier, shared,
  };
}

export { UNIT_SECONDS };
