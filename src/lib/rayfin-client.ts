import { RayfinClient } from '@microsoft/rayfin-client';
import type { ApiClient } from '@microsoft/rayfin-lib';
import type { AppSchema } from '../../rayfin/data/schema';
import type { AppFunctionsSchema } from '@/types/rayfin-functions';

let _client: RayfinClient<AppSchema, AppFunctionsSchema> | undefined;

export function getRayfinApiClient(): ApiClient {
  const client = getRayfinClient() as RayfinClient<AppSchema, AppFunctionsSchema> & {
    apiClient: ApiClient;
  };
  return client.apiClient;
}

export function getRayfinClient(): RayfinClient<AppSchema, AppFunctionsSchema> {
  if (!_client) {
    const apiUrl = import.meta.env.VITE_RAYFIN_API_URL;
    const publishableKey = import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY;

    if (!apiUrl || !publishableKey) {
      throw new Error(`Missing required env vars for creating rayfin client - run 'npx rayfin up'`);
    }

    _client = new RayfinClient<AppSchema, AppFunctionsSchema>({
      baseUrl: apiUrl,
      publishableKey,
      authStorage: true,
      useProxy: false,
    });
  }

  return _client;
}
