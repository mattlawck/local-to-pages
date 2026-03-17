const path = require('node:path');

const baseConfig = {
  mode: 'development',
  devtool: 'source-map',
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  externals: {
    electron: 'commonjs electron',
    react: 'commonjs react',
    'react-dom': 'commonjs react-dom',
    'react-router-dom': 'commonjs react-router-dom',
    '@getflywheel/local': 'commonjs @getflywheel/local',
    '@getflywheel/local/renderer': 'commonjs @getflywheel/local/renderer',
    '@getflywheel/local/main': 'commonjs @getflywheel/local/main',
    '@getflywheel/local-components': 'commonjs @getflywheel/local-components',
  },
};

module.exports = [
  {
    ...baseConfig,
    target: 'electron-main',
    entry: './src/main/index.ts',
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist'),
      libraryTarget: 'commonjs2',
    },
  },
  {
    ...baseConfig,
    target: 'electron-renderer',
    entry: './src/renderer/index.tsx',
    output: {
      filename: 'renderer.js',
      path: path.resolve(__dirname, 'dist'),
      libraryTarget: 'commonjs2',
    },
  },
];
