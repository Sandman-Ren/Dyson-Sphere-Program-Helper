import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  solve, findIntegerMultiplierForValues, familyOfMachine, MACHINE_FAMILY_ORDER,
  extractConsumption, computeAllocation,
  type MachineFamily, type MachineOverrides, type MachineTiers, type RecipeOverrides,
  type ProductionPlan, type VariableInput, type AllocationResult,
} from '../../calculator/index.js';
import {
  combinePlans, collectMachineCounts, buildSharedComponents,
  type CombinedTotals, type SharedComponentsResult,
} from '../../calculator/shared-components.js';
import { graph, proliferators } from '../data.js';
import type { SetupSnapshot, PinnedSupplyEntry, TargetMode } from '../lib/setups.js';

export type TimeUnit = 'second' | 'minute' | 'hour';
const UNIT_SECONDS: Record<TimeUnit, number> = { second: 1, minute: 60, hour: 3600 };

const TIERS_KEY = 'dsp-machine-tiers';
let rowSeq = 0;

export interface CalcTarget {
  id: string;
  item: string;
  amount: number;
  /** The unit the player entered `amount` in. */
  unit: TimeUnit;
  /** 'fixed' (hard rate) or 'variable' (rate derived from the bottleneck pool). */
  mode: TargetMode;
  /** Variable only: intent tracks the live sliderMax until the user drags it. */
  followMax: boolean;
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
  setTargetUnit: (id: string, unit: TimeUnit) => void;
  /** Replace the whole list with one item (deep-link from other tabs). */
  setSingleTarget: (item: string) => void;
  /** Unit used to display every computed rate. */
  displayUnit: TimeUnit;
  setDisplayUnit: (u: TimeUnit) => void;
  scaleAllAmounts: (k: number) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  machineTiers: MachineTiers;
  setMachineTier: (family: MachineFamily, machineId: string | null) => void;
  resetFamilyOverrides: (family: MachineFamily) => void;
  recipeOverridesByTarget: Record<string, RecipeOverrides>;
  setRecipeOverride: (targetId: string, path: string, recipeId: string | null) => void;
  pinnedSupply: Record<string, PinnedSupplyEntry>;
  setTargetMode: (id: string, mode: TargetMode) => void;
  setVariableRate: (id: string, ratePerSecond: number) => void;
  setPinnedSupply: (item: string, amount: number, unit: TimeUnit) => void;
  removePinnedSupply: (item: string) => void;
  allocation: AllocationResult;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  focusedItem: string | null;
  setFocusedItem: (item: string | null) => void;
  getSnapshot: () => SetupSnapshot;
  applySnapshot: (snapshot: SetupSnapshot) => void;
  // Derived
  solved: SolvedTarget[];
  combined: CombinedTotals | null;
  integerMultiplier: number | null;
  shared: SharedComponentsResult;
}

const newTarget = (item: string, unit: TimeUnit = 'minute', amount = 60): CalcTarget =>
  ({ id: `t${rowSeq++}`, item, amount, unit, mode: 'fixed', followMax: false });

