/**
 * This is a custom webpack config for the example app
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import openBrowser from 'react-dev-utils/openBrowser.js';
import webpack from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sandboxRoot = path.resolve(__dirname, '..');

const coverageInclude = [
  'ui/src/components/**/*.{ts,tsx}',
  'vite-app/src/**/*.{ts,tsx}',
  'webpack-app/src/**/*.{ts,tsx}',
];

const coverageExclude = [
  '**/*.test.{ts,tsx}',
  '**/test-setup.ts',
  '*/src/index.{ts,tsx}',
  'ui/src/index.ts',
];

const config = {
  devtool:
    process.env.USE_COVERAGE || process.env.NODE_ENV !== 'production'
      ? 'inline-source-map'
      : false,
  entry: './src/index.tsx',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  watchOptions: {
    ignored:
      /node_modules|\.storybook|playwright\/|playwright-report|playwright-coverage|test-results/,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'public', 'index.html'),
    }),
    new webpack.DefinePlugin({
      'process.env': 'Object',
      __DEV__: process.env.NODE_ENV !== 'production',
    }),
  ],
  devServer: {
    static: [
      {
        directory: path.join(__dirname, 'public'),
      },
    ],
    port: 3000,
    onListening: (devServer) => {
      const addr = devServer?.server?.address();
      if (addr && typeof addr === 'object' && 'port' in addr) {
        openBrowser(`http://localhost:${addr.port}`);
      }
    },
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: [
          process.env.USE_COVERAGE && {
            loader: 'babel-loader',
            options: {
              plugins: [
                [
                  'babel-plugin-istanbul',
                  {
                    coverageVariable: '__coverage__',
                    cwd: sandboxRoot,
                    include: coverageInclude,
                    exclude: coverageExclude,
                  },
                ],
              ],
            },
          },
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              compilerOptions: {
                sourceMap: true,
              },
            },
          },
        ].filter(Boolean),
      },
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['*', '.js', '.jsx', '.ts', '.tsx'],
  },
};

export default config;
