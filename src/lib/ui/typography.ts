import type {TextStyle} from 'react-native';

// PostScript names — most reliable on macOS after CTFontManager registration.
export const fonts = {
  serif: 'DMSerifDisplay-Regular',
  sans: 'RedHatDisplay-Regular',
  sansBold: 'RedHatDisplay-Bold',
} as const;

/** Spread into Text styles for bold sans. */
export const sansBoldStyle = {
  fontFamily: fonts.sansBold,
} as const satisfies TextStyle;
