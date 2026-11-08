/*
 * Idempotent deploy to Yandex Cloud: creates what is missing, updates code and settings.
 * Needs a configured `yc` (run `yc init` once) and BOT_TOKEN in the root .env.
 *
 *   npm run deploy
 *
 * Layout: one API Gateway serves the Mini App from a private Object Storage bucket and routes
 * /api/* and /bot/webhook to the "habit-api" function; a timer runs "habit-tick" every minute.
 * Telegram and Russian data centres cannot reach each other, so Bot API traffic goes through a
 * Cloudflare Worker (apps/relay): Telegram → relay → /bot/webhook, functions → relay → Bot API.
 * Needs `npx wrangler login` once. Data lives as one JSON snapshot in a second private bucket (versioned, so a bad write can be
 * rolled back). `DEPLOY_STORAGE=ydb npm run deploy` switches to serverless YDB instead.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { Api } from 'grammy';
import { createSchema } from '../apps/server/src/storage/ydb';
import { connectYdb } from '../apps/server/src/storage/ydb-driver';

const ROOT = resolve(import.meta.dirname, '..');
const STATE_FILE = join(ROOT, '.data', 'deploy.json');
const NAMES = {
  serviceAccount: 'habit-tracker',
  database: 'habit-tracker',
  apiFunction: 'habit-api',
  tickFunction: 'habit-tick',
  gateway: 'habit-tracker',
  trigger: 'habit-tick-every-minute',
  /** Separate folder, so the write role covers the data bucket and nothing else. */
  dataFolder: 'habit-tracker-data',
} as const;
const STORAGE_MODE = process.env.DEPLOY_STORAGE === 'ydb' ? 'ydb' : 'object';
/**
 * Folder-level roles for the one service account used by functions, gateway and trigger.
 * The app folder only gets read access to storage; writing is granted on the data folder.
 */
const ROLES = ['storage.viewer', ...(STORAGE_MODE === 'ydb' ? ['ydb.editor'] : [])];
/** Granted per function (gateway → habit-api, timer → habit-tick), not folder-wide. */
const INVOKER_ROLE = 'functions.functionInvoker';
/** Upload (and read) objects, only in the data folder. Bucket ACLs are not available here. */
const DATA_ROLE = 'storage.uploader';
/** Old snapshot versions are kept this long for manual rollback, then deleted. */
const DATA_VERSION_DAYS = 30;
/** Hard cap on the data bucket, far above what a few users produce; stops runaway growth. */
const DATA_BUCKET_MAX_BYTES = String(512 * 1024 * 1024);
/** Serverless YDB guard rails: no provisioned (hourly billed) capacity, and a throughput cap. */
const YDB_THROTTLE_RU_PER_SECOND = '10';
const RUNTIME = 'nodejs22';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// ---------- helpers ----------

function step(title: string) {
  console.log(`\n▸ ${title}`);
}

/** Values that must never appear in output: failing commands are reported with these masked. */
const SECRETS = new Set<string>();

function redact(text: string): string {
  let result = text;
  for (const secret of SECRETS) result = result.split(secret).join('***');
  return result;
}

function run(command: string, args: string[], options: { quiet?: boolean; cwd?: string; input?: string } = {}): string {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd ?? ROOT,
      encoding: 'utf8',
      input: options.input,
      stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', options.quiet ? 'pipe' : 'inherit'],
    });
  } catch (error) {
    // execFileSync puts the whole command line (with --environment BOT_TOKEN=...) into its message.
    const stderr = redact(String((error as { stderr?: string }).stderr ?? ''));
    throw Object.assign(new Error(redact(`${command} ${args.join(' ')} failed:\n${stderr}`)), { stderr });
  }
}

function yc<T>(args: string[]): T {
  return JSON.parse(run('yc', [...args, '--format', 'json'], { quiet: true })) as T;
}

/** `get` that returns null when the resource does not exist; any other failure is thrown. */
function ycFind<T>(args: string[]): T | null {
  try {
    return yc<T>(args);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '');
    if (/not found|NotFound|NOT_FOUND/i.test(stderr)) return null;
    throw new Error(`yc ${args.join(' ')} failed:\n${stderr}`);
  }
}

function sleep(ms: number) {
  return new Promise((done) => setTimeout(done, ms));
}

const SECRET_RE = /^[A-Za-z0-9_-]{32,256}$/;

interface DeployState {
  /** Telegram sends it with every update; the cloud refuses updates without it. */
  webhookSecret: string;
  /** Path prefix for Bot API calls through the relay; keeps the relay from being an open proxy. */
  relaySecret: string;
}

