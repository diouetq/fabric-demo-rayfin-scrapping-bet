/**
 * Applique le DAB config v7 pour relier les entités Rayfin aux tables SQL scrapping-bet.
 * Format entities-only : pas de $schema, pas de x-schema.
 *
 * Usage : node scripts/patch-dab-scrapping-bet.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SCRAPPING_BET_DAB_CONFIG } from './dab-scrapping-bet-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const cliRoot = resolve(root, 'node_modules/@microsoft/rayfin-cli/dist');
const dabPath = resolve(root, 'rayfin/.temp/dab-config.json');

writeFileSync(dabPath, JSON.stringify(SCRAPPING_BET_DAB_CONFIG, null, 2));
console.log('📋 DAB config v7 écrit (entities-only, PK=id_pari, data-source: scrapping-bet)');

const { applyConfigToServer } = await import(pathToFileURL(resolve(cliRoot, 'utils/dab-apply.js')).href);
const { getRemoteApplyConfigUrl, getRemoteAuthorizationHeader } = await import(
  pathToFileURL(resolve(cliRoot, 'utils/remote-endpoint-utils.js')).href
);

const authorizationHeader = await getRemoteAuthorizationHeader();
await applyConfigToServer(dabPath, getRemoteApplyConfigUrl(), true, authorizationHeader);
console.log('✅ Config appliqué : fait_paris + dim_* → scrapping-bet');

