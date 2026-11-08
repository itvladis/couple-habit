import { useEffect, useState } from 'react';
import type { Me } from '../lib/api';
import { onTelegramThemeChange, paintChrome, telegramColorScheme } from '../lib/telegram';

/** Matches --base in styles.css; Telegram needs plain hex for its own header and bars. */
const BASE_COLOR = { dark: '#0a0a0b', light: '#f2f1f7' } as const;

/** Applies the user's theme (or Telegram's when set to "auto") to <html> and Telegram's chrome. */
export function useTheme(preference: Me['theme']): 'light' | 'dark' {
  const [telegramScheme, setTelegramScheme] = useState(telegramColorScheme);
  useEffect(() => onTelegramThemeChange(() => setTelegramScheme(telegramColorScheme())), []);
  const scheme = preference === 'auto' ? telegramScheme : preference;
  useEffect(() => {
    document.documentElement.dataset.theme = scheme;
    paintChrome(BASE_COLOR[scheme]);
  }, [scheme]);
  return scheme;
}
