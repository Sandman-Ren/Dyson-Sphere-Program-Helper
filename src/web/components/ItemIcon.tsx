import { iconById, ICON_TILE, ICON_SHEET, iconColor } from '../data.js';
import { useNames } from '../i18n/useNames.js';

const BASE = import.meta.env.BASE_URL; // matches vite.config `base`

interface ItemIconProps {
  id: string;
  size?: number;
  /** Show a subtle rounded background tinted with the icon's accent color. */
  tinted?: boolean;
  title?: string;
  className?: string;
}

/**
 * Renders a DSP item/recipe/building icon from the shared sprite sheet.
 * Falls back to a colored dot when the id has no sprite entry.
 */
export function ItemIcon({ id, size = 24, tinted = false, title, className }: ItemIconProps) {
  const { name } = useNames();
  const icon = iconById.get(id);
  const label = title ?? name(id);

  const wrapper: React.CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    flexShrink: 0,
    borderRadius: tinted ? Math.max(3, size * 0.18) : 0,
    background: tinted ? `color-mix(in srgb, ${iconColor(id)} 22%, transparent)` : undefined,
    verticalAlign: 'middle',
  };

  if (!icon) {
    return (
      <span
        title={label}
        className={className}
        style={{ ...wrapper, background: iconColor(id), borderRadius: '50%' }}
      />
    );
  }

  const scale = size / ICON_TILE;
  return (
    <span
      title={label}
      className={className}
      role="img"
      aria-label={label}
      style={{
        ...wrapper,
        backgroundImage: `url(${BASE}icons.webp)`,
        backgroundPosition: `${-icon.x * scale}px ${-icon.y * scale}px`,
        backgroundSize: `${ICON_SHEET * scale}px ${ICON_SHEET * scale}px`,
        backgroundRepeat: 'no-repeat',
      }}
    />
  );
}
