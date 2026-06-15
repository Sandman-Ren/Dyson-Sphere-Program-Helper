import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn.js';
import { SUPPORTED_LANGUAGES, type Language } from '../i18n/index.js';

/** Compact EN | 中文 segmented toggle for the header. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation('ui');
  const active = (i18n.language.startsWith('zh') ? 'zh' : 'en') as Language;

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-border text-xs"
    >
      {SUPPORTED_LANGUAGES.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => i18n.changeLanguage(lng)}
          aria-pressed={active === lng}
          className={cn(
            'px-2.5 py-1 font-medium cursor-pointer transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active === lng
              ? 'bg-primary text-primary-foreground'
              : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent',
          )}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  );
}
