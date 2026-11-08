import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { errorText } from './errors';
import { DICTS } from './i18n';

describe('errorText', () => {
  it('translates known server error codes instead of showing raw messages', () => {
    expect(errorText(new ApiError(403, 'forbidden', 'only the habit owner can do this'), DICTS.ru)).toBe('Это может сделать только владелец');
    expect(errorText(new ApiError(422, 'invalid', '✖ Too big: expected string to have <=40 characters'), DICTS.en)).toBe('Please check what you entered');
  });

  it('falls back for unknown codes and network failures', () => {
    expect(errorText(new ApiError(500, 'internal', 'boom'), DICTS.ru)).toBe('Что-то пошло не так');
    expect(errorText(new TypeError('Failed to fetch'), DICTS.ru)).toBe('Нет связи с сервером');
  });
});
