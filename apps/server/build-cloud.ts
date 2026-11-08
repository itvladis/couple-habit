/** Bundles the Cloud Function entry (HTTP handler + timer) into one CommonJS file for nodejs22. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';

const ENTRY = resolve(import.meta.dirname, 'src/cloud/index.ts');
export const DEFAULT_OUTFILE = resolve(import.meta.dirname, '../../dist/cloud/index.js');

export async function buildCloud(outfile = DEFAULT_OUTFILE): Promise<void> {
  await build({
    entryPoints: [ENTRY],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile,
    legalComments: 'none',
    logLevel: 'warning',
    // grammY's node-fetch accepts a signal only if its class is *named* AbortSignal. Without this,
    // esbuild renames the class (AbortSignal2) and every Bot API call fails before leaving the process.
    keepNames: true,
  });
  // The repo root is "type": "module"; the function must load the bundle as CommonJS.
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(join(dirname(outfile), 'package.json'), JSON.stringify({ type: 'commonjs' }));
}

if (process.argv[1] === import.meta.filename) {
  await buildCloud();
  console.log(`built ${DEFAULT_OUTFILE}`);
}
