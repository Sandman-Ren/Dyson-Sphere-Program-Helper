import { useState } from 'react';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';
import PickaxeIcon from 'lucide-react/dist/esm/icons/pickaxe';
import SparklesIcon from 'lucide-react/dist/esm/icons/sparkles';
import type { ProductionNode, MachineOverrides } from '../../calculator/index.js';
import type { TimeUnit } from '../hooks/useCalculator.js';
import { ItemIcon } from './ItemIcon.js';
import { displayName, graph } from '../data.js';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Tooltip, TooltipTrigger, TooltipContent,
} from '../ui/index.js';
import { num, rate } from '../lib/format.js';
import { cn } from '../lib/cn.js';

interface ProductionChainProps {
  node: ProductionNode;
  timeUnit: TimeUnit;
  machineOverrides: MachineOverrides;
  onMachineChange: (item: string, machine: string) => void;
}

export function ProductionChain(props: ProductionChainProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Production chain
      </div>
      <div className="p-1.5">
        <ChainNode {...props} depth={0} />
      </div>
    </div>
  );
}

function ChainNode({ node, timeUnit, machineOverrides, onMachineChange, depth }: ProductionChainProps & { depth: number }) {
  const [open, setOpen] = useState(depth < 3);
  const hasChildren = node.children.length > 0;
  const producers = node.recipe ? graph.producersFor(node.recipe) : [];

  return (
    <div>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 rounded py-1.5 pr-2 hover:bg-accent/50',
          // Responsive indent: tighter steps on mobile to preserve row width.
          'pl-[calc(var(--d)*0.75rem_+_0.5rem)] sm:pl-[calc(var(--d)*1.125rem_+_0.5rem)]',
        )}
        style={{ '--d': depth } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors sm:size-5',
            'hover:text-foreground active:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            !hasChildren && 'invisible',
          )}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>

        <ItemIcon id={node.item} size={22} tinted className="shrink-0" />
        <span className="min-w-0 truncate font-medium">{displayName(node.item)}</span>

        {node.proliferated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SparklesIcon className="size-3.5 shrink-0 text-amber" />
            </TooltipTrigger>
            <TooltipContent>Proliferator applied</TooltipContent>
          </Tooltip>
        )}

        <span className="ml-auto shrink-0 font-medium tabular-nums text-primary">{rate(node.ratePerSecond, timeUnit)}</span>

        {node.machine ? (
          <div className="flex w-full items-center gap-1.5 sm:w-56 sm:shrink-0">
            {producers.length > 1 ? (
              <Select
                value={node.machine.id}
                onValueChange={(v) => onMachineChange(node.item, v)}
              >
                <SelectTrigger className="h-9 min-w-0 flex-1 text-xs sm:h-7">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {producers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <ItemIcon id={m.id} size={16} />
                        <span className="truncate">{m.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="flex flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground">
                <ItemIcon id={node.machine.id} size={16} />{node.machine.name}
              </span>
            )}
            <span className="w-12 shrink-0 text-right text-xs font-semibold tabular-nums" title={`${num(node.machinesNeeded)} exact`}>
              ×{num(Math.ceil(node.machinesNeeded - 1e-9))}
            </span>
          </div>
        ) : (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <PickaxeIcon className="size-3.5" />{node.mined ? 'mined' : 'raw input'}
          </span>
        )}
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <ChainNode
              key={`${child.item}-${i}`}
              node={child}
              timeUnit={timeUnit}
              machineOverrides={machineOverrides}
              onMachineChange={onMachineChange}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
