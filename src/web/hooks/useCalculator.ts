import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  solve, familyOfMachine, MACHINE_FAMILY_ORDER,
  type MachineFamily, type MachineOverrides, type MachineTiers, type ProductionPlan,
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
  const [proliferatorId, setProliferatorId] = useState<string>('none');

  useEffect(() => {
    try {
      localStorage.setItem(TIERS_KEY, JSON.stringify(machineTiers));
    } catch {
      /* storage unavailable — keep the in-memory selection */
    }
  }, [machineTiers]);

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
    return solve(graph, targetItem, perSecond, machineOverrides, { proliferator }, machineTiers);
  }, [targetItem, amount, timeUnit, machineOverrides, proliferatorId, machineTiers]);

  return {
    targetItem, setTargetItem,
    amount, setAmount,
    timeUnit, setTimeUnit,
    machineOverrides, setMachineOverrides,
    machineTiers, setMachineTier, resetFamilyOverrides,
    proliferatorId, setProliferatorId,
    plan,
  };
}

export { UNIT_SECONDS };
