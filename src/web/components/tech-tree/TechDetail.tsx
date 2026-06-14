import XIcon from 'lucide-react/dist/esm/icons/x';
import CalculatorIcon from 'lucide-react/dist/esm/icons/calculator';
import ClockIcon from 'lucide-react/dist/esm/icons/clock';
import { ItemIcon } from '../ItemIcon.js';
import { Badge, Button } from '../../ui/index.js';
import { num } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';
import { displayName, recipeById, graph, techById } from '../../data.js';
import type { Technology } from '../../../data/schema.js';
import { matrixTotal } from './techGraph.js';

interface TechDetailProps {
  tech: Technology;
  onClose: () => void;
  onSelectTech: (id: string) => void;
  onCalculateItem: (id: string) => void;
}

/** Format a duration in seconds as a compact h/m/s string. */
function formatTime(seconds: number): string {
  if (seconds < 60) return `${num(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Right-hand inspector for the selected technology. */
export function TechDetail({ tech, onClose, onSelectTech, onCalculateItem }: TechDetailProps) {
  const totalTime = tech.cost.time * tech.cost.hash;

  return (
    <aside
      className={cn(
        'dsp-sheet z-40 flex flex-col bg-card',
        // Mobile: slide-up bottom sheet over the canvas.
        'fixed inset-x-0 bottom-0 max-h-[70dvh] rounded-t-2xl border-t border-border shadow-2xl',
        // Desktop: static right-hand side panel.
        'sm:static sm:inset-auto sm:h-full sm:max-h-none sm:w-[340px] sm:flex-shrink-0 sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-none',
      )}
    >
      {/* Drag-handle affordance, mobile only. */}
      <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" />
      <header className="flex items-start gap-2.5 border-b border-border p-4">
        <ItemIcon id={tech.id} size={40} tinted />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-snug text-foreground">{tech.name}</h2>
          {tech.upgrade && (
            <Badge className="mt-1 border-amber/50 bg-amber/15 text-amber">Repeatable upgrade</Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close detail panel">
          <XIcon className="size-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-4">
        {/* Research cost */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Research Cost
          </h3>
          <div className="space-y-1.5">
            {tech.cost.matrices.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-sm">
                <ItemIcon id={m.id} size={22} tinted />
                <span className="flex-1 truncate text-foreground">{displayName(m.id)}</span>
                <span className="font-mono text-foreground">{num(matrixTotal(tech, m.id))}</span>
                <span className="text-xs text-muted-foreground">×{num(m.amount)}/hash</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>
              <span className="text-muted-foreground">Hash</span>
              <span className="font-mono text-foreground">{num(tech.cost.hash)}</span>
            </Badge>
            <Badge>
              <ClockIcon className="size-3 text-muted-foreground" />
              <span className="font-mono text-foreground">{formatTime(totalTime)}</span>
              <span className="text-muted-foreground">@ 1 lab</span>
            </Badge>
          </div>
        </section>

        {/* Prerequisites */}
        {tech.prerequisites.length > 0 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prerequisites
            </h3>
            <div className="space-y-1">
              {tech.prerequisites.map((pid) => {
                const pre = techById.get(pid);
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => onSelectTech(pid)}
                    className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent active:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ItemIcon id={pid} size={20} tinted />
                    <span className="truncate">{pre?.name ?? displayName(pid)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Unlocked recipes */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Unlocks
          </h3>
          {tech.recipeUnlock.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recipes unlocked.</p>
          ) : (
            <div className="space-y-1.5">
              {tech.recipeUnlock.map((rid) => {
                const recipe = recipeById.get(rid);
                const outId = recipe?.out[0]?.id;
                const canCalculate = !!outId && graph.itemToRecipe.has(outId);
                const iconId = outId ?? rid;
                return (
                  <div
                    key={rid}
                    className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm"
                  >
                    <ItemIcon id={iconId} size={22} tinted />
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {recipe?.name ?? displayName(rid)}
                    </span>
                    {canCalculate && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => onCalculateItem(outId)}
                      >
                        <CalculatorIcon className="size-3.5" />
                        Calculate
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
