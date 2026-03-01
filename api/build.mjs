import { build } from 'esbuild'

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: true,
  // @azure/functions-core is provided by the Azure Functions runtime host,
  // not shipped with user code. Leave the require() call as-is.
  external: ['@azure/functions-core'],
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
