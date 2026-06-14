import ZapIcon from 'lucide-react/dist/esm/icons/zap';
import FactoryIcon from 'lucide-react/dist/esm/icons/factory';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import type { ProductionPlan } from '../../calculator/index.js';
import type { TimeUnit } from '../hooks/useCalculator.js';
import { ItemIcon } from './ItemIcon.js';
import { displayName } from '../data.js';
import { Card, Button } from '../ui/index.js';
import { num, rate, power } from '../lib/format.js';

interface SummaryProps {
  plan: ProductionPlan;
  timeUnit: TimeUnit;
  integerMultiplier: number | null;
  onApplyMultiplier: (k: number) => void;
}

/** Aggregated rollups: buildings, raw inputs, power, and proliferator usage. */
export function Summary({ plan, timeUnit, integerMultiplier, onApplyMultiplier }: SummaryProps) {
  const machineEntries = Object.entries(plan.totalMachines).sort((a, b) => b[1] - a[1]);
  const rawEntries = Object.entries(plan.rawResources).sort((a, b) => b[1] - a[1]);

  return (
    <Card className="mb-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<FactoryIcon className="size-4 text-primary" />} label="Buildings">
          {machineEntries.length === 0 && <Empty />}
          {machineEntries.map(([id, count]) => (
            <Row key={id} id={id} value={`× ${num(Math.ceil(count - 1e-9))}`} sub={num(count)} />
          ))}
        </Stat>

        <Stat icon={<PickaxeIcon className="size-4 text-amber" />} label="Raw resources">
          {rawEntries.length === 0 && <Empty />}
          {rawEntries.map(([id, r]) => (
            <Row key={id} id={id} value={rate(r, timeUnit)} />
          ))}
        </Stat>

        <Stat icon={<ZapIcon className="size-4 text-primary" />} label="Power draw">
          <div className="text-lg font-semibold">{power(plan.totalPowerKW)}</div>
          <div className="text-xs text-muted-foreground">peak electric consumption</div>
        </Stat>

        <Stat icon={<SparklesIcon className="size-4 text-amber" />} label="Extras">
          {plan.proliferatorSpraysPerSecond > 0 ? (
            <Row id="proliferator-mk3" value={`${rate(plan.proliferatorSpraysPerSecond, timeUnit)} sprays`} />
          ) : (
            <div className="text-xs text-muted-foreground">No proliferator applied</div>
          )}
          {integerMultiplier && integerMultiplier > 1 && (
            <Button variant="outline" size="sm" className="mt-2" onClick={() => onApplyMultiplier(integerMultiplier)}>
              Scale ×{integerMultiplier} → whole buildings
            </Button>
          )}
        </Stat>
      </div>
    </Card>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ id, value, sub }: { id: string; value: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <ItemIcon id={id} size={18} tinted />
      <span className="truncate text-muted-foreground">{displayName(id)}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
      {sub && <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{sub}</span>}
    </div>
  );
}

function Empty() {
  return <div className="text-xs text-muted-foreground">—</div>;
}
