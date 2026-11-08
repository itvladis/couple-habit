import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCloud } from '../../build-cloud';

describe('cloud bundle', () => {
  it('keeps class names, so grammY can still send requests after bundling', { timeout: 60_000 }, async () => {
    const outfile = join(await mkdtemp(join(tmpdir(), 'cloud-bundle-')), 'index.js');

    await buildCloud(outfile);
    const code = await readFile(outfile, 'utf8');

    // node-fetch checks `signal.constructor.name === 'AbortSignal'`; a renamed class broke every Bot API call.
    expect(code).toMatch(/var AbortSignal\d* = class[\s\S]{0,300}__name\(this, "AbortSignal"\)/);
    expect(code).toMatch(/exports.*handler|handler:/);
  });
});
