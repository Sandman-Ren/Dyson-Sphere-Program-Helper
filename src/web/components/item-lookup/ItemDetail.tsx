import { useMemo } from 'react';
import ArrowRightIcon from 'lucide-react/dist/esm/icons/arrow-right';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import CalculatorIcon from 'lucide-react/dist/esm/icons/calculator';
import ClockIcon from 'lucide-react/dist/esm/icons/clock';
import PackageSearchIcon from 'lucide-react/dist/esm/icons/package-search';
import FlaskConicalIcon from 'lucide-react/dist/esm/icons/flask-conical';
import type { Recipe } from '../../../data/schema.js';
import { ItemIcon } from '../ItemIcon.js';
import {
  Button, Badge, Card, Tooltip, TooltipTrigger, TooltipContent,
} from '../../ui/index.js';
import {
  displayName, graph, itemById, technologies,
} from '../../data.js';
import { num } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

interface ItemDetailProps {
  selectedItem: string;
  onSelectItem: (id: string) => void;
  onCalculateItem: (id: string) => void;
  onViewTech: (id: string) => void;
}

export function ItemDetail({ selectedItem, onSelectItem, onCalculateItem, onViewTech }: ItemDetailProps) {
  if (!selectedItem) return <EmptyState />;

  const item = itemById.get(selectedItem);
  const producedBy = graph.itemToAllRecipes.get(selectedItem) ?? [];
  const usedIn = graph.itemToConsumers.get(selectedItem) ?? [];
  const producible = graph.itemToRecipe.has(selectedItem);

  return (
    <div className="flex flex-col gap-5 pr-1">
      {/* Header */}
      <header className="flex items-center gap-4">
        <ItemIcon id={selectedItem} size={56} tinted />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight">{displayName(selectedItem)}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {item && <Badge className="capitalize">{item.category.replace(/-/g, ' ')}</Badge>}
            {item && item.stack > 0 && (
              <Badge>Stack {num(item.stack)}</Badge>
            )}
            {!producedBy.length && (
              <Badge className="text-muted-foreground">Raw resource</Badge>
            )}
          </div>
        </div>
        {producible && (
          <Button onClick={() => onCalculateItem(selectedItem)} className="flex-shrink-0">
            <CalculatorIcon className="size-4" />
            Calculate
          </Button>
        )}
      </header>

      <UnlockedBy producedBy={producedBy} onViewTech={onViewTech} />

      {/* Produced by */}
      <Section title="Produced by" count={producedBy.length}>
        {producedBy.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This is a raw resource — it is not crafted from any recipe.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {producedBy.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} onSelectItem={onSelectItem} />
            ))}
          </div>
        )}
      </Section>

      {/* Used in */}
      {usedIn.length > 0 && (
        <Section title="Used in" count={usedIn.length}>
          <div className="flex flex-col gap-1">
            {usedIn.map((recipe) => (
              <UsedInRow key={recipe.id} recipe={recipe} onSelectItem={onSelectItem} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ---- Header sub-sections ----

function UnlockedBy({ producedBy, onViewTech }: { producedBy: Recipe[]; onViewTech: (id: string) => void }) {
  const unlockingTechs = useMemo(() => {
    if (producedBy.length === 0) return [];
    const recipeIds = new Set(producedBy.map((r) => r.id));
    return technologies.filter((tech) => tech.recipeUnlock.some((id) => recipeIds.has(id)));
  }, [producedBy]);

  if (unlockingTechs.length === 0) return null;

  return (
    <Section title="Unlocked by" count={unlockingTechs.length}>
      <div className="flex flex-wrap gap-2">
        {unlockingTechs.map((tech) => (
          <button
            key={tech.id}
            type="button"
            onClick={() => onViewTech(tech.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground cursor-pointer',
              'transition-colors hover:border-primary/50 hover:text-primary active:bg-accent',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <FlaskConicalIcon className="size-3.5 text-amber" />
            {tech.name}
          </button>
        ))}
      </div>
    </Section>
  );
}

// ---- Recipe card (Produced by) ----

function RecipeCard({ recipe, onSelectItem }: { recipe: Recipe; onSelectItem: (id: string) => void }) {
  const producers = graph.producersFor(recipe);
  const mining = recipe.flags.includes('mining');

  return (
    <Card className="p-3">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-sm font-medium">{recipe.name}</span>
        {mining && (
          <Badge className="text-amber">
            <PickaxeIcon className="size-3" />
            Mining
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Inputs */}
        {recipe.in.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {recipe.in.map((input) => (
              <IngredientChip
                key={input.id}
                id={input.id}
                amount={input.amount}
                onClick={() => onSelectItem(input.id)}
              />
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Raw extraction</span>
        )}

        <ArrowRightIcon className="size-4 flex-shrink-0 text-muted-foreground" />

        {/* Outputs */}
        <div className="flex flex-wrap items-center gap-1.5">
          {recipe.out.map((output) => (
            <IngredientChip key={output.id} id={output.id} amount={output.amount} />
          ))}
        </div>

        {/* Time */}
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <ClockIcon className="size-3.5" />
          {num(recipe.time)}s
        </div>
      </div>

      {/* Producers */}
      {producers.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
          <span className="text-xs text-muted-foreground">Made in</span>
          <div className="flex flex-wrap items-center gap-1">
            {producers.map((machine) => (
              <Tooltip key={machine.id}>
                <TooltipTrigger asChild>
                  <span className="cursor-help">
                    <ItemIcon id={machine.id} size={22} tinted />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{machine.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

/** A clickable (or static) item icon + amount used inside recipe cards. */
function IngredientChip({ id, amount, onClick }: { id: string; amount: number; onClick?: () => void }) {
  const content = (
    <>
      <ItemIcon id={id} size={26} tinted />
      <span className="text-xs font-semibold tabular-nums">{num(amount)}</span>
    </>
  );
  const className = 'flex items-center gap-1 rounded-md px-1.5 py-1';

  if (!onClick) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(className, 'cursor-help')}>{content}</span>
        </TooltipTrigger>
        <TooltipContent>{displayName(id)}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(className, 'cursor-pointer transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
        >
          {content}
        </button>
      </TooltipTrigger>
      <TooltipContent>{displayName(id)}</TooltipContent>
    </Tooltip>
  );
}

// ---- Used-in row ----

function UsedInRow({ recipe, onSelectItem }: { recipe: Recipe; onSelectItem: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
      <span className="min-w-0 flex-1 truncate text-sm">{recipe.name}</span>
      <ArrowRightIcon className="size-3.5 flex-shrink-0 text-muted-foreground" />
      <div className="flex flex-shrink-0 items-center gap-1">
        {recipe.out.map((output) => (
          <Tooltip key={output.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelectItem(output.id)}
                className="flex items-center gap-1 rounded px-1 py-0.5 cursor-pointer transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ItemIcon id={output.id} size={20} tinted />
                <span className="text-xs font-medium tabular-nums">{num(output.amount)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{displayName(output.id)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// ---- Layout helpers ----

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {count}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
      <PackageSearchIcon className="size-12 opacity-40" />
      <div>
        <p className="text-sm font-medium text-foreground">Select an item</p>
        <p className="text-xs">Browse the list or search to view recipes, uses, and unlock requirements.</p>
      </div>
    </div>
  );
}
