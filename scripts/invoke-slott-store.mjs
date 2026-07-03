/**
 * Appelé par le frontend via un endpoint proxy local (ou manuellement).
 * Appelle scrapeAndStoreSlott sur fc_scrapping-bet via SPN.
 *
 * Usage : node scripts/invoke-slott-store.mjs [regionId1 regionId2 ...]
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv(...paths) {
  const out = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return out;
}

const env = loadEnv(resolve(root, 'rayfin/.env'), resolve(root, 'rayfin/.env.spn'));

const TENANT_ID = env.SPN_TENANT_ID || env.RAYFIN_PUBLIC_TENANT_ID;
const CLIENT_ID = env.SPN_CLIENT_ID;
const CLIENT_SECRET = env.SPN_CLIENT_SECRET;
const UDF_URL =
  env.RAYFIN_PUBLIC_FABRIC_UDF_URL_SCRAPE_SLOTT ||
  env.FABRIC_UDF_URL_SCRAPE_SLOTT ||
  'https://41d4b6d334d941d3a0519f91192cc26a.z41.userdatafunctions.fabric.microsoft.com/v1/workspaces/41d4b6d3-34d9-41d3-a051-9f91192cc26a/userDataFunctions/efe61443-6183-4a14-9ca9-31c6d4bdbbbf/functions/scrapeAndStoreSlott/invoke';

if (!TENANT_ID || !CLIENT_ID || !CLIENT_SECRET) {
  console.error('Manquant : SPN_TENANT_ID, SPN_CLIENT_ID, SPN_CLIENT_SECRET dans rayfin/.env.spn');
  process.exit(1);
}

const regionIds = process.argv.slice(2).length ? process.argv.slice(2) : ['1970324836974625'];
const regionIdsParam = regionIds.length === 1 ? regionIds[0] : JSON.stringify(regionIds);

// Acquiert un token SPN
const tokenRes = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'https://analysis.windows.net/powerbi/api/.default',
      grant_type: 'client_credentials',
    }),
  }
);
if (!tokenRes.ok) {
  console.error('SPN token HTTP', tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const { access_token } = await tokenRes.json();
console.log('✔ Token SPN acquis');

// Appelle scrapeAndStoreSlott
const udfUrl = UDF_URL.replace('/scrapeSlott/', '/scrapeAndStoreSlott/');
console.log('→ Appel', udfUrl);
const res = await fetch(udfUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({ regionIds: regionIdsParam }),
});

const body = await res.text();
console.log(`HTTP ${res.status}:`, body.slice(0, 500));
if (!res.ok) process.exit(1);
