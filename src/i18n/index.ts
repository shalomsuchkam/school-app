import child from './child';
import common from './common';
import onboarding from './onboarding';
import parent from './parent';
import type { Bundle, Entry, Lang } from './types';

export type { Bundle, Entry, Lang };

// Each screen group keeps its strings in its own file; keys are prefixed with the group name.
const bundles: Bundle[] = [common, child, parent, onboarding];
export const DICT = Object.fromEntries(
  (['ru', 'kk', 'en'] as Lang[]).map((l) => [l, Object.assign({}, ...bundles.map((b) => b[l]))]),
) as Record<Lang, Record<string, Entry>>;
