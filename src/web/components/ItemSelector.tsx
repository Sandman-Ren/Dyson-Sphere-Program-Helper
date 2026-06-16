import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import SearchIcon from 'lucide-react/dist/esm/icons/search';
import { ItemIcon } from './ItemIcon.js';
import { itemById, searchIndex, items as allItems } from '../data.js';
import { useNames } from '../i18n/useNames.js';
import { matchesSearch } from '../lib/search-match.js';
import { useTranslation } from 'react-i18next';
import { Input, Tabs, TabsList, TabsTrigger } from '../ui/index.js';
import { cn } from '../lib/cn.js';

/** In-game replicator width — components lay out 14 icons per row. */
const GRID_COLS = 14;
/** Tab display order; anything else falls to the end alphabetically. */
const CATEGORY_ORDER = ['components', 'buildings'];
/** File order of every item = the in-game left-to-right column order within a row. */
const itemOrder = new Map(allItems.map((item, i) => [item.id, i]));
/** Keys that drive grid navigation (and so suppress page scroll). */
const NAV_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** Tab a category belongs to (the lone `buildings-alt` item rides with Buildings). */
function tabKey(category: string): string {
  return category === 'buildings-alt' ? 'buildings' : category;
}

/** Effective row for ordering — push `buildings-alt` into its own band after Buildings. */
function effectiveRow(category: string, row: number): number {
  return category === 'buildings-alt' ? 100 + row : row;
}

/** Split a flat id list into visual rows of at most GRID_COLS. */
function chunk(ids: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += GRID_COLS) out.push(ids.slice(i, i + GRID_COLS));
  return out;
}

