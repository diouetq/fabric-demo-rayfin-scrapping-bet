import { ClientSecretCredential, DefaultAzureCredential } from '@azure/identity';

const WORKSPACE_ID = '41d4b6d3-34d9-41d3-a051-9f91192cc26a';
const LAKEHOUSE_ID = '607907de-4593-464b-b03c-caecbdb81615';
const PIPELINE_ID = 'de2cb561-7611-419e-a219-f2ba79c271ba';
const UPLOAD_PATH = 'Files/import';
const ADLS_VERSION = '2020-02-10';

async function acquireToken(scope: string): Promise<string> {
  const tenantId = process.env.SPN_TENANT_ID?.trim();
  const clientId = process.env.SPN_CLIENT_ID?.trim();
  const clientSecret = process.env.SPN_CLIENT_SECRET?.trim();

  if (tenantId && clientId && clientSecret) {
    const spn = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const token = await spn.getToken(scope);
    if (token?.token) return token.token;
  }

  const cred = new DefaultAzureCredential();
  const token = await cred.getToken(scope);
  if (token?.token) return token.token;
  throw new Error(`Impossible d’obtenir un jeton pour ${scope}`);
}

function buildOneLakeUrl(fileName: string): string {
  const encoded = fileName.split('/').map(encodeURIComponent).join('/');
  return `https://onelake.dfs.fabric.microsoft.com/${WORKSPACE_ID}/${LAKEHOUSE_ID}.Lakehouse/${UPLOAD_PATH}/${encoded}`;
}

async function adlsFetch(url: string, token: string, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'x-ms-version': ADLS_VERSION,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export async function uploadBytesToOneLake(fileName: string, data: Uint8Array): Promise<{ url: string; bytesUploaded: number }> {
  const token = await acquireToken('https://storage.azure.com/.default');
  const url = buildOneLakeUrl(fileName);
  const total = data.byteLength;

  const createRes = await adlsFetch(`${url}?resource=file`, token, {
    method: 'PUT',
    headers: { 'Content-Length': '0' },
  });
  if (!createRes.ok && createRes.status !== 201) {
    const text = await createRes.text();
    throw new Error(`OneLake create (${createRes.status}) : ${text.slice(0, 200)}`);
  }

  const chunkSize = 4 * 1024 * 1024;
  let position = 0;
  while (position < total) {
    const end = Math.min(position + chunkSize, total);
    const chunk = data.subarray(position, end);
    const appendRes = await adlsFetch(`${url}?action=append&position=${position}`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(chunk),
    });
    if (!appendRes.ok) {
      const text = await appendRes.text();
      throw new Error(`OneLake append (${appendRes.status}) : ${text.slice(0, 200)}`);
    }
    position = end;
  }

  const flushRes = await adlsFetch(`${url}?action=flush&position=${total}`, token, {
    method: 'PATCH',
    headers: { 'Content-Length': '0' },
  });
  if (!flushRes.ok) {
    const text = await flushRes.text();
    throw new Error(`OneLake flush (${flushRes.status}) : ${text.slice(0, 200)}`);
  }

  return { url, bytesUploaded: total };
}

export interface PipelineJobRow {
  id: string;
  status: string;
  startTime?: string;
  endTime?: string;
  failureReason?: string;
}

export async function listPipelineJobInstances(): Promise<PipelineJobRow[]> {
  const token = await acquireToken('https://api.fabric.microsoft.com/.default');
  const url = `https://api.fabric.microsoft.com/v1/workspaces/${WORKSPACE_ID}/items/${PIPELINE_ID}/jobs/instances`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pipeline Fabric (${res.status}) : ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    value?: Array<{
      id?: string;
      status?: string;
      startTimeUtc?: string;
      endTimeUtc?: string;
      failureReason?: { message?: string } | string;
    }>;
  };

  return (data.value ?? [])
    .filter((j) => j.id)
    .map((j) => {
      let failureReason: string | undefined;
      if (typeof j.failureReason === 'string') failureReason = j.failureReason;
      else if (j.failureReason && typeof j.failureReason === 'object') {
        failureReason = j.failureReason.message;
      }
      return {
        id: String(j.id),
        status: String(j.status ?? 'Unknown'),
        startTime: j.startTimeUtc,
        endTime: j.endTimeUtc,
        failureReason,
      };
    });
}
