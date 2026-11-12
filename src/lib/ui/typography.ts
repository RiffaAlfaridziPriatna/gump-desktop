import type {TextStyle} from 'react-native';

// PostScript names — most reliable on macOS after CTFontManager registration.
export const fonts = {
  serif: 'DMSerifDisplay-Regular',
  sans: 'RedHatDisplay-Regular',
  sansMedium: 'RedHatDisplay-Medium',
  sansBold: 'RedHatDisplay-Bold',
  // Desktop renders Red Hat SemiBold heavier than Figma; ship Medium instead.
  sansSemiBold: 'RedHatDisplay-Medium',
  interSemiBold: 'Inter-SemiBold',
} as const;

/** Spread into Text styles for bold sans. */
export const sansBoldStyle = {
  fontFamily: fonts.sansBold,
} as const satisfies TextStyle;

export const sansMediumStyle = {
  fontFamily: fonts.sansMedium,
} as const satisfies TextStyle;

export const sansSemiBoldStyle = {
  fontFamily: fonts.sansSemiBold,
} as const satisfies TextStyle;

export const interSemiBoldStyle = {
  fontFamily: fonts.interSemiBold,
} as const satisfies TextStyle;
