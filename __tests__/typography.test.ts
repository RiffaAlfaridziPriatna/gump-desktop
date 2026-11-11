import {Platform} from 'react-native';

import {
  fonts,
  interSemiBoldStyle,
  sansBoldStyle,
  sansSemiBoldStyle,
} from '../src/lib/ui/typography';

const registered =
  Platform.OS === 'windows'
    ? {sansSemiBold: 'Red Hat Display', interSemiBold: 'Inter'}
    : {sansSemiBold: 'RedHatDisplay-SemiBold', interSemiBold: 'Inter-SemiBold'};

const weight = Platform.OS === 'windows' ? {fontWeight: '600'} : {};

describe('semibold font tokens', () => {
  it('resolve to the registered font names', () => {
    expect(fonts.sansSemiBold).toBe(registered.sansSemiBold);
    expect(fonts.interSemiBold).toBe(registered.interSemiBold);
  });

  it('style helpers set the family, with weight 600 only on Windows', () => {
    expect(sansSemiBoldStyle).toEqual({fontFamily: fonts.sansSemiBold, ...weight});
    expect(interSemiBoldStyle).toEqual({fontFamily: fonts.interSemiBold, ...weight});
  });

  it('bold asks for 800 on Windows so it stays clear of the 707 SemiBold', () => {
    expect(sansBoldStyle.fontFamily).toBe(fonts.sansBold);
    expect('fontWeight' in sansBoldStyle ? sansBoldStyle.fontWeight : undefined).toBe(
      Platform.OS === 'windows' ? '800' : undefined,
    );
  });
});