export function useCalculator(): CalculatorState {
  const [targets, setTargets] = useState<CalcTarget[]>(() => [newTarget('')]);
  const [displayUnit, setDisplayUnit] = useState<TimeUnit>('minute');
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  const [machineTiers, setMachineTiers] = useState<MachineTiers>(loadMachineTiers);
  const [recipeOverridesByTarget, setRecipeOverridesByTarget] = useState<Record<string, RecipeOverrides>>({});
  const [pinnedSupply, setPinnedSupplyState] = useState<Record<string, PinnedSupplyEntry>>({});
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
    // Adopting an item that is currently pinned would self-couple it to its own
    // ceiling — drop the pin (reverse pin/target guard).
    setPinnedSupplyState((prev) => {
      if (!(item in prev)) return prev;
      const next = { ...prev }; delete next[item]; return next;
    });
  }, []);
  const setTargetAmount = useCallback((id: string, amount: number) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, amount: Math.max(0, amount) } : t)));
  }, []);
  const setTargetUnit = useCallback((id: string, unit: TimeUnit) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, unit } : t)));
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

  const setTargetMode = useCallback((id: string, mode: TargetMode) => {
    setTargets((prev) => prev.map((t) => (
      t.id === id
        ? { ...t, mode, followMax: mode === 'variable' }
        : t
    )));
  }, []);

  const setVariableRate = useCallback((id: string, ratePerSecond: number) => {
    // A slider commit pins an explicit intent (in the target's unit) and stops following max.
    setTargets((prev) => prev.map((t) => (
      t.id === id
        ? { ...t, followMax: false, amount: Math.max(0, ratePerSecond * UNIT_SECONDS[t.unit]) }
        : t
    )));
  }, []);

  const setPinnedSupply = useCallback((item: string, amount: number, unit: TimeUnit) => {
    setPinnedSupplyState((prev) => ({ ...prev, [item]: { amount: Math.max(0, amount), unit } }));
  }, []);
  const removePinnedSupply = useCallback((item: string) => {
    setPinnedSupplyState((prev) => {
      const next = { ...prev }; delete next[item]; return next;
    });
  }, []);

  const proliferator = useMemo(() => proliferators.find((p) => p.id === proliferatorId) ?? null, [proliferatorId]);

  const getSnapshot = useCallback((): SetupSnapshot => ({
    v: 2,
    targets: targets.map((t) => ({ item: t.item, amount: t.amount, unit: t.unit, mode: t.mode, followMax: t.followMax })),
    displayUnit,
    proliferatorId,
    machineOverrides,
    recipeOverrides: targets.map((t) => recipeOverridesByTarget[t.id] ?? {}),
    pinnedSupply,
  }), [targets, displayUnit, proliferatorId, machineOverrides, recipeOverridesByTarget, pinnedSupply]);

  const applySnapshot = useCallback((snapshot: SetupSnapshot) => {
    const restored = snapshot.targets.map((t) => ({
      id: `t${rowSeq++}`, item: t.item, amount: t.amount, unit: t.unit, mode: t.mode, followMax: t.followMax,
    }));
    const overrides: Record<string, RecipeOverrides> = {};
    restored.forEach((t, i) => {
      const ro = snapshot.recipeOverrides[i];
      if (ro && Object.keys(ro).length > 0) overrides[t.id] = { ...ro };
    });
    setTargets(restored.length > 0 ? restored : [newTarget('')]);
    setDisplayUnit(snapshot.displayUnit);
    setProliferatorId(snapshot.proliferatorId);
    setMachineOverrides({ ...snapshot.machineOverrides });
    setRecipeOverridesByTarget(overrides);
    setPinnedSupplyState({ ...snapshot.pinnedSupply });
  }, []);

  // Pinned pool in items/s. Defensively exclude any item that is ALSO a current
  // target's output — pinning a target's own output would self-couple it to its
  // own ceiling (the reverse pin/target guard, enforced regardless of how state
  // was reached, including loaded URLs).
  const targetItems = useMemo(() => new Set(targets.map((t) => t.item).filter(Boolean)), [targets]);
  const pinnedIPS = useMemo(() => {
    const m = new Map<string, number>();
    for (const [item, e] of Object.entries(pinnedSupply)) {
      if (targetItems.has(item)) continue;
      m.set(item, e.amount / UNIT_SECONDS[e.unit]);
    }
    return m;
  }, [pinnedSupply, targetItems]);

  // Fixed targets: solve at real rate; reuse plan downstream. Variable: unit-solve for footprint.
  const fixedSolved = useMemo<SolvedTarget[]>(() =>
    targets
      .filter((t) => t.mode === 'fixed' && graph.itemToRecipe.has(t.item) && t.amount > 0)
      .map((t) => ({
        target: t,
        plan: solve(graph, t.item, t.amount / UNIT_SECONDS[t.unit],
          machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id]),
      })),
    [targets, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget]);

  const variableFootprints = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const t of targets) {
      if (t.mode !== 'variable' || !graph.itemToRecipe.has(t.item)) continue;
      const unitPlan = solve(graph, t.item, 1,
        machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id]);
      m.set(t.id, extractConsumption(unitPlan));
    }
    return m;
  }, [targets, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget]);

  const allocation = useMemo<AllocationResult>(() => {
    const fixedUse = new Map<string, number>();
    for (const { plan } of fixedSolved) {
      for (const [c, r] of extractConsumption(plan)) fixedUse.set(c, (fixedUse.get(c) ?? 0) + r);
    }
    const variableInputs: VariableInput[] = [];
    for (const t of targets) {
      if (t.mode !== 'variable') continue;
      const footprint = variableFootprints.get(t.id);
      if (!footprint) continue; // recipe-less variable target → not solvable, skip
      const amountIPS = t.amount / UNIT_SECONDS[t.unit];
      variableInputs.push({
        id: t.id, footprint,
        intent: t.followMax ? Infinity : amountIPS,
        fallback: amountIPS,
      });
    }
    return computeAllocation(pinnedIPS, fixedUse, variableInputs);
  }, [targets, fixedSolved, variableFootprints, pinnedIPS]);

  const solved = useMemo<SolvedTarget[]>(() => {
    // Reuse the already-solved fixed plans; only variable targets are solved here
    // (at their allocation-resolved effective rate), preserving target order.
    const fixedById = new Map(fixedSolved.map((s) => [s.target.id, s]));
    const out: SolvedTarget[] = [];
    for (const t of targets) {
      if (t.mode === 'fixed') {
        const s = fixedById.get(t.id);
        if (s) out.push(s);
        continue;
      }
      if (!graph.itemToRecipe.has(t.item)) continue;
      const rateIPS = allocation.targets.get(t.id)?.effectiveRate ?? 0;
      if (rateIPS <= 0) continue;
      out.push({
        target: t,
        plan: solve(graph, t.item, rateIPS,
          machineOverrides, { proliferator }, machineTiers, recipeOverridesByTarget[t.id]),
      });
    }
    return out;
  }, [targets, fixedSolved, allocation, machineOverrides, proliferator, machineTiers, recipeOverridesByTarget]);

  const plans = useMemo(() => solved.map((s) => s.plan), [solved]);
  const combined = useMemo(() => (plans.length ? combinePlans(plans) : null), [plans]);
  const integerMultiplier = useMemo(() => {
    const values = collectMachineCounts(plans);
    return values.length ? findIntegerMultiplierForValues(values) : null;
  }, [plans]);
  const shared = useMemo(() => buildSharedComponents(plans), [plans]);

  return {
    targets, addTarget, removeTarget, setTargetItem, setTargetAmount, setTargetUnit, setSingleTarget,
    displayUnit, setDisplayUnit, scaleAllAmounts,
    machineOverrides, setMachineOverrides,
    machineTiers, setMachineTier, resetFamilyOverrides,
    recipeOverridesByTarget, setRecipeOverride,
    pinnedSupply, setTargetMode, setVariableRate, setPinnedSupply, removePinnedSupply, allocation,
    proliferatorId, setProliferatorId,
    focusedItem, setFocusedItem,
    getSnapshot, applySnapshot,
    solved, combined, integerMultiplier, shared,
  };
}

export { UNIT_SECONDS };
