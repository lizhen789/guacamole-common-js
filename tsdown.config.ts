import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  target:"ES2015",
  outDir: 'dist',
  clean: true,
  format: ['esm'],
  globalName: 'Guacamole',
  dts: true,
  minify: false,
});
