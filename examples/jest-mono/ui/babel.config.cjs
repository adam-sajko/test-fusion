// babel-jest config for unit tests. Instruments the original TSX so unit and E2E
// coverage share statement maps and fuse per file.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
    '@babel/preset-typescript',
  ],
};
