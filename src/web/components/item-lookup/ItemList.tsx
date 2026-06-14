import { useMemo } from 'react';
import type { Item } from '../../../data/schema.js';
import { ItemIcon } from '../ItemIcon.js';
import { displayName } from '../../data.js';
import { cn } from '../../lib/cn.js';

interface ItemListProps {
  items: Item[];
  selectedItem: string;
  onSelectItem: (id: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  components: 'Components',
  buildings: 'Buildings',
  'buildings-alt': 'Buildings',
};

/** Category display order; anything unlisted falls to the end alphabetically. */
const CATEGORY_ORDER = ['components', 'buildings', 'buildings-alt'];

interface Group {
  category: string;
  label: string;
  items: Item[];
}

/** A persistent, scrollable list of items grouped by category and ordered by row. */
export function ItemList({ items, selectedItem, onSelectItem }: ItemListProps) {
  const groups = useMemo<Group[]>(() => {
    const byCategory = new Map<string, Item[]>();
    for (const item of items) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return [...byCategory.entries()]
      .sort(([a], [b]) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        return a.localeCompare(b);
      })
      .map(([category, list]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        items: list.slice().sort((x, y) => x.row - y.row || displayName(x.id).localeCompare(displayName(y.id))),
      }));
  }, [items]);

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card">
      {groups.map((group) => (
        <section key={group.category}>
          <h3 className="sticky top-0 z-10 border-b border-border bg-card/95 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            {group.label}
            <span className="ml-1.5 font-normal lowercase tracking-normal opacity-60">
              {group.items.length}
            </span>
          </h3>
          <ul className="p-1">
            {group.items.map((item) => {
              const active = item.id === selectedItem;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectItem(item.id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm cursor-pointer transition-colors',
                      'hover:bg-accent',
                      active && 'bg-accent font-medium text-primary',
                    )}
                  >
                    <ItemIcon id={item.id} size={20} tinted />
                    <span className="truncate">{displayName(item.id)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
