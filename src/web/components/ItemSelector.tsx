import { useMemo, useRef, useState, useEffect } from 'react';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import { ItemIcon } from './ItemIcon.js';
import { itemById, searchIndex } from '../data.js';
import { useNames } from '../i18n/useNames.js';
import { matchesSearch } from '../lib/search-match.js';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/index.js';
import { cn } from '../lib/cn.js';

interface ItemSelectorProps {
  items: string[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

/** Searchable, icon-rich item picker used by the calculator and lookup tabs. */
export function ItemSelector({ items, value, onChange, placeholder }: ItemSelectorProps) {
  const { name } = useNames();
  const { t } = useTranslation('ui');
  const resolvedPlaceholder = placeholder ?? t('selector.searchItem');
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
    const filtered = items.filter((id) => matchesSearch(id, searchIndex[id], query));
    return filtered
      .slice()
      .sort((a, b) => {
        const ra = itemById.get(a)?.row ?? 99;
        const rb = itemById.get(b)?.row ?? 99;
        return ra - rb || name(a).localeCompare(name(b));
      })
      .slice(0, 200);
  }, [items, query, name]);

  return (
    <div ref={ref} className="relative w-full sm:w-auto sm:min-w-[260px]">
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
            <span className="truncate">{name(value)}</span>
          </>
        ) : (
          <span className="text-muted-foreground">{resolvedPlaceholder}</span>
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
              placeholder={t('selector.typeToFilter')}
            />
          </div>
          <div className="max-h-80 overflow-auto p-1">
            {results.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('selector.noMatches')}</div>
            )}
            {results.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => { onChange(id); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm cursor-pointer transition-colors',
                  'hover:bg-accent active:bg-accent/70',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  id === value && 'bg-accent',
                )}
              >
                <ItemIcon id={id} size={20} tinted />
                <span className="truncate">{name(id)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
