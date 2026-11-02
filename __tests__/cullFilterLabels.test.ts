import {
  CULL_FILTER_LABELS,
  CULL_FILTER_ORDER,
} from '../src/lib/culling/cullFilterLabels';
import {DEFAULT_CULL_FILTERS} from '../src/lib/culling/cullingUtil';

describe('cullFilterLabels', () => {
  it('labels every filter key exactly once, in Figma order', () => {
    expect(CULL_FILTER_ORDER.map(key => CULL_FILTER_LABELS[key])).toEqual([
      'AI Recommended',
      'Needs Review',
      'Possible Blur',
      'Possible Closed Eyes',
      'Similar Shots',
    ]);
  });

  it('covers exactly the CullFilterKey set with no duplicates', () => {
    const keys = Object.keys(DEFAULT_CULL_FILTERS).sort();
    expect([...CULL_FILTER_ORDER].sort()).toEqual(keys);
    expect(Object.keys(CULL_FILTER_LABELS).sort()).toEqual(keys);
    expect(new Set(CULL_FILTER_ORDER).size).toBe(CULL_FILTER_ORDER.length);
  });
});
