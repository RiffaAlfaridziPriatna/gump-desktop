import {LOOK_IDS, isLookId} from '../src/domain/valueObjects/Look';
import * as libTypes from '../src/lib/look/types';

describe('isLookId', () => {
  it.each(LOOK_IDS)('accepts %s', id => {
    expect(isLookId(id)).toBe(true);
  });

  it.each([undefined, null, 42, '', 'sepia', {}])('rejects %p', value => {
    expect(isLookId(value)).toBe(false);
  });

  it('is re-exported from @lib/look/types', () => {
    expect(libTypes.isLookId).toBe(isLookId);
    expect(libTypes.LOOK_IDS).toBe(LOOK_IDS);
  });
});
