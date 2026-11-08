import { CredentialsProvider } from '@ydbjs/auth';
import { AccessTokenCredentialsProvider } from '@ydbjs/auth/access-token';
import { MetadataCredentialsProvider } from '@ydbjs/auth/metadata';
import { Driver } from '@ydbjs/core';
import { query, type QueryClient } from '@ydbjs/query';

/**
 * Connects to YDB. In Cloud Functions the function's service account token comes from the
 * metadata service; locally (scripts, tests) pass an IAM token from `yc iam create-token`.
 */
export async function connectYdb(connectionString: string, accessToken?: string): Promise<{ sql: QueryClient; close: () => void }> {
  const credentialsProvider: CredentialsProvider = accessToken
    ? new AccessTokenCredentialsProvider({ token: accessToken })
    : new MetadataCredentialsProvider({});
  const driver = new Driver(connectionString, { credentialsProvider });
  await driver.ready();
  return { sql: query(driver), close: () => driver.close() };
}
