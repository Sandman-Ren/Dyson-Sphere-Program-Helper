import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  solve, familyOfMachine, MACHINE_FAMILY_ORDER,
  type MachineFamily, type MachineOverrides, type MachineTiers,
  type RecipeOverrides, type ProductionPlan,
} from '../../calculator/index.js';
import { graph, proliferators } from '../data.js';

export type TimeUnit = 'second' | 'minute' | 'hour';
const UNIT_SECONDS: Record<TimeUnit, number> = { second: 1, minute: 60, hour: 3600 };

const TIERS_KEY = 'dsp-machine-tiers';

/** Keep only known families whose stored machine id still belongs to that family. */
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

export interface CalculatorState {
  targetItem: string;
  setTargetItem: (id: string) => void;
  amount: number;
  setAmount: React.Dispatch<React.SetStateAction<number>>;
  timeUnit: TimeUnit;
  setTimeUnit: (u: TimeUnit) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  machineTiers: MachineTiers;
  /** Set (machineId) or clear (null) the global default tier for a family. */
  setMachineTier: (family: MachineFamily, machineId: string | null) => void;
  /** Drop every per-node override whose machine belongs to a family. */
  resetFamilyOverrides: (family: MachineFamily) => void;
  recipeOverrides: RecipeOverrides;
  /** Set (recipeId) or clear (null) the recipe for a node path. */
  setRecipeOverride: (path: string, recipeId: string | null) => void;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  plan: ProductionPlan | null;
}

export function useCalculator(): CalculatorState {
  const [targetItem, setTargetItem] = useState<string>('electromagnetic-matrix');
  const [amount, setAmount] = useState<number>(60);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minute');
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  const [machineTiers, setMachineTiers] = useState<MachineTiers>(loadMachineTiers);
  const [recipeOverrides, setRecipeOverrides] = useState<RecipeOverrides>({});
  const [proliferatorId, setProliferatorId] = useState<string>('none');

  useEffect(() => {
    try {
      localStorage.setItem(TIERS_KEY, JSON.stringify(machineTiers));
    } catch {
      /* storage unavailable — keep the in-memory selection */
    }
  }, [machineTiers]);

  // Per-occurrence recipe choices are keyed by tree path, so they only make
  // sense for the current target's chain — drop them when the target changes.
  useEffect(() => { setRecipeOverrides({}); }, [targetItem]);

  const setRecipeOverride = useCallback((path: string, recipeId: string | null) => {
    setRecipeOverrides((prev) => {
      const next = { ...prev };
      if (recipeId) next[path] = recipeId;
      else delete next[path];
      return next;
    });
  }, []);

  const setMachineTier = useCallback((family: MachineFamily, machineId: string | null) => {
    setMachineTiers((prev) => {
      const next = { ...prev };
      if (machineId) next[family] = machineId;
      else delete next[family];
      return next;
    });
  }, []);

  const resetFamilyOverrides = useCallback((family: MachineFamily) => {
    setMachineOverrides((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([, mid]) => familyOfMachine(mid) !== family)),
    );
  }, []);

  const plan = useMemo<ProductionPlan | null>(() => {
    if (!targetItem || !graph.itemToRecipe.has(targetItem)) return null;
    const perSecond = amount / UNIT_SECONDS[timeUnit];
    const proliferator = proliferators.find((p) => p.id === proliferatorId) ?? null;
    return solve(graph, targetItem, perSecond, machineOverrides, { proliferator }, machineTiers, recipeOverrides);
  }, [targetItem, amount, timeUnit, machineOverrides, proliferatorId, machineTiers, recipeOverrides]);

  return {
    targetItem, setTargetItem,
    amount, setAmount,
    timeUnit, setTimeUnit,
    machineOverrides, setMachineOverrides,
    machineTiers, setMachineTier, resetFamilyOverrides,
    recipeOverrides, setRecipeOverride,
    proliferatorId, setProliferatorId,
    plan,
  };
}

export { UNIT_SECONDS };
