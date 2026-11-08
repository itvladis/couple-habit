import { ApiError } from './api';
import type { Dict } from './i18n';

/** A short message in the user's language; raw server messages are English and technical. */
export function errorText(error: unknown, t: Dict): string {
  if (error instanceof ApiError) {
    const known = t.errors[error.code as keyof Dict['errors']];
    return known ?? t.errors.unknown;
  }
  return t.errors.network;
}
