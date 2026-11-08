/*
 * Screenshots of the Mini App for the README: six screens, dark and light, 390×844 @2x.
 *
 *   npx tsx scripts/demo-data.ts                                   # demo people and history
 *   DATA_FILE=.data/demo.json npm run dev                          # API on the demo data
 *   DEV_USER_ID=1001 DEV_USER_NAME=Alex npm run dev:web            # Mini App as Alex
 *   npm run screenshots                                            # → docs/screenshots/*.png
 *
 * Outside Telegram the app follows the system theme, so the browser's color scheme picks it.
 */
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

const BASE_URL = process.env.SCREENSHOT_URL ?? 'http://localhost:5173/';
const OUT_DIR = resolve(import.meta.dirname, '..', 'docs', 'screenshots');
const THEMES = ['dark', 'light'] as const;
/** iPhone 14/15 viewport, the most common phone size for Telegram. */
const VIEWPORT = { width: 390, height: 844 };
/** Spring animations in motion run on requestAnimationFrame, not WAAPI; give them a moment to rest. */
const SETTLE_MS = 400;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Run in the page; passed as strings so this Node script needs no DOM types.
  await page.evaluate('document.fonts.ready');
  await page.waitForFunction("document.getAnimations().every((a) => a.playState !== 'running')");
  await page.waitForTimeout(SETTLE_MS);
}

async function openHome(page: Page) {
  await page.goto(BASE_URL);
  await page.getByRole('heading', { name: 'Our habits' }).waitFor();
}

/** Each screen starts from a fresh home page, so one failing step cannot leak into the next. */
const SCREENS: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'home', open: openHome },
  {
    name: 'habit',
    open: async (page) => {
      await openHome(page);
      await page.getByText('Morning run').first().click();
      await page.getByText('Invite another friend').waitFor();
    },
  },
  {
    name: 'new-habit',
    open: async (page) => {
      await openHome(page);
      await page.getByRole('button', { name: 'Create a habit' }).click();
      await page.getByPlaceholder('For example, “Morning run”').fill('Drink water');
      await page.getByLabel('droplet', { exact: true }).click();
      await page.getByLabel('sky', { exact: true }).click();
    },
  },
  {
    name: 'feed',
    open: async (page) => {
      await openHome(page);
      await page.getByRole('button', { name: 'Feed' }).click();
      await page.getByRole('heading', { name: 'Feed' }).waitFor();
    },
  },
  {
    name: 'profile',
    open: async (page) => {
      await openHome(page);
      await page.getByRole('button', { name: 'Profile' }).click();
      await page.getByText('Invite a friend').waitFor();
    },
  },
  {
    name: 'invite',
    open: async (page) => {
      await openHome(page);
      await page.getByText('Morning run').first().click();
      await page.getByText('Invite another friend').click();
      await page.getByText('Get better together').waitFor();
    },
  },
];

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        colorScheme: theme,
        reducedMotion: 'reduce',
        locale: 'en-US',
        timezoneId: 'Europe/London',
      });
      const page = await context.newPage();
      for (const screen of SCREENS) {
        await screen.open(page);
        await settle(page);
        const file = join(OUT_DIR, `${screen.name}-${theme}.png`);
        await page.screenshot({ path: file });
        console.log(`  ${file}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

await main();
