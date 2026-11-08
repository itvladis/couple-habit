# Habit Tracker for Telegram

A Telegram bot + Mini App for tracking habits together with friends: shared habits where the day counts when **everyone** (or **anyone**) checks in, streaks, a friends feed, reminders and a weekly summary.

> Status: deployed to Yandex Cloud (serverless). Bot, Mini App and API run from one API Gateway.

## Features

- **Habits**: daily, specific weekdays or *N times a week*; personal or shared with friends; archive instead of delete.
- **Shared habits**: the owner picks whether a day counts when all members check in or when any of them does. Members who joined later are only required from the day they joined.
- **Streaks** per frequency type: days in a row, scheduled days in a row, or weeks in a row that hit the target. Today and the current week never break a streak before they end.
- **Time zones**: every user lives in their own; checks are stored as the user's local date.
- **Friends & invites**: an invite link opens the Mini App on an invite screen; tapping *Join* sends a request that the link owner approves. Owners can also invite an existing friend directly.
- **Everything happens in the Mini App.** The bot has no commands besides `/start`: it delivers notifications (a friend checked in, requests, reminders at an exact time or a random minute inside a window, weekly summary) with quick buttons (*Check mine too*, *Accept*) and an *Open* button that lands on the matching screen.
- **RU / EN** by the Telegram language, with a manual override.

## Architecture

```
packages/core      domain logic, services, storage interface (no Telegram, no HTTP)
  domain/          pure functions: dates & time zones, schedules, completion, streaks, reminders
  services/        use cases: habits, checks, social (friends, links, requests), feed, views, jobs
  storage/         Store interface + in-memory implementation
apps/web           Telegram Mini App: React 19, Vite, Tailwind v4, Motion, TanStack Query
apps/relay         Cloudflare Worker that carries Bot API traffic (Telegram is blocked from Russian data centres)
apps/server        adapters
  api/             Hono REST API, Telegram Mini App init-data auth, rate limiting
  bot/             grammY bot, notification rendering and delivery
  storage/         JSON file (local), JSON snapshot in Object Storage (cloud), YDB adapter
  cloud/           Cloud Function entry points: HTTP handler and the minute timer
scripts/deploy.ts  idempotent Yandex Cloud deploy (yc CLI)
```

Core never imports Telegram or HTTP code, so the same services run under long polling locally and in serverless functions in the cloud.

## Deploy (Yandex Cloud)

```
Telegram ──webhook──▶ relay (Cloudflare Worker) ──▶ API Gateway /bot/webhook ──▶ habit-api ──▶ data bucket
Mini App ──https──────────────────────────────────▶ API Gateway /, /api/* ─────▶ web bucket, habit-api
Timer (every minute) ─────────────────────────────────────────────────────────▶ habit-tick ──▶ data bucket
habit-api, habit-tick ──Bot API──▶ relay ──▶ api.telegram.org
```

**Why the relay.** Telegram and Russian data centres cannot reach each other (blocked both ways), while users in Russia reach Yandex Cloud fine. So the Mini App, API and data stay in Yandex Cloud, and only Bot API traffic goes through a tiny Cloudflare Worker (`apps/relay`): `POST /webhook` forwards updates with Telegram's secret header, `/<RELAY_SECRET>/bot<token>/<method>` forwards Bot API calls to api.telegram.org and nothing else, so it is not an open proxy.

