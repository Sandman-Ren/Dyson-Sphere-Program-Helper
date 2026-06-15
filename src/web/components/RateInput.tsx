import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('ui');
  return (
    <div className="w-full sm:w-auto">
      <Label className="mb-1">{t('calculator.targetRate')}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          step="any"
          value={Number.isFinite(amount) ? amount : ''}
          onChange={(e) => onAmountChange(Math.max(0, Number(e.target.value) || 0))}
          className="w-24 flex-shrink-0 sm:w-28"
        />
        <Select value={timeUnit} onValueChange={(v) => onTimeUnitChange(v as TimeUnit)}>
          <SelectTrigger className="flex-1 sm:flex-none sm:min-w-[7rem]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
            <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
            <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
