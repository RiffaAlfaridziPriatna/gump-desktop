import type {TextStyle} from 'react-native';

export const fonts = {
  serif: 'DM Serif Display',
  sans: 'Red Hat Display',
  sansMedium: 'Red Hat Display',
  sansBold: 'Red Hat Display',
  sansSemiBold: 'Red Hat Display',
  interSemiBold: 'Inter',
} as const;

// The Red Hat Display files carry OS/2 weights Medium 596, SemiBold 707 and
// Bold 799 in one family. Bold asks for 800 so DirectWrite picks 799, not the
// SemiBold at 707 that a request for 700 would match.
/** Spread into Text styles for bold sans (family + weight on Windows). */
export const sansBoldStyle = {
  fontFamily: fonts.sansBold,
  fontWeight: '800',
} as const satisfies TextStyle;

export const sansMediumStyle = {
  fontFamily: fonts.sansMedium,
  fontWeight: '500',
} as const satisfies TextStyle;

// Match macOS: sansSemiBold ships Medium (OS/2 596), not SemiBold 707.
export const sansSemiBoldStyle = {
  fontFamily: fonts.sansSemiBold,
  fontWeight: '500',
} as const satisfies TextStyle;

export const interSemiBoldStyle = {
  fontFamily: fonts.interSemiBold,
  fontWeight: '600',
} as const satisfies TextStyle;