Requirements: [yc CLI](https://yandex.cloud/docs/cli/quickstart) after `yc init`, a cloud with an active billing account, a free Cloudflare account after `npx wrangler login`, `BOT_TOKEN` in `.env`.

```bash
npm run deploy
```

The script is idempotent: it creates what is missing and updates the rest — service account, buckets, functions, gateway, relay Worker, timer, then the Telegram webhook (with a secret token, pointing at the relay) and the menu button. Everything fits the free tier for a few users.

- **Data.** One JSON snapshot in a private, versioned bucket in its own folder (`habit-tracker-data`); old versions are kept 30 days for rollback. Every invocation runs as a transaction: load, run, save with `If-Match`; on a concurrent write the work is rerun on fresh data, so no change is lost (`apps/server/src/storage/snapshot-store.ts`). The same Store contract tests run against it.
- **YDB.** A YDB adapter exists (`storage/ydb.ts`, `DEPLOY_STORAGE=ydb npm run deploy`). Serverless YDB currently times out compiling any query that reads a table, even in a fresh database, so the snapshot store is the default.
- **Least privilege.** The service account can read storage in the app folder, upload only in the data folder, and invoke only the two functions. Requests without a webhook secret or Telegram init data are answered before any data is read.
- **Secrets.** `BOT_TOKEN`, the webhook secret and the relay path live in function environment variables (the relay secret also as a Worker secret); both secrets are generated once into `.data/deploy.json` (git-ignored, mode 600). Deploy errors are printed with secrets masked.

After deploying, set the printed URL as the bot's **Main Mini App** in @BotFather so `t.me/<bot>?startapp=...` links work.

While the webhook is set, `npm run dev` serves only the local API: it does not poll, does not change the bot's menu and sends no reminders. `BOT_POLLING=force npm run dev` takes the bot back for local work (it deletes the webhook; run `npm run deploy` to restore it).

## Run locally

Requirements: Node.js 22+.

```bash
npm install
cp .env.example .env   # then paste your bot token from @BotFather into BOT_TOKEN
npm run dev            # API on :8787 + bot via long polling + reminders every minute
```

Data is kept in `.data/db.json` (git-ignored).

Run the Mini App in a browser (in a second terminal):

```bash
npm run dev:web        # http://localhost:5173
```

Outside Telegram there is no init data, so the Vite dev proxy signs API requests for `DEV_USER_ID` from `.env` — only for same-origin requests to `localhost` (see `apps/web/dev-proxy.ts`). Inside Telegram, use the deployed version (see Deploy); requests from anywhere but `localhost` must carry real Telegram data.

Call the API before the Mini App exists:

```bash
npm run initdata -w @habit/server -- <your Telegram id> Vlad   # prints an Authorization header
curl -H "Authorization: tma ..." http://localhost:8787/api/v1/habits
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm test` | all unit and integration tests (Vitest) |
| `npm run coverage` | tests with coverage report |
| `npm run typecheck` | TypeScript strict check |
| `npm run dev` | local API + bot with reload |
| `npm run dev:web` | Mini App dev server |
| `npm run build -w @habit/web` | production build of the Mini App |
| `npm run deploy` | deploy everything to Yandex Cloud |

## API

All routes live under `/api/v1` and need `Authorization: tma <Telegram.WebApp.initData>`; the signature is verified with the bot token (HMAC-SHA256, `WebAppData` key) and expires after 24 h.

Responses are `{ "data": ... }`; errors are `{ "error": { "code", "message" } }` with 400/401/403/404/409/413/422/429.

| Method | Path | |
| --- | --- | --- |
| POST | `/session` | start a session, report the browser time zone; returns the parsed `start_param` deep link and, for invites, a preview |
| GET / PATCH | `/me` | profile and settings |
| GET / POST | `/habits` | my habits (`?archived=true`) / create |
| GET / PATCH | `/habits/:id` | view / edit (owner) |
| POST | `/habits/:id/archive`, `/unarchive`, `/transfer` | owner actions |
| PATCH / DELETE | `/habits/:id/membership` | my reminder & notifications / leave |
| DELETE | `/habits/:id/members/:userId` | remove a member (owner) |
| GET | `/habits/:id/checks?from&to` | heatmap data |
| PUT / DELETE | `/habits/:id/checks/:date` | check / uncheck a day |
| GET / POST | `/invite-link`, `/invite-link/reset` | friend link |
| GET / POST | `/habits/:id/invite-link`, `/reset` | habit link (owner) |
| GET | `/invites/:token` | invite preview: who invites, which habit, what joining would do |
| POST | `/invites/:token/requests` | join: send the request (201) or report why not (200) |
| POST | `/habits/:id/invites` | invite a friend directly |
| GET | `/requests` | incoming requests |
| POST | `/requests/:id/approve`, `/decline` | answer a request |
| GET / DELETE | `/friends`, `/friends/:userId` | friends with shared-habit counts |
| GET | `/feed?before&limit` | friends' activity, cursor pagination |

## Deep links

Links into the Mini App use one format, shared by `startapp` links and the `open` query of the bot's *Open* buttons (`packages/core/src/deep-links.ts`):

| Value | Screen |
| --- | --- |
| `i_<token>` | invite preview |
| `h_<habitId>` | habit |
| `requests`, `feed`, `home` | that tab |

Invite links look like `https://t.me/<bot>?startapp=i_<token>`; they need the bot's **Main Mini App** configured in @BotFather (Bot Settings → Configure Mini App).

## Tech

TypeScript (strict), Node.js 22, [grammY](https://grammy.dev), [Hono](https://hono.dev), Zod, Vitest; React 19, Vite, Tailwind v4, Motion, TanStack Query; Yandex Cloud Functions, API Gateway, Object Storage; Cloudflare Workers.
