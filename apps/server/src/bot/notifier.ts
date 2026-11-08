import { resolveLanguage, type Notification, type Notifier, type Store } from '@habit/core';
import { GrammyError, type Api } from 'grammy';
import { TEXTS } from '../i18n/texts';
import { renderNotification } from './render';

const FORBIDDEN = 403;
const BAD_REQUEST = 400;
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR = 500;
const UNREACHABLE_RE = /chat not found|user not found|user is deactivated/i;

/**
 * Delivers core notifications as Telegram messages in each recipient's language.
 * Contract: resolves when sent or permanently undeliverable, rejects only when a retry may help
 * (network errors, 429, 5xx).
 */
export class TelegramNotifier implements Notifier {
  constructor(
    private readonly api: Api,
    private readonly store: Store,
    /** Mini App address for "Open" buttons; null until the frontend is deployed. */
    private readonly webAppUrl: string | null,
  ) {}

  async send(notification: Notification): Promise<void> {
    const user = await this.store.getUser(notification.to);
    if (!user || !user.canMessage) return;
    const { text, keyboard } = renderNotification(notification, TEXTS[resolveLanguage(user)], this.webAppUrl);
    try {
      await this.api.sendMessage(user.id, text, {
        parse_mode: 'HTML',
        reply_markup: keyboard,
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      if (!(error instanceof GrammyError)) throw error;
      const { error_code: code, description } = error;
      if (code === FORBIDDEN || (code === BAD_REQUEST && UNREACHABLE_RE.test(description))) {
        // Blocked or gone: stop sending until they /start again.
        console.warn(`[notifier] user ${user.id} is unreachable: ${description}`);
        await this.store.setCanMessage(user.id, false);
        return;
      }
      if (code === TOO_MANY_REQUESTS || code >= SERVER_ERROR) throw error;
      console.error(`[notifier] dropped ${notification.type} to ${user.id}: ${description}`);
    }
  }
}
