import { useCallback, useEffect, useState } from 'react';

const VALID = new Set(['calculator', 'tech-tree', 'item-lookup']);
const DEFAULT_TAB = 'calculator';

interface HashState {
  tab: string;
  subpath: string;
}

function parse(): HashState {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [tab, ...rest] = raw.split('/');
  if (tab && VALID.has(tab)) {
    return { tab, subpath: decodeURIComponent(rest.join('/')) };
  }
  return { tab: DEFAULT_TAB, subpath: '' };
}

/** URL-hash-backed tab router: `#tech-tree`, `#item-lookup/iron-ore`, etc. */
export function useHashTab() {
  const [state, setState] = useState<HashState>(parse);

  useEffect(() => {
    const onHash = () => setState(parse());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((tab: string, subpath?: string) => {
    const hash = subpath ? `#${tab}/${encodeURIComponent(subpath)}` : `#${tab}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    else setState(parse());
  }, []);

  const setTab = useCallback((tab: string) => navigate(tab), [navigate]);

  return { ...state, setTab, navigate };
}