/** Secrets generated once and kept in .data/deploy.json (git-ignored, mode 600); missing ones are added. */
function loadState(): DeployState {
  const saved: Partial<Record<keyof DeployState, unknown>> = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
  const secret = (key: keyof DeployState): string => {
    const value = saved[key];
    if (value === undefined) return randomBytes(32).toString('base64url');
    if (typeof value !== 'string' || !SECRET_RE.test(value)) throw new Error(`${STATE_FILE} has an invalid ${key}; remove it to generate a new one`);
    return value;
  };
  const state: DeployState = { webhookSecret: secret('webhookSecret'), relaySecret: secret('relaySecret') };
  mkdirSync(join(ROOT, '.data'), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
  chmodSync(STATE_FILE, 0o600);
  return state;
}

/** Buckets are private by default; this fails the deploy if one was ever opened by hand. */
function assertPrivateBucket(bucket: string) {
  type Flags = { read?: boolean; list?: boolean; config_read?: boolean };
  const { anonymous_access_flags: flags = {} } = yc<{ anonymous_access_flags?: Flags }>(['storage', 'bucket', 'get', bucket, '--full']);
  if (flags.read || flags.list || flags.config_read) {
    throw new Error(`bucket ${bucket} allows anonymous access; close it in the console before deploying`);
  }
}

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

// ---------- steps ----------

interface Resource {
  id: string;
}

/** `target` is e.g. ['resource-manager', 'folder'] + id, or ['serverless', 'function'] + --name. */
function grantRole(target: string[], role: string, serviceAccountId: string) {
  try {
    run('yc', [...target.slice(0, 2), 'add-access-binding', ...target.slice(2), '--role', role, '--subject', `serviceAccount:${serviceAccountId}`], { quiet: true });
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '');
    if (!/already/i.test(stderr)) throw new Error(`granting ${role} failed:\n${stderr}`);
  }
}

function ensureServiceAccount(folderId: string): Resource {
  step('Service account');
  const sa =
    ycFind<Resource>(['iam', 'service-account', 'get', '--name', NAMES.serviceAccount]) ??
    yc<Resource>(['iam', 'service-account', 'create', '--name', NAMES.serviceAccount]);
  for (const role of ROLES) grantRole(['resource-manager', 'folder', folderId], role, sa.id);
  console.log(`  ${NAMES.serviceAccount} (${sa.id}), roles: ${ROLES.join(', ')}`);
  return sa;
}

async function ensureDatabase(): Promise<string> {
  step('YDB (serverless)');
  type Db = { status: string; endpoint: string };
  let db = ycFind<Db>(['ydb', 'database', 'get', '--name', NAMES.database]);
  if (!db) {
    db = yc<Db>([
      'ydb', 'database', 'create', '--name', NAMES.database, '--serverless',
      '--sls-provisioned-rcu', '0',
      '--sls-enable-throttling-rcu=true', '--sls-throttling-rcu', YDB_THROTTLE_RU_PER_SECOND,
    ]);
  }
  for (let i = 0; db.status !== 'RUNNING' && i < 60; i++) {
    await sleep(5000);
    db = yc<Db>(['ydb', 'database', 'get', '--name', NAMES.database]);
  }
  if (db.status !== 'RUNNING') throw new Error(`database is ${db.status}, not RUNNING`);
  console.log(`  ${db.endpoint}`);

  const token = run('yc', ['iam', 'create-token'], { quiet: true }).trim();
  const ydb = await connectYdb(db.endpoint, token);
  try {
    await createSchema(ydb.sql);
  } finally {
    ydb.close();
  }
  console.log('  schema is up to date');
  return db.endpoint;
}

function ensureDataBucket(appFolderId: string, bucket: string, serviceAccountId: string): string {
  step('Data bucket (private, versioned)');
  const { cloud_id: cloudId } = yc<{ cloud_id: string }>(['resource-manager', 'folder', 'get', appFolderId]);
  const folder =
    ycFind<Resource>(['resource-manager', 'folder', 'get', '--name', NAMES.dataFolder, '--cloud-id', cloudId]) ??
    yc<Resource>(['resource-manager', 'folder', 'create', '--name', NAMES.dataFolder, '--cloud-id', cloudId]);
  grantRole(['resource-manager', 'folder', folder.id], DATA_ROLE, serviceAccountId);

  const existing = ycFind<{ folder_id: string }>(['storage', 'bucket', 'get', bucket]);
  if (!existing) yc(['storage', 'bucket', 'create', '--name', bucket, '--folder-id', folder.id]);
  else if (existing.folder_id !== folder.id) {
    throw new Error(`bucket ${bucket} is in folder ${existing.folder_id}, expected ${NAMES.dataFolder} (${folder.id}); move its data and delete it`);
  }
  yc([
    'storage', 'bucket', 'update', '--name', bucket,
    '--max-size', DATA_BUCKET_MAX_BYTES,
    '--versioning', 'versioning-enabled',
    '--lifecycle-rules', JSON.stringify({
      lifecycle_rules: [
        { id: 'expire-old-snapshots', enabled: true, filter: { prefix: '' }, noncurrent_expiration: { noncurrent_days: DATA_VERSION_DAYS } },
      ],
    }),
  ]);
  assertPrivateBucket(bucket);
  console.log(`  ${bucket} in folder ${NAMES.dataFolder}: ${DATA_ROLE} for the service account, old versions kept ${DATA_VERSION_DAYS} days`);
  return bucket;
}

