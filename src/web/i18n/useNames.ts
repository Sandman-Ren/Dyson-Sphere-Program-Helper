/**
 * Reactive display-name helpers. Subscribing via useTranslation re-renders
 * components when the language changes. `name` resolves any item/tech/machine/
 * proliferator id; `recipeName` prefers recipe wording; `categoryName` resolves
 * category ids (with buildings-alt folded into buildings).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveName, titleCase, type NamespaceLookup } from './resolveName.js';

export function useNames() {
  const { t, i18n } = useTranslation(['items', 'recipes', 'categories']);

  return useMemo(() => {
    const lookup: NamespaceLookup = (id, ns) =>
      t(id, { ns, defaultValue: '' }) as string;

    const categoryName = (id: string): string => {
      const key = id === 'buildings-alt' ? 'buildings' : id;
      const v = lookup(key, 'categories');
      return v || titleCase(id);
    };

    return {
      name: (id: string) => resolveName(lookup, id, ['items', 'recipes']),
      recipeName: (id: string) => resolveName(lookup, id, ['recipes', 'items']),
      categoryName,
    };
    // i18n.language is the re-render trigger; t identity is stable per language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, i18n.language]);
}
