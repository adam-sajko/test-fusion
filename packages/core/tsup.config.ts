import { copyFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  format: 'esm',
  dts: { compilerOptions: { composite: false } },
  sourcemap: true,
  clean: true,
  onSuccess: async () => {
    copyFileSync('template.html', 'dist/template.html');
  },
});
