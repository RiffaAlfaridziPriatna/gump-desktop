import type {TextStyle} from 'react-native';

export const fonts = {
  serif: 'DM Serif Display',
  sans: 'Red Hat Display',
  sansBold: 'Red Hat Display',
  sansSemiBold: 'Red Hat Display SemiBold',
  interSemiBold: 'Inter SemiBold',
} as const;

/** Spread into Text styles for bold sans (family + weight on Windows). */
export const sansBoldStyle = {
  fontFamily: fonts.sansBold,
  fontWeight: '700',
} as const satisfies TextStyle;

export const sansSemiBoldStyle = {
  fontFamily: fonts.sansSemiBold,
} as const satisfies TextStyle;

export const interSemiBoldStyle = {
  fontFamily: fonts.interSemiBold,
} as const satisfies TextStyle;