function uploadWebApp(bucket: string) {
  step('Mini App → Object Storage');
  if (!ycFind<Resource>(['storage', 'bucket', 'get', bucket])) yc(['storage', 'bucket', 'create', '--name', bucket]);
  assertPrivateBucket(bucket);
  run('npm', ['run', 'build', '-w', '@habit/web']);
  const dist = join(ROOT, 'apps', 'web', 'dist');
  let count = 0;
  for (const file of walk(dist)) {
    const key = relative(dist, file).split('\\').join('/');
    const type = MIME[extname(file)] ?? 'application/octet-stream';
    // Hashed assets never change; index.html must always be fresh.
    const cache = key.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    run('yc', ['storage', 's3api', 'put-object', '--bucket', bucket, '--key', key, '--body', file, '--content-type', type, '--cache-control', cache], { quiet: true });
    count++;
  }
  console.log(`  ${count} files in ${bucket}`);
}

function ensureFunction(name: string, invokerId: string): Resource {
  const fn = ycFind<Resource>(['serverless', 'function', 'get', '--name', name]) ?? yc<Resource>(['serverless', 'function', 'create', '--name', name]);
  grantRole(['serverless', 'function', '--id', fn.id], INVOKER_ROLE, invokerId);
  return fn;
}

function gatewaySpec(apiFunctionId: string, serviceAccountId: string, bucket: string): string {
  const fn = `
      x-yc-apigateway-integration:
        type: cloud_functions
        function_id: ${apiFunctionId}
        tag: $latest
        service_account_id: ${serviceAccountId}
        payload_format_version: '1.0'`;
  const files = (object: string) => `
      x-yc-apigateway-integration:
        type: object_storage
        bucket: ${bucket}
        object: '${object}'
        error_object: index.html
        service_account_id: ${serviceAccountId}`;
  return `openapi: 3.0.0
info:
  title: habit-tracker
  version: 1.0.0
paths:
  /api/{path+}:
    x-yc-apigateway-any-method:
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string${fn}
  /bot/webhook:
    post:${fn}
  /:
    get:${files('index.html')}
  /{file+}:
    get:
      parameters:
        - name: file
          in: path
          required: true
          schema:
            type: string${files('{file}')}
`;
}

function ensureGateway(spec: string): string {
  step('API Gateway');
  const specFile = join(ROOT, 'dist', 'gateway.yaml');
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(specFile, spec);
  type Gateway = { domain: string };
  const existing = ycFind<Gateway>(['serverless', 'api-gateway', 'get', '--name', NAMES.gateway]);
  const gateway = existing
    ? yc<Gateway>(['serverless', 'api-gateway', 'update', '--name', NAMES.gateway, '--spec', specFile])
    : yc<Gateway>(['serverless', 'api-gateway', 'create', '--name', NAMES.gateway, '--spec', specFile]);
  console.log(`  https://${gateway.domain}/`);
  return `https://${gateway.domain}/`;
}

function deployFunctions(serviceAccountId: string, environment: Record<string, string>) {
  step('Cloud Functions');
  run('npm', ['run', 'build:cloud', '-w', '@habit/server']);
  const zip = join(ROOT, 'dist', 'cloud.zip');
  rmSync(zip, { force: true });
  run('zip', ['-j', '-q', zip, join(ROOT, 'dist', 'cloud', 'index.js'), join(ROOT, 'dist', 'cloud', 'package.json')]);

  for (const [key, value] of Object.entries(environment)) {
    if (value.includes(',')) throw new Error(`${key} contains a comma, which yc cannot pass`);
  }
  const env = Object.entries(environment).map(([k, v]) => `${k}=${v}`).join(',');
  const versions = [
    { name: NAMES.apiFunction, entrypoint: 'index.handler', timeout: '15s' },
    { name: NAMES.tickFunction, entrypoint: 'index.tick', timeout: '50s' },
  ];
  for (const v of versions) {
    run('yc', [
      'serverless', 'function', 'version', 'create',
      '--function-name', v.name, '--runtime', RUNTIME, '--entrypoint', v.entrypoint,
      '--memory', '256m', '--execution-timeout', v.timeout,
      '--source-path', zip, '--service-account-id', serviceAccountId, '--environment', env,
    ], { quiet: true });
    console.log(`  ${v.name}: new version`);
  }
}

