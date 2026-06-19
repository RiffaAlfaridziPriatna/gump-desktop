export const colors = {
  // Brand
  accent: '#FF9632',

  // Backgrounds — darkest to lightest
  background: '#131415',
  cardBackground: '#FFFFFF',
  cardBackgroundSecondary: '#1E1E1E',

  // Borders
  border: '#2C2D2F',
  borderSubtle: '#222222',

  // Text
  text: '#FFFFFF',
  textDark: '#131415',
  textMuted: '#737373',
  textPlaceholder: '#666666',
  textGray: "#B7B7B7",

  // Icon
  iconMuted: "#88888A",

  // Semantic
  link: '#5B8AF5',
  error: '#FF6E5A',
  success: '#4CAF50',
  white: '#FFFFFF',

  // Divider
  divider: '#303030',

  // UI
  badge: '#FFFFFF99',
  modalOverlay: 'rgba(0,0,0,0.7)',
  progressTrack: '#E0E0E0',
} as const;

export type AppColor = (typeof colors)[keyof typeof colors];
