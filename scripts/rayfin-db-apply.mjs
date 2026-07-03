/**

 * Enregistre les connecteurs dans le runtime settings, puis applique le DAB config v7

 * (entities-only, sans x-schema) via patch-dab-scrapping-bet.mjs.

 *

 * NE CRÉE AUCUNE TABLE SQL — configure uniquement GraphQL/DAB vers les tables EXISTANTES

 * (fait_paris, dim_bookmaker, dim_sport, dim_type_pari, dim_resultat).

 * Ne pas lancer `rayfin up db apply`, `npm run rayfin:setup` ni `rayfin:provision-db`.

 */

import { resolve, dirname } from 'node:path';

import { fileURLToPath, pathToFileURL } from 'node:url';



const __dirname = dirname(fileURLToPath(import.meta.url));

const root = resolve(__dirname, '..');

const cliRoot = resolve(root, 'node_modules/@microsoft/rayfin-cli/dist');



const { getRemoteAuthorizationHeader, getRemoteEndpoint } = await import(

  pathToFileURL(resolve(cliRoot, 'utils/remote-endpoint-utils.js')).href

);

const { loadRayfinConfig } = await import(

  pathToFileURL(resolve(cliRoot, 'utils/config-utils.js')).href

);



const authorizationHeader = await getRemoteAuthorizationHeader();

const endpoint = getRemoteEndpoint();



console.log('🔑 Auth token: OK');

console.log('📍 Endpoint:', endpoint);



// Step 1: Register connectors in runtime settings

const config = loadRayfinConfig(root);

const payloadWithConnectors = {

  ...config.services,

  connectors: config.connectors,

};

console.log('\n⚙️  Registering connectors in runtime settings...');

const settingsRes = await fetch(`${endpoint}/__private/projectRuntimeSettings`, {

  method: 'POST',

  headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },

  body: JSON.stringify(payloadWithConnectors),

});

console.log('  Status:', settingsRes.status, settingsRes.statusText);

if (!settingsRes.ok) {

  const t = await settingsRes.text();

  throw new Error(`Runtime settings failed: ${t.slice(0, 200)}`);

}

console.log('  ✅ Connectors registered');



// Step 2: Apply v7 DAB config (entities-only, standalone — no generate/x-schema)

console.log('\n📡 Applying v7 DAB config (patch-dab-scrapping-bet)...');

const { execSync } = await import('node:child_process');

try {

  const out = execSync(`node ${JSON.stringify(resolve(root, 'scripts/patch-dab-scrapping-bet.mjs'))}`, {

    encoding: 'utf8',

    cwd: root,

    timeout: 120_000,

  });

  console.log(' ', out.trim());

} catch (e) {

  console.error('  ❌ Apply failed:', e.message?.slice(0, 400));

  console.error('  ⚠️  Ne pas lancer `rayfin up db apply` — cela créerait des tables Rayfin.');

  console.error('  Réessayez après `npx @microsoft/rayfin-cli login`.');

  process.exit(1);

}


