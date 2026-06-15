/**
 * i18next runtime configuration. English name resources are derived from the
 * existing data arrays; Chinese names come from the generated zh bundle. UI
 * strings are hand-authored. Language is auto-detected (querystring → localStorage
 * → navigator) and persisted to localStorage; English is the fallback.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import itemsData from '../../data/generated/items.json';
import recipesData from '../../data/generated/recipes.json';
import zhBundle from '../../data/generated/i18n/zh.json';
import enCategories from '../../data/generated/i18n/en-categories.json';
import enUi from './locales/en/ui.js';
import zhUi from './locales/zh/ui.js';

type Named = { id: string; name: string };
const toMap = (rows: Named[]): Record<string, string> =>
  Object.fromEntries(rows.map((r) => [r.id, r.name]));

const enItems = toMap(itemsData as Named[]);
const enRecipes = toMap(recipesData as Named[]);

export const SUPPORTED_LANGUAGES = ['en', 'zh'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as unknown as string[],
    load: 'languageOnly',
    nonExplicitSupportedLngs: true,
    defaultNS: 'ui',
    ns: ['ui', 'items', 'recipes', 'categories'],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      caches: ['localStorage'],
    },
    resources: {
      en: { ui: enUi, items: enItems, recipes: enRecipes, categories: enCategories },
      zh: {
        ui: zhUi,
        items: zhBundle.items,
        recipes: zhBundle.recipes,
        categories: zhBundle.categories,
      },
    },
  });

/** Keep <html lang> in sync so the browser uses correct fonts/line-breaking. */
const syncHtmlLang = (lng: string) => {
  document.documentElement.lang = lng.startsWith('zh') ? 'zh' : 'en';
};
syncHtmlLang(i18n.language || 'en');
i18n.on('languageChanged', syncHtmlLang);

export default i18n;
