import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ItemIcon } from '../ItemIcon.js';
import { cn } from '../../lib/cn.js';

/** Data carried by each React Flow tech node. */
export interface TechNodeData {
  techId: string;
  name: string;
  upgrade: boolean;
  /** True while this node matches the active search query. */
  matched: boolean;
  /** True when this node is the selected tech or one of its prerequisites. */
  inPath: boolean;
  /** True when a search is active and this node is not a match (dim it). */
  dimmed: boolean;
  [key: string]: unknown;
}

export type TechFlowNode = Node<TechNodeData, 'tech'>;

/**
 * Compact research-tree node: icon + tech name. Upgrade techs get an amber
 * accent; matched / selected-path nodes get a primary ring.
 */
function TechNodeComponent({ data, selected }: NodeProps<TechFlowNode>) {
  const { t } = useTranslation('ui');
  const { techId, name, upgrade, matched, inPath, dimmed } = data;

  return (
    <div
      className={cn(
        'flex h-[52px] w-[188px] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5',
        'transition-[opacity,box-shadow,border-color] duration-150',
        upgrade ? 'border-amber/60' : 'border-border',
        selected && 'border-primary ring-2 ring-primary',
        !selected && matched && 'border-primary ring-2 ring-primary/70',
        !selected && !matched && inPath && 'border-primary/70',
        dimmed && 'opacity-35',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
      />
      <ItemIcon id={techId} size={28} tinted />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium leading-tight text-foreground" title={name}>
          {name}
        </div>
        {upgrade && (
          <div className="text-[10px] font-medium uppercase tracking-wide text-amber">
            {t('tech.upgrade')}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-0 !bg-border"
      />
    </div>
  );
}

export const TechNode = memo(TechNodeComponent);
