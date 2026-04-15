import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  outDir: 'dist',
  external: ['@modelcontextprotocol/sdk'],
  noExternal: ['@nolan/shared'],
  banner: {
    js: '#!/usr/bin/env node',
  },
})
