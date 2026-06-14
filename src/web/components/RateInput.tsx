import type { TimeUnit } from '../hooks/useCalculator.js';
import {
  Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui/index.js';

interface RateInputProps {
  amount: number;
  onAmountChange: React.Dispatch<React.SetStateAction<number>>;
  timeUnit: TimeUnit;
  onTimeUnitChange: (u: TimeUnit) => void;
}

/** Target production rate input with a per second/minute/hour unit selector. */
export function RateInput({ amount, onAmountChange, timeUnit, onTimeUnitChange }: RateInputProps) {
  return (
    <div>
      <Label className="mb-1">Target rate</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          step="any"
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => onAmountChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-28"
        />
        <Select value={timeUnit} onValueChange={(v) => onTimeUnitChange(v as TimeUnit)}>
          <SelectTrigger className="min-w-[7rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="second">per second</SelectItem>
            <SelectItem value="minute">per minute</SelectItem>
            <SelectItem value="hour">per hour</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