interface ItemSelectorProps {
  items: string[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

/**
 * Icon-grid item picker. The trigger button opens a panel that lays items out
 * exactly like the in-game item menu: a tab per category, each category's rows
 * matching the game's grid, plus a search box that flattens across categories.
 * The grid is keyboard-navigable (arrow keys / Home / End, Enter to select).
 */
export function ItemSelector({ items, value, onChange, placeholder }: ItemSelectorProps) {
  const { name, categoryName } = useNames();
  const { t } = useTranslation('ui');
  const resolvedPlaceholder = placeholder ?? t('selector.searchItem');

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  // The single grid cell that holds tab focus (roving tabindex).
  const [focusedId, setFocusedId] = useState('');
  const deferredQuery = useDeferredValue(query);
  const ref = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());

  // Close on click-outside or Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // category → (effective row → ids), ids ordered by in-game column order.
  const grouped = useMemo(() => {
    const byTab = new Map<string, Map<number, string[]>>();
    for (const id of items) {
      const item = itemById.get(id);
      if (!item) continue;
      const tab = tabKey(item.category);
      let rows = byTab.get(tab);
      if (!rows) byTab.set(tab, (rows = new Map()));
      const key = effectiveRow(item.category, item.row);
      const band = rows.get(key);
      if (band) band.push(id);
      else rows.set(key, [id]);
    }
    for (const rows of byTab.values())
      for (const band of rows.values())
        band.sort((a, b) => (itemOrder.get(a) ?? 0) - (itemOrder.get(b) ?? 0));
    return byTab;
  }, [items]);

  const tabs = useMemo(
    () =>
      [...grouped.keys()].sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      }),
    [grouped],
  );

  // Keep the active tab valid even if `items` changes out from under it.
  const active = grouped.has(activeCategory) ? activeCategory : (tabs[0] ?? '');

  // Rows of the active tab as [effectiveRow, ids], ordered top-to-bottom like the game.
  const activeRows = useMemo<[number, string[]][]>(() => {
    const rows = grouped.get(active);
    if (!rows) return [];
    return [...rows.entries()].sort((a, b) => a[0] - b[0]);
  }, [grouped, active]);

  const searching = deferredQuery.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return [];
    return items
      .filter((id) => matchesSearch(id, searchIndex[id], deferredQuery))
      .slice()
      .sort((a, b) => {
        const ra = itemById.get(a)?.row ?? 99;
        const rb = itemById.get(b)?.row ?? 99;
        return ra - rb || name(a).localeCompare(name(b));
      })
      .slice(0, 200);
  }, [items, deferredQuery, searching, name]);

  // The visible grid as rows of ≤14 ids — the model arrow-key navigation walks.
  const gridRows = useMemo<string[][]>(
    () => (searching ? chunk(results) : activeRows.flatMap(([, band]) => chunk(band))),
    [searching, results, activeRows],
  );

  // Keep exactly one valid roving-tabindex cell as the visible set changes.
  useEffect(() => {
    if (!open) return;
    const visible = gridRows.flat();
    setFocusedId((cur) => {
      if (cur && visible.includes(cur)) return cur;
      if (value && visible.includes(value)) return value;
      return visible[0] ?? '';
    });
  }, [open, gridRows, value]);

  const registerRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) cellRefs.current.set(id, el);
    else cellRefs.current.delete(id);
  }, []);

  const select = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setQuery('');
    },
    [onChange],
  );

  function openToggle() {
    const opening = !open;
    setOpen(opening);
    if (!opening) return;
    setQuery('');
    // Open to the selected item's tab; with nothing selected, fall back to tabs[0].
    const item = value ? itemById.get(value) : undefined;
    setActiveCategory(item ? tabKey(item.category) : '');
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!NAV_KEYS.has(e.key)) return;
    let r = 0;
    let c = 0;
    for (let i = 0; i < gridRows.length; i++) {
      const j = gridRows[i].indexOf(focusedId);
      if (j >= 0) {
        r = i;
        c = j;
        break;
      }
    }
    if (e.key === 'ArrowLeft') c -= 1;
    else if (e.key === 'ArrowRight') c += 1;
    else if (e.key === 'ArrowUp') r -= 1;
    else if (e.key === 'ArrowDown') r += 1;
    else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = Infinity;

    r = Math.max(0, Math.min(r, gridRows.length - 1));
    const row = gridRows[r];
    if (!row || row.length === 0) return;
    c = Math.max(0, Math.min(c, row.length - 1));

    e.preventDefault();
    const next = row[c];
    setFocusedId(next);
    cellRefs.current.get(next)?.focus();
  }

  return (
    <div ref={ref} className="relative w-full sm:w-auto sm:min-w-[260px]">
      <button
        type="button"
        onClick={openToggle}
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
        <SearchIcon className="ml-auto size-4 opacity-60" aria-hidden="true" />
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-max max-w-[92vw] rounded-md border border-border bg-popover shadow-xl">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('selector.typeToFilter')}
              aria-label={t('selector.typeToFilter')}
            />
          </div>

          {searching ? null : (
            <Tabs value={active} onValueChange={setActiveCategory}>
              <TabsList className="w-full px-2 pt-1.5">
                {tabs.map((category) => (
                  <TabsTrigger key={category} value={category}>
                    {categoryName(category)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          <div className="max-h-80 overflow-auto p-2" onKeyDown={onGridKeyDown}>
            {searching ? (
              results.length > 0 ? (
                <div
                  className="grid gap-0.5"
                  style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 2.5rem)` }}
                >
                  {results.map((id) => (
                    <ItemCell
                      key={id}
                      id={id}
                      label={name(id)}
                      selected={id === value}
                      active={id === focusedId}
                      onSelect={select}
                      registerRef={registerRef}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t('selector.noMatches')}
                </div>
              )
            ) : (
              <div className="flex flex-col gap-1.5">
                {activeRows.map(([rowKey, band]) => (
                  <div
                    key={rowKey}
                    className="grid gap-0.5"
                    style={{ gridTemplateColumns: `repeat(${GRID_COLS}, 2.5rem)` }}
                  >
                    {band.map((id) => (
                      <ItemCell
                        key={id}
                        id={id}
                        label={name(id)}
                        selected={id === value}
                        active={id === focusedId}
                        onSelect={select}
                        registerRef={registerRef}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ItemCellProps {
  id: string;
  label: string;
  selected: boolean;
  /** Holds the grid's single tab stop (roving tabindex). */
  active: boolean;
  onSelect: (id: string) => void;
  registerRef: (id: string, el: HTMLButtonElement | null) => void;
}

/** A single 40px icon slot in the picker grid. */
const ItemCell = memo(function ItemCell({
  id,
  label,
  selected,
  active,
  onSelect,
  registerRef,
}: ItemCellProps) {
  return (
    <button
      ref={(el) => registerRef(id, el)}
      type="button"
      tabIndex={active ? 0 : -1}
      onClick={() => onSelect(id)}
      aria-label={label}
      aria-pressed={selected}
      title={label}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-sm cursor-pointer transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'bg-accent ring-2 ring-primary' : 'border border-border bg-card hover:bg-accent',
      )}
    >
      <ItemIcon id={id} size={32} />
    </button>
  );
});
