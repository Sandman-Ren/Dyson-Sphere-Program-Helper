import { lazy, Suspense, useCallback, useState } from 'react';
import { findIntegerMultiplier } from '../calculator/index.js';
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

const Loading = ({ what }: { what: string }) => (
  <div className="flex h-full items-center justify-center text-muted-foreground">Loading {what}…</div>
);

export function App() {
  const { tab, subpath, setTab, navigate } = useHashTab();
  const [pendingTech, setPendingTech] = useState<string | null>(null);
  const calc = useCalculator();

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
      <Tabs value={tab} onValueChange={setTab} className="flex h-screen flex-col">
        <header className="flex-shrink-0 px-5 pt-3">
          <div className="mb-2 flex items-center gap-2.5">
            <ItemIcon id="universe-matrix" size={28} tinted />
            <div>
              <h1 className="text-lg font-bold leading-tight">DSP Helper</h1>
              <p className="text-xs text-muted-foreground">
                Production calculator, research tree &amp; item reference · Dyson Sphere Program {meta.version}
              </p>
            </div>
          </div>
          <TabsList>
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="tech-tree">Research Tree</TabsTrigger>
            <TabsTrigger value="item-lookup">Item Lookup</TabsTrigger>
          </TabsList>
        </header>

        <TabsContent value="calculator" className="flex-1 overflow-auto">
          <CalculatorTab calc={calc} />
        </TabsContent>

        <TabsContent value="tech-tree" className="flex-1" style={{ minHeight: 0 }}>
          <Suspense fallback={<Loading what="research tree" />}>
            <TechTree
              pendingTech={pendingTech}
              onPendingHandled={() => setPendingTech(null)}
              onCalculateItem={handleCalculateItem}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="item-lookup" className="flex-1 overflow-auto">
          <Suspense fallback={<Loading what="item lookup" />}>
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
  const proliferator = proliferators.find((p) => p.id === calc.proliferatorId) ?? null;
  return (
    <div className="mx-auto max-w-4xl p-5">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="mb-1">Produce</Label>
          <ItemSelector items={graph.allProducts} value={calc.targetItem} onChange={calc.setTargetItem} />
        </div>
        <RateInput
          amount={calc.amount}
          onAmountChange={calc.setAmount}
          timeUnit={calc.timeUnit}
          onTimeUnitChange={calc.setTimeUnit}
        />
        <div>
          <Label className="mb-1">Proliferator</Label>
          <Select value={calc.proliferatorId} onValueChange={calc.setProliferatorId}>
            <SelectTrigger className="min-w-[13rem]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {proliferators.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  <span className="flex items-center gap-1.5">
                    <ItemIcon id={p.tier} size={16} />{p.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

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
          Pick an item to calculate its production chain.
        </div>
      )}
    </div>
  );
}
