import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { findIntegerMultiplier } from '../calculator/index.js';
import { LanguageSwitcher } from './components/LanguageSwitcher.js';
import { MachineDefaults } from './components/MachineDefaults.js';
import { useNames } from './i18n/useNames.js';
import { useHashTab } from './hooks/useHashTab.js';
import { useCalculator } from './hooks/useCalculator.js';
import { ItemSelector } from './components/ItemSelector.js';
import { RateInput } from './components/RateInput.js';
import { ProductionChain } from './components/ProductionChain.js';
import { Summary } from './components/Summary.js';
import { ItemIcon } from './components/ItemIcon.js';
import { graph, proliferators, techById, meta } from './data.js';
import {
  Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider,
  Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui/index.js';

const TechTree = lazy(() => import('./components/tech-tree/TechTree.js').then((m) => ({ default: m.TechTree })));
const ItemLookup = lazy(() => import('./components/item-lookup/ItemLookup.js').then((m) => ({ default: m.ItemLookup })));

const Loading = ({ what }: { what: string }) => {
  const { t } = useTranslation('ui');
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      {t('loading', { what })}
    </div>
  );
};

export function App() {
  const { tab, subpath, setTab, navigate } = useHashTab();
  const [pendingTech, setPendingTech] = useState<string | null>(null);
  const calc = useCalculator();
  const { t } = useTranslation('ui');

  useEffect(() => {
    document.title = t('brand');
  }, [t]);

  const handleCalculateItem = useCallback((id: string) => {
    if (!graph.itemToRecipe.has(id)) return;
    calc.setTargetItem(id);
    setTab('calculator');
  }, [calc, setTab]);

  const handleViewTech = useCallback((id: string) => {
    if (!techById.has(id)) return;
    setPendingTech(id);
    setTab('tech-tree');
  }, [setTab]);

  return (
    <TooltipProvider delayDuration={300}>
      <Tabs value={tab} onValueChange={setTab} className="flex h-dvh flex-col">
        <header className="flex-shrink-0 px-3 pt-2.5 sm:px-5 sm:pt-3">
          <div className="mb-2 flex items-center gap-2.5">
            <ItemIcon id="universe-matrix" size={28} tinted />
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-bold leading-tight sm:text-lg">{t('brand')}</h1>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {t('tagline', { version: meta.version })}
              </p>
            </div>
            <LanguageSwitcher />
          </div>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="calculator" className="flex-1 sm:flex-none">{t('tabs.calculator')}</TabsTrigger>
            <TabsTrigger value="tech-tree" className="flex-1 sm:flex-none">
              <span className="sm:hidden">{t('tabs.research')}</span>
              <span className="hidden sm:inline">{t('tabs.researchTree')}</span>
            </TabsTrigger>
            <TabsTrigger value="item-lookup" className="flex-1 sm:flex-none">
              <span className="sm:hidden">{t('tabs.items')}</span>
              <span className="hidden sm:inline">{t('tabs.itemLookup')}</span>
            </TabsTrigger>
          </TabsList>
        </header>

        <TabsContent value="calculator" className="flex-1 overflow-auto">
          <CalculatorTab calc={calc} />
        </TabsContent>

        <TabsContent value="tech-tree" className="flex-1" style={{ minHeight: 0 }}>
          <Suspense fallback={<Loading what={t('loadingTargets.researchTree')} />}>
            <TechTree
              pendingTech={pendingTech}
              onPendingHandled={() => setPendingTech(null)}
              onCalculateItem={handleCalculateItem}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="item-lookup" className="flex-1 overflow-auto">
          <Suspense fallback={<Loading what={t('loadingTargets.itemLookup')} />}>
            <ItemLookup
              selectedItem={subpath}
              onSelectItem={(id) => navigate('item-lookup', id || undefined)}
              onCalculateItem={handleCalculateItem}
              onViewTech={handleViewTech}
            />
          </Suspense>
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}

function CalculatorTab({ calc }: { calc: ReturnType<typeof useCalculator> }) {
  const { plan } = calc;
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const proliferator = proliferators.find((p) => p.id === calc.proliferatorId) ?? null;
  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="w-full sm:w-auto">
          <Label className="mb-1">{t('calculator.produce')}</Label>
          <ItemSelector items={graph.allProducts} value={calc.targetItem} onChange={calc.setTargetItem} />
        </div>
        <RateInput
          amount={calc.amount}
          onAmountChange={calc.setAmount}
          timeUnit={calc.timeUnit}
          onTimeUnitChange={calc.setTimeUnit}
        />
        <div className="w-full sm:w-auto">
          <Label className="mb-1">{t('calculator.proliferator')}</Label>
          <Select value={calc.proliferatorId} onValueChange={calc.setProliferatorId}>
            <SelectTrigger className="w-full sm:w-auto sm:min-w-[13rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('calculator.none')}</SelectItem>
              {proliferators.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ItemIcon id={p.tier} size={16} />
                    <span className="truncate">{name(p.id)}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <MachineDefaults
        tiers={calc.machineTiers}
        machineOverrides={calc.machineOverrides}
        onTierChange={calc.setMachineTier}
        onResetFamily={calc.resetFamilyOverrides}
      />

      {plan ? (
        <>
          <Summary
            plan={plan}
            timeUnit={calc.timeUnit}
            integerMultiplier={findIntegerMultiplier(plan)}
            onApplyMultiplier={(k) => calc.setAmount((prev) => prev * k)}
            proliferator={proliferator}
          />
          <ProductionChain
            node={plan.root}
            timeUnit={calc.timeUnit}
            machineOverrides={calc.machineOverrides}
            onMachineChange={(item, machine) => calc.setMachineOverrides((prev) => ({ ...prev, [item]: machine }))}
          />
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          {t('calculator.empty')}
        </div>
      )}
    </div>
  );
}
