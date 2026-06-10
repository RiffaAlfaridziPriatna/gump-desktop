export const colors = {
  // Brand
  accent: '#FF9632',

  // Backgrounds — darkest to lightest
  background: '#131415',

  // Borders
  border: '#2C2D2F',
  borderSubtle: '#222222',

  // Text
  text: '#FFFFFF',
  textMuted: '#737373',
  textPlaceholder: '#666666',

  // Semantic
  link: '#50C3FF',
  error: '#FF4444',
} as const;

export type AppColor = (typeof colors)[keyof typeof colors];
