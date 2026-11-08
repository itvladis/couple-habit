import type { Snapshot } from '@habit/core';

const SNAPSHOT_KEYS: (keyof Snapshot)[] = [
  'users', 'habits', 'memberships', 'checks', 'friendships', 'inviteLinks', 'requests', 'events',
];

/**
 * Parses a stored data snapshot. Throws instead of returning something partial, so a damaged
 * file or object stops the app before it could be overwritten with less data.
 * @param source where the text came from, for the error message
 */
export function parseSnapshot(raw: string, source: string): Snapshot {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${source} is not valid JSON; fix or move it away before starting`, { cause: error });
  }
  const ok =
    typeof value === 'object' && value !== null && SNAPSHOT_KEYS.every((k) => Array.isArray((value as Record<string, unknown>)[k]));
  if (!ok) throw new Error(`${source} is not a valid data snapshot; fix or move it away before starting`);
  return value as Snapshot;
}
