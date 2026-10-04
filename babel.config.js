module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@core': './src/core',
            '@ui': './src/ui',
            '@modules': './src/modules',
            '@boards': './src/boards',
            '@': './',
          },
        },
      ],
      'react-native-worklets/plugin',
    ],
  };
};
