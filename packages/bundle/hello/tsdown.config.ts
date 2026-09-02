import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'lib/types/index.js',
    startup: 'lib/types/startup.js',
    invariant: 'lib/types/invariant.js',
  },
  outDir: 'lib',
  format: 'esm',
  fixedExtension: false,
  dts: false,
  clean: false,
})
