import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
}

await build({
  ...shared,
  entryPoints: ['src/functions/health.ts'],
  outfile: 'dist/functions/health.js',
})

await build({
  ...shared,
  entryPoints: ['src/functions/transcribe.ts'],
  outfile: 'dist/functions/transcribe.js',
})

console.log('API build complete.')
