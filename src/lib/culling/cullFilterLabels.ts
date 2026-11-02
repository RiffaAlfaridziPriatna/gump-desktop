import type {CullFilterKey} from './cullingUtil';

export const CULL_FILTER_LABELS: Record<CullFilterKey, string> = {
  aiSelected: 'AI Recommended',
  maybe: 'Needs Review',
  blurred: 'Possible Blur',
  closedEyes: 'Possible Closed Eyes',
  duplicated: 'Similar Shots',
};

export const CULL_FILTER_ORDER: readonly CullFilterKey[] = [
  'aiSelected',
  'maybe',
  'blurred',
  'closedEyes',
  'duplicated',
];
