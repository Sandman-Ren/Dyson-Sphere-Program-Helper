import { useMemo, useState } from 'react';
import { solve, type MachineOverrides, type ProductionPlan } from '../../calculator/index.js';
import { graph, proliferators } from '../data.js';

export type TimeUnit = 'second' | 'minute' | 'hour';
const UNIT_SECONDS: Record<TimeUnit, number> = { second: 1, minute: 60, hour: 3600 };

export interface CalculatorState {
  targetItem: string;
  setTargetItem: (id: string) => void;
  amount: number;
  setAmount: React.Dispatch<React.SetStateAction<number>>;
  timeUnit: TimeUnit;
  setTimeUnit: (u: TimeUnit) => void;
  machineOverrides: MachineOverrides;
  setMachineOverrides: React.Dispatch<React.SetStateAction<MachineOverrides>>;
  proliferatorId: string;
  setProliferatorId: (id: string) => void;
  plan: ProductionPlan | null;
}

export function useCalculator(): CalculatorState {
  const [targetItem, setTargetItem] = useState<string>('electromagnetic-matrix');
  const [amount, setAmount] = useState<number>(60);
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('minute');
  const [machineOverrides, setMachineOverrides] = useState<MachineOverrides>({});
  const [proliferatorId, setProliferatorId] = useState<string>('none');

  const plan = useMemo<ProductionPlan | null>(() => {
    if (!targetItem || !graph.itemToRecipe.has(targetItem)) return null;
    const perSecond = amount / UNIT_SECONDS[timeUnit];
    const proliferator = proliferators.find((p) => p.id === proliferatorId) ?? null;
    return solve(graph, targetItem, perSecond, machineOverrides, { proliferator });
  }, [targetItem, amount, timeUnit, machineOverrides, proliferatorId]);

  return {
    targetItem, setTargetItem,
    amount, setAmount,
    timeUnit, setTimeUnit,
    machineOverrides, setMachineOverrides,
    proliferatorId, setProliferatorId,
    plan,
  };
}

export { UNIT_SECONDS };
