import {Platform} from 'react-native';

import {
  fonts,
  interSemiBoldStyle,
  sansSemiBoldStyle,
} from '../src/lib/ui/typography';

const registered =
  Platform.OS === 'windows'
    ? {sansSemiBold: 'Red Hat Display SemiBold', interSemiBold: 'Inter SemiBold'}
    : {sansSemiBold: 'RedHatDisplay-SemiBold', interSemiBold: 'Inter-SemiBold'};

describe('semibold font tokens', () => {
  it('resolve to the registered font names', () => {
    expect(fonts.sansSemiBold).toBe(registered.sansSemiBold);
    expect(fonts.interSemiBold).toBe(registered.interSemiBold);
  });

  it('style helpers set the family and no fontWeight', () => {
    expect(sansSemiBoldStyle).toEqual({fontFamily: fonts.sansSemiBold});
    expect(interSemiBoldStyle).toEqual({fontFamily: fonts.interSemiBold});
  });
});
