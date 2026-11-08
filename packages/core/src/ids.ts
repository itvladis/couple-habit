const TOKEN_BYTES = 9;
const RANDOM_SUFFIX_BYTES = 6;
const TIME_PART_LENGTH = 9;

function randomBase64Url(bytes: number): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buffer)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const newId = (): string => crypto.randomUUID();

/** Unguessable token that fits Telegram's start parameter alphabet (A–Z, a–z, 0–9, _ and -). */
export const newToken = (): string => randomBase64Url(TOKEN_BYTES);

/** Id that sorts by creation time, so it can double as a pagination cursor. */
export const sortableId = (now: Date): string =>
  now.getTime().toString(36).padStart(TIME_PART_LENGTH, '0') + randomBase64Url(RANDOM_SUFFIX_BYTES);
