import { useMemo, useRef, useState, useEffect } from 'react';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import { ItemIcon } from './ItemIcon.js';
import { displayName, itemById } from '../data.js';
import { Input } from '../ui/index.js';
import { cn } from '../lib/cn.js';

interface ItemSelectorProps {
  items: string[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

/** Searchable, icon-rich item picker used by the calculator and lookup tabs. */
export function ItemSelector({ items, value, onChange, placeholder = 'Search item…' }: ItemSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter((id) => displayName(id).toLowerCase().includes(q) || id.includes(q))
      : items;
    return filtered
      .slice()
      .sort((a, b) => {
        const ra = itemById.get(a)?.row ?? 99;
        const rb = itemById.get(b)?.row ?? 99;
        return ra - rb || displayName(a).localeCompare(displayName(b));
      })
      .slice(0, 200);
  }, [items, query]);

  return (
    <div ref={ref} className="relative" style={{ minWidth: 260 }}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery(''); }}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md border border-border bg-input/60 px-3 text-sm cursor-pointer',
          'hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {value ? (
          <>
            <ItemIcon id={value} size={20} tinted />
            <span className="truncate">{displayName(value)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <SearchIcon className="ml-auto size-4 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-xl">
          <div className="p-2 border-b border-border">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
            />
          </div>
          <div className="max-h-80 overflow-auto p-1">
            {results.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</div>
            )}
            {results.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => { onChange(id); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm cursor-pointer',
                  'hover:bg-accent', id === value && 'bg-accent',
                )}
              >
                <ItemIcon id={id} size={20} tinted />
                <span className="truncate">{displayName(id)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
