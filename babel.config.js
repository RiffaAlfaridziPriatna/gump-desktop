module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    'babel-plugin-transform-typescript-metadata',
    ['@babel/plugin-proposal-decorators', {legacy: true}],
    [
      'transform-inline-environment-variables',
      {include: ['API_BASE_URL']},
    ],
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@lib': './src/lib',
          '@services': './src/services',
          '@context': './src/context',
          '@components': './src/components',
          '@hooks': './src/hooks',
          '@screens': './src/screens',
        },
      },
    ],
  ],
};
