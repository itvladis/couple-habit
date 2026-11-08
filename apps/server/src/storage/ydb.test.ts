import { describeStoreContract } from '@habit/core/store-contract';
import { afterAll, beforeAll, describe } from 'vitest';
import { connectYdb } from './ydb-driver';
import { createSchema, dropSchema, YdbStore } from './ydb';

/*
 * Runs the shared Store contract against a real YDB when one is configured:
 *   YDB_TEST_CONNECTION=grpcs://ydb.serverless.yandexcloud.net:2135/ru-central1/... \
 *   YDB_TEST_TOKEN=$(yc iam create-token) npm test
 * Tables get a unique prefix and are dropped afterwards.
 */
const connection = process.env.YDB_TEST_CONNECTION;
const token = process.env.YDB_TEST_TOKEN;

// Network round trips to a serverless database take far longer than unit tests.
describe.skipIf(!connection || !token)('YdbStore against a real database', { timeout: 60_000 }, () => {
  const prefix = `test_${Date.now()}_`;
  let ydb: Awaited<ReturnType<typeof connectYdb>>;

  beforeAll(async () => {
    ydb = await connectYdb(connection!, token);
    await createSchema(ydb.sql, prefix);
  }, 120_000);

  afterAll(async () => {
    await dropSchema(ydb.sql, prefix);
    ydb.close();
  }, 120_000);

  describeStoreContract('YdbStore', async () => new YdbStore(ydb.sql, prefix));
});
