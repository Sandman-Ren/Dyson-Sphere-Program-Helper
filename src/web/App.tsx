import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PlusIcon from 'lucide-react/dist/esm/icons/plus';
import XIcon from 'lucide-react/dist/esm/icons/x';
import { LanguageSwitcher } from './components/LanguageSwitcher.js';
import { MachineDefaults } from './components/MachineDefaults.js';
import { useNames } from './i18n/useNames.js';
import { useHashTab } from './hooks/useHashTab.js';
import { useCalculator, UNIT_SECONDS, type SolvedTarget } from './hooks/useCalculator.js';
import { useSetups } from './hooks/useSetups.js';
import { SetupBar } from './components/SetupBar.js';
import { decodeSetupUrl, sanitizeSnapshot, type SnapshotValidators } from './lib/setups.js';
import { rate } from './lib/format.js';
import { ItemSelector } from './components/ItemSelector.js';
import { ProductionChain } from './components/ProductionChain.js';
import { Summary } from './components/Summary.js';
import { SharedComponents } from './components/SharedComponents.js';
import { Section } from './components/Section.js';
import { RatioStrip } from './components/RatioStrip.js';
import { ItemIcon } from './components/ItemIcon.js';
import { AvailableSupply } from './components/AvailableSupply.js';
import { graph, proliferators, techById, meta, machineById } from './data.js';
import {
  Tabs, TabsList, TabsTrigger, TabsContent, TooltipProvider,
  Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
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

const proliferatorItemIds = new Set(proliferators.flatMap((p) => (p.tier ? [p.id, p.tier] : [p.id])));

const setupValidators: SnapshotValidators = {
  isValidItem: (id) => graph.itemToRecipe.has(id),
  isValidMachine: (id) => machineById.has(id),
  isValidProliferator: (id) => id === 'none' || proliferators.some((p) => p.id === id),
  // Mined raw veins have mining recipes, so itemToRecipe covers them; proliferators are excluded.
  isPinnableItem: (id) => graph.itemToRecipe.has(id) && !proliferatorItemIds.has(id),
};

/**
 * Read (and strip) a `?s=` shared-setup param exactly once, at module load —
 * before React renders. Doing this here rather than in an effect makes it
 * robust to StrictMode's double-invoked mount effect: the param is consumed a
 * single time, so the second effect pass can't see an already-stripped URL and
 * fall through to auto-restoring the active setup (which would clobber the
 * import). A non-null result means a `?s=` was present (valid or not), so the
 * startup effect must NOT auto-restore; `snapshot` is the decoded payload (null
 * if the param was malformed).
 */
const pendingShare: { snapshot: ReturnType<typeof decodeSetupUrl> } | null = (() => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const shared = params.get('s');
  if (shared === null) return null;
  const decoded = decodeSetupUrl(shared);
  params.delete('s');
  const qs = params.toString();
  window.history.replaceState(
    null, '',
    `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`,
  );
  return { snapshot: decoded };
})();

