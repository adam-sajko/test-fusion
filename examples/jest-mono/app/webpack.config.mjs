import path from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The example root (examples/jest-mono) — coverage keys are made relative to it so the
// ui, app, and Playwright reports all share the same file keys and fuse.
const exampleRoot = path.resolve(__dirname, '..');

const coverageInclude = [
  'ui/src/components/**/*.{ts,tsx}',
  'app/src/**/*.{ts,tsx}',
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
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, 'public', 'index.html'),
    }),
    new webpack.DefinePlugin({
      __DEV__: process.env.NODE_ENV !== 'production',
    }),
  ],
  devServer: {
    static: [{ directory: path.join(__dirname, 'public') }],
    port: 3000,
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              configFile: false,
              presets: [
                '@babel/preset-env',
                ['@babel/preset-react', { runtime: 'automatic' }],
                [
                  '@babel/preset-typescript',
                  { isTSX: true, allExtensions: true },
                ],
              ],
              plugins: [
                process.env.USE_COVERAGE && [
                  'babel-plugin-istanbul',
                  {
                    coverageVariable: '__coverage__',
                    cwd: exampleRoot,
                    include: coverageInclude,
                    exclude: coverageExclude,
                  },
                ],
              ].filter(Boolean),
            },
          },
        ],
      },
      { test: /\.m?js$/, resolve: { fullySpecified: false } },
      { test: /\.css$/i, use: ['style-loader', 'css-loader'] },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    // Resolve the workspace UI lib to its real source path (no node_modules) so
    // babel-plugin-istanbul instruments it and its coverage fuses with the rest.
    alias: {
      '@ex-jest-mono/ui': path.resolve(exampleRoot, 'ui/src/index.ts'),
    },
  },
};

export default config;
