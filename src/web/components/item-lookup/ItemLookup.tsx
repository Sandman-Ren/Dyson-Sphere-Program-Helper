import { useMemo } from 'react';
import { ItemList } from './ItemList.js';
import { ItemDetail } from './ItemDetail.js';
import { ItemSelector } from '../ItemSelector.js';
import { items } from '../../data.js';

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

  return (
    <div className="mx-auto flex h-full max-w-6xl gap-4 p-4">
      {/* Left pane — browsable list */}
      <aside className="flex w-72 flex-shrink-0 flex-col gap-3">
        <ItemSelector
          items={browsableIds}
          value={selectedItem}
          onChange={onSelectItem}
          placeholder="Search items…"
        />
        <ItemList items={browsable} selectedItem={selectedItem} onSelectItem={onSelectItem} />
      </aside>

      {/* Right pane — details */}
      <main className="min-w-0 flex-1 overflow-auto">
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
