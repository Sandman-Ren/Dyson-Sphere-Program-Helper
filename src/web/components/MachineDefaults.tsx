import { useState } from 'react';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';
import RotateCcwIcon from 'lucide-react/dist/esm/icons/rotate-ccw';
import { useTranslation } from 'react-i18next';
import type { Machine } from '../../data/schema.js';
import {
  MACHINE_FAMILIES, MACHINE_FAMILY_ORDER, familyOfMachine,
  type MachineFamily, type MachineOverrides, type MachineTiers,
} from '../../calculator/index.js';
import { machineById } from '../data.js';
import { useNames } from '../i18n/useNames.js';
import { ItemIcon } from './ItemIcon.js';
import {
  Label, Select, SelectTrigger, SelectContent, SelectItem,
  Tooltip, TooltipTrigger, TooltipContent,
} from '../ui/index.js';
import { cn } from '../lib/cn.js';

/** Sentinel for the "Default (best)" option — Radix Select forbids empty values. */
const DEFAULT_SENTINEL = '__default__';

interface MachineDefaultsProps {
  tiers: MachineTiers;
  machineOverrides: MachineOverrides;
  onTierChange: (family: MachineFamily, machineId: string | null) => void;
  onResetFamily: (family: MachineFamily) => void;
}

/**
 * Collapsible panel of global default-tier selectors (one per building family).
 * The choice flows into the solver as a fallback below per-node overrides.
 */
export function MachineDefaults({ tiers, machineOverrides, onTierChange, onResetFamily }: MachineDefaultsProps) {
  const { t } = useTranslation('ui');
  const [open, setOpen] = useState(false);

  const activeCount = MACHINE_FAMILY_ORDER.filter((f) => tiers[f]).length;

  return (
    <div className="mb-4 rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground cursor-pointer',
          'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <ChevronRightIcon className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')} />
        {t('machines.defaults')}
        {activeCount > 0 && (
          <span className="ml-auto rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
          {MACHINE_FAMILY_ORDER.map((family) => (
            <FamilyRow
              key={family}
              family={family}
              tiers={tiers}
              machineOverrides={machineOverrides}
              onTierChange={onTierChange}
              onResetFamily={onResetFamily}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FamilyRowProps {
  family: MachineFamily;
  tiers: MachineTiers;
  machineOverrides: MachineOverrides;
  onTierChange: (family: MachineFamily, machineId: string | null) => void;
  onResetFamily: (family: MachineFamily) => void;
}

function FamilyRow({ family, tiers, machineOverrides, onTierChange, onResetFamily }: FamilyRowProps) {
  const { t } = useTranslation('ui');
  const { name } = useNames();

  const options = MACHINE_FAMILIES[family]
    .map((id) => machineById.get(id))
    .filter((m): m is Machine => m !== undefined);
  const value = tiers[family] ?? DEFAULT_SENTINEL;
  const overrideCount = Object.values(machineOverrides)
    .filter((mid) => familyOfMachine(mid) === family).length;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <Label>{t(`machines.${family}`)}</Label>
        {overrideCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onResetFamily(family)}
                className="flex items-center gap-1 rounded px-1 text-xs text-muted-foreground cursor-pointer transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcwIcon className="size-3" />
                <span className="tabular-nums">{overrideCount}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('machines.resetOverrides', { count: overrideCount })}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <Select value={value} onValueChange={(v) => onTierChange(family, v === DEFAULT_SENTINEL ? null : v)}>
        <SelectTrigger className="w-full">
          {value === DEFAULT_SENTINEL ? (
            <span className="truncate text-muted-foreground">{t('machines.best')}</span>
          ) : (
            <>
              <ItemIcon id={value} size={16} />
              <span className="truncate">{name(value)}</span>
            </>
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_SENTINEL}>{t('machines.best')}</SelectItem>
          {options.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              <span className="flex min-w-0 items-center gap-1.5">
                <ItemIcon id={m.id} size={16} />
                <span className="truncate">{name(m.id)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
