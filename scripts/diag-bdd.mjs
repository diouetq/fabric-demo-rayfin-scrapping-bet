/**
 * Diagnostic BDD — teste chaque maillon entre l'app et dbo.fait_paris / dim_*.
 *
 * Usage :
 *   cd C:\Users\dioue\App_1
 *   npx @microsoft/rayfin-cli login
 *   npm run rayfin:diag-bdd
 *
 * Copiez-collez toute la sortie dans le chat.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cliRoot = resolve(root, 'node_modules/@microsoft/rayfin-cli/dist');

const envText = readFileSync(resolve(root, 'rayfin/.env'), 'utf8');
const env = Object.fromEntries(
  envText.split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);

const WS = '41d4b6d3-34d9-41d3-a051-9f91192cc26a';
const SQL_DB_ID = '4423190a-684f-4cf0-91bc-89fe9fabeb67';
const APP_BACKEND_ID = env.RAYFIN_PUBLIC_ITEM_ID ?? 'bbbffb72-cc07-41d0-8122-252c0eca41e2';
const BaaS_API_URL = env.RAYFIN_PUBLIC_API_URL ?? '';
const PK = env.RAYFIN_PUBLIC_PUBLISHABLE_KEY ?? '';
const GQL_BaaS = `${BaaS_API_URL.replace(/\/$/, '')}/graphql`;

const { getRemoteAuthorizationHeader, getRemoteEndpoint } = await import(
  pathToFileURL(resolve(cliRoot, 'utils/remote-endpoint-utils.js')).href
);

const hostingUrl =
  readFileSync(resolve(root, 'rayfin/.deployments.json'), 'utf8').match(/hostingUrl": "(.*?)"/)?.[1] ?? '?';

console.log('═══════════════════════════════════════════════════════════');
console.log('  DIAG BDD — Scrapping_Bet');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('📌 DEUX OBJETS FABRIC (même nom possible, IDs différents)\n');
console.log('  A) App Backend « scrapping-bet » (Rayfin, GraphQL, app web)');
console.log('     ID  :', APP_BACKEND_ID);
console.log('     URL :', `https://app.fabric.microsoft.com/groups/${WS}/appbackends/${APP_BACKEND_ID}`);
console.log('');
console.log('  B) SQL Database (tables fait_paris, dim_*)');
console.log('     ID  :', SQL_DB_ID);
console.log('     URL :', `https://app.fabric.microsoft.com/groups/${WS}/sqldatabases/${SQL_DB_ID}`);
console.log('');
console.log('  Lien entre A et B : connecteur Rayfin `scrapping-bet` (rayfin/rayfin.yml)');
console.log('  App hébergée      :', hostingUrl);
console.log('');

let authHeader;
let controlPlane;
try {
  authHeader = await getRemoteAuthorizationHeader();
  controlPlane = getRemoteEndpoint();
  console.log('✅ 1. Auth CLI Rayfin — token obtenu');
  console.log('     Control-plane   :', controlPlane, '\n');
} catch (e) {
  console.log('❌ 1. Auth CLI — lancez : npx @microsoft/rayfin-cli login');
  console.log('    ', e.message?.slice(0, 200));
  process.exit(1);
}

// 2. Control plane (CLI token — ce que rayfin:db utilise)
console.log('2. Control-plane (npm run rayfin:db utilise cette API)');
try {
  const r = await fetch(`${controlPlane}/__private/projectRuntimeSettings`, {
    method: 'GET',
    headers: { Authorization: authHeader },
  });
  console.log(`   GET runtimeSettings — HTTP ${r.status}`, r.ok ? '✅' : '❌');
  if (!r.ok) console.log('   ', (await r.text()).slice(0, 300));
} catch (e) {
  console.log('   ❌', e.message);
}

// Vérifie que le connecteur scrapping-bet est enregistré
try {
  const r = await fetch(`${controlPlane}/__private/projectRuntimeSettings`, {
    method: 'GET',
    headers: { Authorization: authHeader },
  });
  if (r.ok) {
    const settings = await r.json();
    const connectors = settings?.connectors ?? settings?.data?.connectors;
    const hasConnector = connectors && 'scrapping-bet' in connectors;
    console.log('   Connecteur scrapping-bet enregistré :', hasConnector ? '✅ oui' : '❌ non → npm run rayfin:db');
  }
} catch { /* ignore */ }
console.log('');

// 3. GraphQL data-plane avec token CLI (souvent 401 — normal)
console.log('3. GraphQL data-plane (token CLI — 401 attendu, PAS un bug app)');
console.log('   L\'app dans Fabric utilise une session Rayfin (SSO iframe), pas ce token.');
const ping = await fetch(GQL_BaaS, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Publishable-Key': PK, Authorization: authHeader },
  body: JSON.stringify({ query: '{ __typename }' }),
});
const pingText = await ping.text();
console.log(`   HTTP ${ping.status}`, ping.status === 401 ? '(normal depuis le CLI)' : '');
if (ping.status !== 401) console.log('   ', pingText.slice(0, 200));
console.log('');

console.log('═══════════════════════════════════════════════════════════');
console.log('  PROCHAINES ÉTAPES (dans l\'ordre)');
console.log('═══════════════════════════════════════════════════════════');
console.log(`
  1. npm run rayfin:db
     → mappe GraphQL vers dbo.fait_paris / dim_* (ne crée PAS de tables)
     → collez la sortie si ❌ Apply failed (HTTP 500)

  2. npm run rayfin:deploy

  3. Ouvrez l'app DEPUIS le portail Fabric (App Backend scrapping-bet → Open)
     PAS seulement l'URL able-blaze… dans un onglet nu

  4. Mes paris → F12 → Console : copiez l'erreur rouge exacte
`);

console.log('📋 Vérif SQL (portail Fabric → SQL Database → Query) :');
console.log('   SELECT TOP 3 id_bookmaker, nom FROM dbo.dim_bookmaker;');
console.log('   SELECT TOP 3 id_pari, libelle_evenement FROM dbo.fait_paris;\n');
