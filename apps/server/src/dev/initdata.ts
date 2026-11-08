// Prints an Authorization header with init data signed by your bot token,
// so you can call the local API with curl before the Mini App exists.
// Usage: npm run initdata -w @habit/server -- <telegramUserId> [firstName]
import { signInitData } from '../api/init-data';
import { loadConfig } from '../config';

const [idArg, name = 'Dev'] = process.argv.slice(2);
const id = Number(idArg);
if (!Number.isSafeInteger(id) || id <= 0) {
  console.error('Usage: npm run initdata -w @habit/server -- <telegramUserId> [firstName]');
  process.exit(1);
}
const { BOT_TOKEN } = loadConfig();
const fields = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id, first_name: name, language_code: 'ru' }),
};
console.log(`Authorization: tma ${signInitData(fields, BOT_TOKEN)}`);
