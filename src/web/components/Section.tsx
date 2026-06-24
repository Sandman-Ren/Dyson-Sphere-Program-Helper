import { useState } from 'react';
import ChevronRightIcon from 'lucide-react/dist/esm/icons/chevron-right';
import { Card } from '../ui/index.js';
import { cn } from '../lib/cn.js';

interface SectionProps {
  title: string;
  /** Whether the section starts expanded (default true). */
  defaultOpen?: boolean;
  /** Right-aligned controls shown in the header when open (e.g. expand/fold all). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A titled, collapsible Card section. The title row toggles open/closed. */
export function Section({ title, defaultOpen = true, actions, children, className }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={cn('mb-4', className)}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn(
            'flex flex-1 items-center gap-2 px-3 py-2 text-left',
            'text-xs font-semibold uppercase tracking-wide text-muted-foreground',
            'transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <ChevronRightIcon className={cn('size-4 shrink-0 transition-transform', open && 'rotate-90')} />
          {title}
        </button>
        {open && actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {open && <div className="border-t border-border p-3">{children}</div>}
    </Card>
  );
}
