import { useMemo } from 'react';
import ChevronLeftIcon from 'lucide-react/dist/esm/icons/chevron-left';
import { ItemList } from './ItemList.js';
import { ItemDetail } from './ItemDetail.js';
import { ItemSelector } from '../ItemSelector.js';
import { items } from '../../data.js';
import { cn } from '../../lib/cn.js';

interface ItemLookupProps {
  selectedItem: string;
  onSelectItem: (id: string) => void;
  onCalculateItem: (id: string) => void;
  onViewTech: (id: string) => void;
}

/** Categories that represent real, browsable in-world items (vs. research pseudo-items). */
const BROWSABLE_CATEGORIES = new Set(['buildings', 'buildings-alt', 'components']);

/**
 * Item reference browser: a searchable list of items on the left and a rich
 * detail panel (recipes that produce it, recipes that consume it, and the
 * technologies that unlock it) on the right.
 */
export function ItemLookup({ selectedItem, onSelectItem, onCalculateItem, onViewTech }: ItemLookupProps) {
  const browsable = useMemo(
    () => items.filter((i) => BROWSABLE_CATEGORIES.has(i.category)),
    [],
  );
  const browsableIds = useMemo(() => browsable.map((i) => i.id), [browsable]);

  const showDetail = !!selectedItem;

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-4 p-3 sm:p-4">
      {/* Left pane — browsable list. On mobile it gives way to the detail view. */}
      <aside
        className={cn(
          'flex w-full flex-col gap-3 sm:w-72 sm:flex-shrink-0',
          showDetail && 'hidden sm:flex',
        )}
      >
        <ItemSelector
          items={browsableIds}
          value={selectedItem}
          onChange={onSelectItem}
          placeholder="Search items…"
        />
        <ItemList items={browsable} selectedItem={selectedItem} onSelectItem={onSelectItem} />
      </aside>

      {/* Right pane — details. Hidden on mobile until an item is picked. */}
      <main className={cn('min-w-0 flex-1 overflow-auto', !showDetail && 'hidden sm:block')}>
        {showDetail && (
          <button
            type="button"
            onClick={() => onSelectItem('')}
            className="-mx-1 mb-2 inline-flex items-center gap-1 rounded px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground active:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
          >
            <ChevronLeftIcon className="size-4" />
            Back to items
          </button>
        )}
        <ItemDetail
          selectedItem={selectedItem}
          onSelectItem={onSelectItem}
          onCalculateItem={onCalculateItem}
          onViewTech={onViewTech}
        />
      </main>
    </div>
  );
}
