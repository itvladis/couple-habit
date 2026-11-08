import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MemoryStore, type Snapshot } from '@habit/core';
import { parseSnapshot } from './snapshot';

const DEFAULT_DEBOUNCE_MS = 300;
const FIRST_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

async function readSnapshot(file: string): Promise<Snapshot | undefined> {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  return parseSnapshot(raw, file);
}

/**
 * Memory store that survives restarts by writing a JSON snapshot after changes (atomic rename).
 * A corrupt file stops startup instead of being overwritten; failed saves are retried with backoff,
 * and `flush()` rejects if the latest data could not be written.
 */
export async function openJsonStore(file: string, debounceMs = DEFAULT_DEBOUNCE_MS) {
  const snapshot = await readSnapshot(file);
  let dirty = false;
  let timer: NodeJS.Timeout | undefined;
  let retryMs = FIRST_RETRY_MS;
  let chain: Promise<void> = Promise.resolve();

  const save = async () => {
    dirty = false;
    const data = JSON.stringify(store.snapshot());
    try {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, data);
      await rename(`${file}.tmp`, file);
    } catch (error) {
      dirty = true;
      throw error;
    }
  };

  /** Runs saves one after another; the chain itself never stays rejected. */
  const enqueue = () => {
    const run = chain.then(save);
    chain = run.catch(() => {});
    return run;
  };

  const schedule = (delayMs: number) => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      enqueue().then(
        () => {
          retryMs = FIRST_RETRY_MS;
        },
        (error) => {
          console.error(`[store] failed to save ${file}, retrying in ${retryMs / 1000}s`, error);
          schedule(retryMs);
          retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
        },
      );
    }, delayMs);
    timer.unref();
  };

  const store: MemoryStore = new MemoryStore(snapshot, () => {
    dirty = true;
    schedule(debounceMs);
  });

  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    await chain;
    if (dirty) await enqueue();
  };

  return { store, flush };
}
