import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import XIcon from 'lucide-react/dist/esm/icons/x';
import { usePlanner } from '../../hooks/usePlanner.js';
import { graph, proliferators } from '../../data.js';
import { ItemSelector } from '../ItemSelector.js';
import { MachineDefaults } from '../MachineDefaults.js';
import { ItemIcon } from '../ItemIcon.js';
import { BlockCard } from './BlockCard.js';
import { PlannerTotals } from './PlannerTotals.js';
import { BlockGraph } from './BlockGraph.js';
import { useNames } from '../../i18n/useNames.js';
import {
  Button, Card, Input, Label,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Tabs, TabsList, TabsTrigger,
} from '../../ui/index.js';
import type { TimeUnit } from '../../hooks/useCalculator.js';

export function PlannerTab() {
  const plan = usePlanner();
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const [view, setView] = useState<'cards' | 'graph'>('cards');
  const [adding, setAdding] = useState(false);

  const suggestionById = new Map(plan.suggestions.map((s) => [s.item, s]));

  return (
    <div className="mx-auto max-w-5xl p-3 sm:p-5">
      {/* Targets editor */}
      <Card className="mb-4 p-4">
        <Label className="mb-2">{t('planner.targets')}</Label>
        <div className="flex flex-col gap-2">
          {plan.targets.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <ItemSelector items={graph.allProducts} value={row.item} onChange={(id) => plan.setTargetItem(row.id, id)} />
              <Input
                type="number" min={0} step="any"
                value={Number.isFinite(row.amount) ? row.amount : ''}
                onChange={(e) => plan.setTargetAmount(row.id, Number(e.target.value) || 0)}
                className="w-24"
              />
              <Button variant="ghost" size="sm" onClick={() => plan.removeTarget(row.id)} aria-label={t('planner.remove')}>
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
          {adding ? (
            <ItemSelector
              items={graph.allProducts}
              value=""
              onChange={(id) => { plan.addTarget(id); setAdding(false); }}
            />
          ) : (
            <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
              <PlusIcon className="mr-1 size-4" />{t('planner.addTarget')}
            </Button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <div className="w-full sm:w-auto">
            <Label className="mb-1">{t('calculator.targetRate')}</Label>
            <Select value={plan.timeUnit} onValueChange={(v) => plan.setTimeUnit(v as TimeUnit)}>
              <SelectTrigger className="w-full sm:min-w-[8rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
                <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
                <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-auto">
            <Label className="mb-1">{t('calculator.proliferator')}</Label>
            <Select value={plan.proliferatorId} onValueChange={plan.setProliferatorId}>
              <SelectTrigger className="w-full sm:min-w-[13rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('calculator.none')}</SelectItem>
                {proliferators.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ItemIcon id={p.tier} size={16} /><span className="truncate">{name(p.id)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <MachineDefaults
        tiers={plan.machineTiers}
        machineOverrides={plan.machineOverrides}
        onTierChange={plan.setMachineTier}
        onResetFamily={plan.resetFamilyOverrides}
      />

      {plan.plan ? (
        <>
          <PlannerTotals plan={plan.plan} timeUnit={plan.timeUnit} />

          {/* Suggestions that are not currently blocks → offer to promote. */}
          {plan.suggestions.filter((s) => s.suggested && !plan.blockItems.has(s.item)).length > 0 && (
            <Card className="mb-4 p-3">
              <Label className="mb-2">{t('planner.suggestions')}</Label>
              <div className="flex flex-wrap gap-2">
                {plan.suggestions.filter((s) => s.suggested && !plan.blockItems.has(s.item)).map((s) => (
                  <Button key={s.item} variant="outline" size="sm" onClick={() => plan.toggleBlock(s.item)}>
                    <ItemIcon id={s.item} size={16} tinted />
                    <span className="ml-1.5">{name(s.item)}</span>
                  </Button>
                ))}
              </div>
            </Card>
          )}

          <div className="mb-3 flex items-center justify-between">
            <Label>{t('planner.blocks')}</Label>
            <Tabs value={view} onValueChange={(v) => setView(v as 'cards' | 'graph')}>
              <TabsList>
                <TabsTrigger value="cards">{t('planner.cardsView')}</TabsTrigger>
                <TabsTrigger value="graph">{t('planner.graphView')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {view === 'cards' ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {plan.plan.blocks.map((block) => (
                <BlockCard
                  key={block.item}
                  block={block}
                  suggestion={suggestionById.get(block.item)}
                  timeUnit={plan.timeUnit}
                  onToggle={plan.toggleBlock}
                />
              ))}
            </div>
          ) : (
            <div className="h-[60vh] rounded-lg border border-border">
              <BlockGraph plan={plan.plan} />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          {t('planner.empty')}
        </div>
      )}
    </div>
  );
}
