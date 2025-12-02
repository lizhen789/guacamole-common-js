import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  target:"es5",
  outDir: 'dist',
  clean: true,
  format: ['esm'],
  globalName: 'Guacamole',
  dts: true,
  minify: false,
});
