import { GraphQLClient } from '@microsoft/rayfin-data';
import { getRayfinClient } from './rayfin-client';

/**
 * Returns a GraphQLClient backed by the Rayfin client's internal ApiClient.
 * Auth headers (Bearer token) and automatic token refresh on 401 are handled
 * transparently by the underlying ApiClient — no manual token management needed.
 */
function getGraphQLClient(): GraphQLClient {
  const client = getRayfinClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiClient = (client as any).apiClient;
  return new GraphQLClient(apiClient, '/graphql');
}

/**
 * Executes a raw GraphQL mutation via the Rayfin GraphQL endpoint.
 * Use this as a workaround when the Rayfin data SDK generates mutations
 * referencing field names that don't exist on the DAB-generated schema
 * (e.g. `id` instead of the actual PK column `id_pari`).
 */
export async function executeMutation<T = unknown>(
  mutation: string,
  variables: Record<string, unknown>
): Promise<T> {
  return getGraphQLClient().mutation<T>(mutation, variables);
}

export async function executeQuery<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  return getGraphQLClient().query<T>(query, variables);
}
