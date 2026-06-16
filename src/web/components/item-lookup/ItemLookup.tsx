import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
 * Item reference browser: the in-game-style grid picker selects an item, and a
 * rich detail panel below shows the recipes that produce it, the recipes that
 * consume it, and the technologies that unlock it.
 */
export function ItemLookup({ selectedItem, onSelectItem, onCalculateItem, onViewTech }: ItemLookupProps) {
  const { t } = useTranslation('ui');
  const browsableIds = useMemo(
    () => items.filter((i) => BROWSABLE_CATEGORIES.has(i.category)).map((i) => i.id),
    [],
  );

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 p-3 sm:p-4">
      <ItemSelector
        items={browsableIds}
        value={selectedItem}
        onChange={onSelectItem}
        placeholder={t('selector.searchItems')}
      />
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
