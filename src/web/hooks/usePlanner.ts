import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  familyOfMachine, MACHINE_FAMILY_ORDER,
  type MachineFamily, type MachineOverrides, type MachineTiers,
} from '../../calculator/index.js';
import {
  balance, groupPlan, scoreIntermediates,
  type GroupedPlan, type PlannerTarget, type BlockSuggestion,
} from '../../calculator/planner/index.js';
import { graph, proliferators } from '../data.js';
import { UNIT_SECONDS, type TimeUnit } from './useCalculator.js';

const TIERS_KEY = 'dsp-machine-tiers';
let rowSeq = 0;

export interface PlannerTargetRow {
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

export interface PlannerState {
  targets: PlannerTargetRow[];
  addTarget: (item: string) => void;
  removeTarget: (rowId: string) => void;
  setTargetItem: (rowId: string, item: string) => void;
  setTargetAmount: (rowId: string, amount: number) => void;
  timeUnit: TimeUnit;
  setTimeUnit: (u: TimeUnit) => void;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  machineTiers: MachineTiers;
  setMachineTier: (family: MachineFamily, machineId: string | null) => void;
  resetFamilyOverrides: (family: MachineFamily) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  blockItems: Set<string>;
  toggleBlock: (item: string) => void;
  suggestions: BlockSuggestion[];
  plan: GroupedPlan | null;
}

export function usePlanner(): PlannerState {
  const [targets, setTargets] = useState<PlannerTargetRow[]>([]);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minute');
  const [proliferatorId, setProliferatorId] = useState<string>('none');
  const [machineTiers, setMachineTiers] = useState<MachineTiers>(loadMachineTiers);
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  // User promotions/demotions, layered over the auto-suggested set.
  const [promoted, setPromoted] = useState<Set<string>>(new Set());
  const [demoted, setDemoted] = useState<Set<string>>(new Set());

  useEffect(() => {
    try { localStorage.setItem(TIERS_KEY, JSON.stringify(machineTiers)); } catch { /* ignore */ }
  }, [machineTiers]);

  const addTarget = useCallback((item: string) => {
    setTargets((prev) => [...prev, { id: `t${rowSeq++}`, item, amount: 60 }]);
  }, []);
  const removeTarget = useCallback((rowId: string) => {
    setTargets((prev) => prev.filter((t) => t.id !== rowId));
  }, []);
  const setTargetItem = useCallback((rowId: string, item: string) => {
    setTargets((prev) => prev.map((t) => (t.id === rowId ? { ...t, item } : t)));
  }, []);
  const setTargetAmount = useCallback((rowId: string, amount: number) => {
    setTargets((prev) => prev.map((t) => (t.id === rowId ? { ...t, amount: Math.max(0, amount) } : t)));
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

  const toggleBlock = useCallback((item: string) => {
    setPromoted((p) => {
      const next = new Set(p);
      setDemoted((d) => {
        const nd = new Set(d);
        // Flip based on current effective membership computed in the reducer scope.
        if (next.has(item)) { next.delete(item); }
        else if (nd.has(item)) { nd.delete(item); }
        else if (autoBlockRef.current.has(item)) { nd.add(item); }
        else { next.add(item); }
        return nd;
      });
      return next;
    });
  }, []);

  // The numeric targets fed to the engine.
  const numericTargets = useMemo<PlannerTarget[]>(
    () => targets
      .filter((t) => graph.itemToRecipe.has(t.item) && t.amount > 0)
      .map((t) => ({ item: t.item, ratePerSecond: t.amount / UNIT_SECONDS[timeUnit] })),
    [targets, timeUnit],
  );

  const proliferator = useMemo(
    () => proliferators.find((p) => p.id === proliferatorId) ?? null,
    [proliferatorId],
  );

  const balanced = useMemo(() => {
    if (numericTargets.length === 0) return null;
    return balance(graph, numericTargets, { machineOverrides, machineTiers, proliferator });
  }, [numericTargets, machineOverrides, machineTiers, proliferator]);

  const targetItems = useMemo(() => new Set(numericTargets.map((t) => t.item)), [numericTargets]);

  const suggestions = useMemo(
    () => (balanced ? scoreIntermediates(balanced, targetItems) : []),
    [balanced, targetItems],
  );

  // Effective auto-suggested block set (before user overrides).
  const autoBlock = useMemo(() => {
    const set = new Set<string>(targetItems);
    for (const s of suggestions) if (s.suggested) set.add(s.item);
    return set;
  }, [suggestions, targetItems]);
  // Ref so toggleBlock can read the latest auto set without re-creating the callback.
  const autoBlockRef = useRef(autoBlock);
  useEffect(() => { autoBlockRef.current = autoBlock; }, [autoBlock]);

  const blockItems = useMemo(() => {
    const set = new Set(autoBlock);
    for (const item of demoted) set.delete(item);
    for (const item of promoted) set.add(item);
    for (const item of targetItems) set.add(item); // targets always blocks
    return set;
  }, [autoBlock, demoted, promoted, targetItems]);

  const plan = useMemo<GroupedPlan | null>(() => {
    if (!balanced) return null;
    return groupPlan(balanced, numericTargets, blockItems);
  }, [balanced, numericTargets, blockItems]);

  return {
    targets, addTarget, removeTarget, setTargetItem, setTargetAmount,
    timeUnit, setTimeUnit, proliferatorId, setProliferatorId,
    machineTiers, setMachineTier, resetFamilyOverrides, machineOverrides, setMachineOverrides,
    blockItems, toggleBlock, suggestions, plan,
  };
}
