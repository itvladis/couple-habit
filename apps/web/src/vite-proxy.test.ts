import { describe, expect, it } from 'vitest';
import { shouldSignLocally } from '../dev-proxy';

describe('dev proxy signing guard', () => {
  it('signs requests from the Vite page itself', () => {
    expect(shouldSignLocally({ host: 'localhost:5173', 'sec-fetch-site': 'same-origin' })).toBe(true);
    expect(shouldSignLocally({ host: '127.0.0.1:5173' })).toBe(true);
  });

  it('refuses requests that came through the tunnel', () => {
    expect(shouldSignLocally({ host: 'abc.trycloudflare.com' })).toBe(false);
    expect(shouldSignLocally({ host: 'localhost:5173', 'cf-connecting-ip': '1.2.3.4' })).toBe(false);
    expect(shouldSignLocally({ host: 'localhost:5173', 'x-forwarded-for': '1.2.3.4' })).toBe(false);
  });

  it('refuses cross-site requests from other pages in the browser', () => {
    expect(shouldSignLocally({ host: 'localhost:5173', 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })).toBe(false);
    expect(shouldSignLocally({ host: 'localhost:5173', origin: 'https://evil.example' })).toBe(false);
  });
});