export function App() {
  const { tab, subpath, setTab, navigate } = useHashTab();
  const [pendingTech, setPendingTech] = useState<string | null>(null);
  const calc = useCalculator();
  const setups = useSetups({
    getSnapshot: calc.getSnapshot,
    applySnapshot: calc.applySnapshot,
    sanitize: (s) => sanitizeSnapshot(s, setupValidators),
  });
  const { t } = useTranslation('ui');

  useEffect(() => {
    document.title = t('brand');
  }, [t]);

  useEffect(() => {
    // A shared `?s=` param (already consumed at module load) takes precedence
    // and is imported as an unsaved setup; otherwise auto-restore the last
    // active setup. Never both — a present share param must not auto-restore.
    if (pendingShare) {
      if (pendingShare.snapshot) {
        calc.applySnapshot(sanitizeSnapshot(pendingShare.snapshot, setupValidators));
      }
      setups.clearActive(); // imported (or malformed) — detach so it reads as unsaved
      return;
    }
    if (setups.activeId) setups.load(setups.activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCalculateItem = useCallback((id: string) => {
    if (!graph.itemToRecipe.has(id)) return;
    calc.setSingleTarget(id);
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
          <CalculatorTab calc={calc} setups={setups} />
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

function CalculatorTab({ calc, setups }: {
  calc: ReturnType<typeof useCalculator>;
  setups: ReturnType<typeof useSetups>;
}) {
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const proliferator = proliferators.find((p) => p.id === calc.proliferatorId) ?? null;
  const onFocus = (item: string) => calc.setFocusedItem(calc.focusedItem === item ? null : item);

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-5">
      <SetupBar setups={setups} />
      {/* Targets */}
      <Section title={t('calculator.targets')}>
        <div className="flex flex-col gap-2">
          {calc.targets.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2">
              <ItemSelector items={graph.allProducts} value={row.item} onChange={(id) => calc.setTargetItem(row.id, id)} />
              <Input
                type="number" min={0} step="any"
                value={Number.isFinite(row.amount) ? row.amount : ''}
                onChange={(e) => calc.setTargetAmount(row.id, Number(e.target.value) || 0)}
                className="w-20 flex-shrink-0 sm:w-24"
              />
              <Select value={row.unit} onValueChange={(v) => calc.setTargetUnit(row.id, v as typeof row.unit)}>
                <SelectTrigger className="w-28 flex-shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="second">{t('calculator.perSecond')}</SelectItem>
                  <SelectItem value="minute">{t('calculator.perMinute')}</SelectItem>
                  <SelectItem value="hour">{t('calculator.perHour')}</SelectItem>
                </SelectContent>
              </Select>
              {calc.targets.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => calc.removeTarget(row.id)} aria-label={t('calculator.removeTarget')}>
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
          <Button variant="outline" size="sm" className="self-start" onClick={() => calc.addTarget('')}>
            <PlusIcon className="mr-1 size-4" />{t('calculator.addTarget')}
          </Button>
          <div className="w-full sm:w-auto">
            <Label className="mb-1">{t('calculator.displayUnit')}</Label>
            <Select value={calc.displayUnit} onValueChange={(v) => calc.setDisplayUnit(v as typeof calc.displayUnit)}>
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
      </Section>

      <AvailableSupply calc={calc} />

      <MachineDefaults
        tiers={calc.machineTiers}
        machineOverrides={calc.machineOverrides}
        onTierChange={calc.setMachineTier}
        onResetFamily={calc.resetFamilyOverrides}
      />

      {calc.combined ? (
        <>
          <Section title={t('summary.title')}>
            <Summary
              totals={calc.combined}
              timeUnit={calc.displayUnit}
              integerMultiplier={calc.integerMultiplier}
              onApplyMultiplier={(k) => calc.scaleAllAmounts(k)}
              proliferator={proliferator}
            />
          </Section>

          <SharedComponents
            result={calc.shared}
            timeUnit={calc.displayUnit}
            focusedItem={calc.focusedItem}
            onFocusItem={onFocus}
          />

          {calc.solved.map((entry) => (
            <TargetChain key={entry.target.id} calc={calc} entry={entry} />
          ))}
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
          {t('calculator.empty')}
        </div>
      )}
    </div>
  );
}

function TargetChain({ calc, entry }: { calc: ReturnType<typeof useCalculator>; entry: SolvedTarget }) {
  const { target, plan } = entry;
  const { t } = useTranslation('ui');
  const { name } = useNames();
  const signalSeq = useRef(0);
  const [expandSignal, setExpandSignal] = useState<{ id: number; open: boolean } | null>(null);
  const onFocus = (item: string) => calc.setFocusedItem(calc.focusedItem === item ? null : item);
  const fire = (open: boolean) => setExpandSignal({ id: (signalSeq.current += 1), open });

  const title = (
    <>
      <ItemIcon id={target.item} size={20} tinted />
      <span>{name(target.item)} · {rate(target.amount / UNIT_SECONDS[target.unit], calc.displayUnit)}</span>
    </>
  );

  return (
    <Section title={title}>
      <RatioStrip plan={plan} />
      <Section
        title={t('chain.title')}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => fire(true)}>{t('calculator.expandAll')}</Button>
            <Button variant="outline" size="sm" onClick={() => fire(false)}>{t('calculator.foldAll')}</Button>
          </>
        )}
      >
        <ProductionChain
          node={plan.root}
          timeUnit={calc.displayUnit}
          machineOverrides={calc.machineOverrides}
          onMachineChange={(item, machine) => calc.setMachineOverrides((prev) => ({ ...prev, [item]: machine }))}
          onRecipeChange={(path, recipeId) => calc.setRecipeOverride(target.id, path, recipeId)}
          sharedCounts={calc.shared.sharedCounts}
          focusedItem={calc.focusedItem}
          onFocusItem={onFocus}
          expandSignal={expandSignal}
        />
      </Section>
    </Section>
  );
}
