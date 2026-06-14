/// <reference types="vite/client" />

// lucide-react ships per-icon ESM modules without bundled type declarations.
declare module 'lucide-react/dist/esm/icons/*' {
  import type { LucideProps } from 'lucide-react';
  import type { ForwardRefExoticComponent, RefAttributes } from 'react';
  const Icon: ForwardRefExoticComponent<LucideProps & RefAttributes<SVGSVGElement>>;
  export default Icon;
}
