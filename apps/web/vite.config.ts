import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { signInitData } from '../server/src/api/init-data';
import { shouldSignLocally } from './dev-proxy';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

/**
 * Content Security Policy for the built page (dev mode needs inline scripts for React Refresh).
 * Scripts: our bundle and Telegram's SDK; API: same origin; images: Telegram avatars over https.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://telegram.org",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy: Plugin = {
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
};
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, '');
  const devUserId = Number(env.DEV_USER_ID);
  const canSign = Boolean(env.BOT_TOKEN) && Number.isSafeInteger(devUserId) && devUserId > 0;

  return {
    plugins: [react(), tailwindcss(), contentSecurityPolicy],
    server: {
      port: 5173,
      // Quick tunnels for testing inside Telegram: cloudflared, or SSH tunnels (localhost.run, Pinggy)
      // where Cloudflare's port 7844 is blocked.
      allowedHosts: ['.trycloudflare.com', '.lhr.life', '.pinggy.link'],
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.PORT || 8787}`,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Outside Telegram there is no init data, so the dev server signs it for DEV_USER_ID.
              // Everything else (tunnel, other sites) must bring real Telegram data.
              if (!canSign || req.headers.authorization || !shouldSignLocally(req.headers)) return;
              const fields = {
                auth_date: String(Math.floor(Date.now() / 1000)),
                user: JSON.stringify({ id: devUserId, first_name: env.DEV_USER_NAME || 'Dev', language_code: 'ru' }),
              };
              proxyReq.setHeader('Authorization', `tma ${signInitData(fields, env.BOT_TOKEN!)}`);
            });
          },
        },
      },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
