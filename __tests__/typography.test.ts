import {Platform} from 'react-native';

import {
  fonts,
  interSemiBoldStyle,
  sansBoldStyle,
  sansMediumStyle,
  sansSemiBoldStyle,
} from '../src/lib/ui/typography';

const registered =
  Platform.OS === 'windows'
    ? {
        sansMedium: 'Red Hat Display',
        sansSemiBold: 'Red Hat Display',
        interSemiBold: 'Inter',
      }
    : {
        sansMedium: 'RedHatDisplay-Medium',
        sansSemiBold: 'RedHatDisplay-Medium',
        interSemiBold: 'Inter-SemiBold',
      };

const semiWeight = Platform.OS === 'windows' ? {fontWeight: '500'} : {};
const mediumWeight = Platform.OS === 'windows' ? {fontWeight: '500'} : {};

describe('semibold font tokens', () => {
  it('resolve to the registered font names', () => {
    expect(fonts.sansMedium).toBe(registered.sansMedium);
    expect(fonts.sansSemiBold).toBe(registered.sansSemiBold);
    expect(fonts.interSemiBold).toBe(registered.interSemiBold);
  });

  it('style helpers set the family, with weight only on Windows', () => {
    expect(sansMediumStyle).toEqual({
      fontFamily: fonts.sansMedium,
      ...mediumWeight,
    });
    expect(sansSemiBoldStyle).toEqual({
      fontFamily: fonts.sansSemiBold,
      ...semiWeight,
    });
    expect(interSemiBoldStyle).toEqual({
      fontFamily: fonts.interSemiBold,
      ...semiWeight,
    });
  });

  it('bold asks for 800 on Windows so it stays clear of the 707 SemiBold', () => {
    expect(sansBoldStyle.fontFamily).toBe(fonts.sansBold);
    expect('fontWeight' in sansBoldStyle ? sansBoldStyle.fontWeight : undefined).toBe(
      Platform.OS === 'windows' ? '800' : undefined,
    );
  });
});
