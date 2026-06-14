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
        className={cn('flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/50')}
        style={{ paddingLeft: depth * 18 + 8 }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn('flex size-4 items-center justify-center text-muted-foreground', !hasChildren && 'invisible')}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>

        <ItemIcon id={node.item} size={22} tinted />
        <span className="font-medium">{displayName(node.item)}</span>

        {node.proliferated && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SparklesIcon className="size-3.5 text-amber" />
            </TooltipTrigger>
            <TooltipContent>Proliferator applied</TooltipContent>
          </Tooltip>
        )}

        <span className="ml-auto font-medium tabular-nums text-primary">{rate(node.ratePerSecond, timeUnit)}</span>

        {node.machine ? (
          <div className="flex w-56 items-center gap-1.5">
            {producers.length > 1 ? (
              <Select
                value={node.machine.id}
                onValueChange={(v) => onMachineChange(node.item, v)}
              >
                <SelectTrigger className="h-7 min-w-0 flex-1 text-xs">
                  <span className="flex items-center gap-1.5 truncate">
                    <ItemIcon id={node.machine.id} size={16} />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {producers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-1.5">
                        <ItemIcon id={m.id} size={16} />{m.name}
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
            <span className="w-12 text-right text-xs font-semibold tabular-nums" title={`${num(node.machinesNeeded)} exact`}>
              ×{num(Math.ceil(node.machinesNeeded - 1e-9))}
            </span>
          </div>
        ) : (
          <span className="flex w-56 items-center justify-end gap-1 text-xs text-muted-foreground">
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
