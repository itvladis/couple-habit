import { useEffect, useSyncExternalStore } from 'react';

/** The parts of Telegram.WebApp this app uses. https://core.telegram.org/bots/webapps */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  colorScheme: 'light' | 'dark';
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  openTelegramLink(url: string): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const webApp = (): TelegramWebApp | null => window.Telegram?.WebApp ?? null;
const supports = (version: string) => webApp()?.isVersionAtLeast(version) ?? false;

/** True inside a Telegram client; false in a desktop browser during development. */
export const isInsideTelegram = () => Boolean(webApp()?.initData);

export const initData = (): string | null => webApp()?.initData || null;

/** Telegram's own color scheme, used when the user keeps "theme: as in Telegram". */
export const telegramColorScheme = (): 'light' | 'dark' => {
  // Outside Telegram the script still reports "light"; follow the system instead.
  if (isInsideTelegram()) return webApp()!.colorScheme;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
};

/**
 * Where the app was asked to open: `startapp` links put it into start_param, the bot's
 * "Open" buttons into the `open` query parameter.
 */
export function launchTarget(): string | null {
  const query = new URLSearchParams(location.search);
  return webApp()?.initDataUnsafe.start_param ?? query.get('tgWebAppStartParam') ?? query.get('open');
}

export function startTelegram(): void {
  const app = webApp();
  if (!app) return;
  app.ready();
  app.expand();
  // Our sheets are dragged down; without this Telegram would collapse the whole app instead.
  if (supports('7.7')) app.disableVerticalSwipes?.();
}

/** Paints Telegram's header, background and bottom bar to match the current theme. */
export function paintChrome(color: string): void {
  const app = webApp();
  if (!app || !supports('6.1')) return;
  app.setHeaderColor(color);
  app.setBackgroundColor(color);
  if (supports('7.10')) app.setBottomBarColor?.(color);
}

export function onTelegramThemeChange(handler: () => void): () => void {
  const app = webApp();
  app?.onEvent('themeChanged', handler);
  return () => app?.offEvent('themeChanged', handler);
}

export const haptic = {
  impact(style: 'light' | 'medium' = 'light') {
    if (supports('6.1')) webApp()?.HapticFeedback.impactOccurred(style);
  },
  success() {
    if (supports('6.1')) webApp()?.HapticFeedback.notificationOccurred('success');
  },
  error() {
    if (supports('6.1')) webApp()?.HapticFeedback.notificationOccurred('error');
  },
  selection() {
    if (supports('6.1')) webApp()?.HapticFeedback.selectionChanged();
  },
};

/** Telegram's native back button exists from Bot API 6.1; outside Telegram the app draws its own. */
export const hasNativeBackButton = () => isInsideTelegram() && supports('6.1');

export const closeApp = () => {
  const app = webApp();
  if (app && isInsideTelegram()) app.close();
  else location.reload();
};

/*
 * Overlays (sheets) register here while open, so Back and Escape close the topmost one
 * before the screen underneath goes back.
 */
const overlays: (() => void)[] = [];
const overlayListeners = new Set<() => void>();
const notifyOverlays = () => overlayListeners.forEach((l) => l());

export function pushOverlay(close: () => void): () => void {
  overlays.push(close);
  notifyOverlays();
  return () => {
    const i = overlays.lastIndexOf(close);
    if (i !== -1) overlays.splice(i, 1);
    notifyOverlays();
  };
}

/** Closes the topmost overlay; false when there is none. */
export function closeTopOverlay(): boolean {
  const top = overlays.at(-1);
  if (!top) return false;
  top();
  return true;
}

export const useOverlayCount = () =>
  useSyncExternalStore(
    (listener) => {
      overlayListeners.add(listener);
      return () => overlayListeners.delete(listener);
    },
    () => overlays.length,
  );

/**
 * The single owner of Telegram's back button (in the app shell). Screens never touch it, so an
 * exiting screen's cleanup cannot hide the button the next screen just showed.
 */
export function useTelegramBackButton(visible: boolean, onBack: () => void): void {
  useEffect(() => {
    const app = webApp();
    if (!app || !hasNativeBackButton()) return;
    app.BackButton.onClick(onBack);
    return () => {
      app.BackButton.offClick(onBack);
    };
  }, [onBack]);
  useEffect(() => {
    const app = webApp();
    if (!app || !hasNativeBackButton()) return;
    if (visible) app.BackButton.show();
    else app.BackButton.hide();
  }, [visible]);
}

/** Opens Telegram's "share to chat" picker with a link; falls back to the system share sheet. */
export async function shareLink(url: string, text: string): Promise<void> {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  const app = webApp();
  if (app && isInsideTelegram()) {
    app.openTelegramLink(share);
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ url, text });
    } catch (error) {
      // The user closing the share sheet is not an error.
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
    return;
  }
  window.open(share, '_blank', 'noopener');
}

/** Clipboard API first; old Android webviews refuse it, so fall back to a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}