function ensureTrigger(serviceAccountId: string) {
  step('Timer trigger');
  if (!ycFind<Resource>(['serverless', 'trigger', 'get', '--name', NAMES.trigger])) {
    yc([
      'serverless', 'trigger', 'create', 'timer', '--name', NAMES.trigger, '--cron-expression', '* * * * ? *',
      '--invoke-function-name', NAMES.tickFunction, '--invoke-function-service-account-id', serviceAccountId,
    ]);
  }
  console.log(`  ${NAMES.tickFunction} every minute`);
}

const RELAY_DIR = join(ROOT, 'apps', 'relay');
/** Label of the bot's menu button next to the message field. */
const MENU_BUTTON_TEXT = 'Open';

/** Deploys the Cloudflare Worker and returns its https://….workers.dev address. */
function deployRelay(originWebhookUrl: string, relaySecret: string): string {
  step('Telegram relay (Cloudflare Worker)');
  process.env.WRANGLER_SEND_METRICS ??= 'false'; // no telemetry, and no interactive prompt about it
  const output = run('npx', ['wrangler', 'deploy', '--var', `ORIGIN_WEBHOOK_URL:${originWebhookUrl}`], { cwd: RELAY_DIR, quiet: true });
  const url = output.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.workers\.dev/)?.[0];
  if (!url) throw new Error(`no workers.dev address in the wrangler output:\n${output}`);
  // Read from stdin, so the secret never shows up in the process list.
  run('npx', ['wrangler', 'secret', 'put', 'RELAY_SECRET'], { cwd: RELAY_DIR, quiet: true, input: relaySecret });
  console.log(`  ${url}`);
  return url;
}

async function configureTelegram(api: Api, webAppUrl: string, relayUrl: string, webhookSecret: string) {
  step('Telegram');
  await api.setWebhook(`${relayUrl}/webhook`, {
    secret_token: webhookSecret,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    // Keep what users sent while the webhook moved; the bot handles stale updates fine.
    drop_pending_updates: false,
  });
  await api.setChatMenuButton({ menu_button: { type: 'web_app', text: MENU_BUTTON_TEXT, web_app: { url: webAppUrl } } });
  await api.deleteMyCommands();
  await api.deleteMyCommands({ language_code: 'ru' });
  console.log('  webhook, menu button');
}

// ---------- main ----------

async function main() {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) throw new Error('BOT_TOKEN is missing in .env');
  const folderId = run('yc', ['config', 'get', 'folder-id'], { quiet: true }).trim();
  if (!folderId) throw new Error('yc has no folder; run `yc init` first');
  const state = loadState();
  SECRETS.add(botToken);
  SECRETS.add(state.webhookSecret);
  SECRETS.add(state.relaySecret);
  const api = new Api(botToken);
  const me = await api.getMe();
  console.log(`Deploying @${me.username} to folder ${folderId}`);

  const sa = ensureServiceAccount(folderId);
  const storageEnv: Record<string, string> =
    STORAGE_MODE === 'ydb'
      ? { STORAGE: 'ydb', YDB_CONNECTION: await ensureDatabase() }
      : { STORAGE: 'object', DATA_BUCKET: ensureDataBucket(folderId, `habit-tracker-data-${folderId}`, sa.id) };
  const bucket = `habit-tracker-web-${folderId}`;
  uploadWebApp(bucket);

  step('Functions');
  const apiFunction = ensureFunction(NAMES.apiFunction, sa.id);
  ensureFunction(NAMES.tickFunction, sa.id);
  const webAppUrl = ensureGateway(gatewaySpec(apiFunction.id, sa.id, bucket));
  const relayUrl = deployRelay(`${webAppUrl}bot/webhook`, state.relaySecret);

  deployFunctions(sa.id, {
    BOT_TOKEN: botToken,
    BOT_INFO: Buffer.from(JSON.stringify(me)).toString('base64'),
    WEBHOOK_SECRET: state.webhookSecret,
    WEBAPP_URL: webAppUrl,
    TELEGRAM_API_ROOT: `${relayUrl}/${state.relaySecret}`,
    ...storageEnv,
  });
  ensureTrigger(sa.id);
  await configureTelegram(api, webAppUrl, relayUrl, state.webhookSecret);

  console.log(`\n✓ Done. Mini App: ${webAppUrl}`);
  console.log('  For t.me/<bot>?startapp invite links, set this URL as the Main Mini App in @BotFather.');
}

main().catch((error) => {
  console.error(`\n✗ ${redact(error instanceof Error ? error.message : String(error))}`);
  process.exit(1);
});
