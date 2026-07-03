//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption } from "vite";
import license from "rollup-plugin-license";

import { resolve } from 'path';

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// Dev-only middleware: makes the local Vite server compatible with browsers that
// enforce Local Network Access (LNA) checks when a public origin (the Fabric portal)
// embeds an iframe pointing at http://localhost. Sets the LNA opt-in response header
// on every response and short-circuits the corresponding preflight OPTIONS request.
// This is required for fetch/XHR subresources from the embedded app — top-level
// iframe navigations additionally require launching Chromium with the
// `--disable-features=...LocalNetworkAccessChecks` flag (see .playwright-config.json).
const localNetworkAccessPlugin: PluginOption = {
  name: 'local-network-access-headers',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network']) {
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
        res.statusCode = 204;
        res.end();
        return;
      }
      next();
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        localNetworkAccessPlugin,
    ],
    resolve: {
        alias: {
            '@': resolve(projectRoot, 'src'),
        }
    },
    server: {
        proxy: {
            '/api/sportaza': {
                target: 'https://sb2frontend-altenar2.biahosted.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/sportaza/, '/api/widget'),
            },
            '/api/greenluck': {
                target: 'https://pre-161o-sp.sbx.bet',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/greenluck/, '/cache/161/fr/li'),
            },
            '/api/betify': {
                target: 'https://api-a-c7818b61-600.sptpub.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/betify/, '/api/v4/prematch/brand'),
            },
            '/api/betify-v3': {
                target: 'https://api-a-c7818b61-600.sptpub.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/betify-v3/, '/api/v3/descriptions/brand'),
            },
            '/api/mystake-pm': {
                target: 'https://analytics-sp.googleserv.tech',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/mystake-pm/, '/api/prematch'),
            },
            '/api/mystake': {
                target: 'https://analytics-sp.googleserv.tech',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/mystake/, '/api/sport'),
            },
            '/api/slott': {
                target: 'https://slott-france.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/slott/, '/api-2/betline'),
            },
            '/api/pinnacle': {
                target: 'https://guest.api.arcadia.pinnacle.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api\/pinnacle/, '/0.1'),
                headers: {
                    Origin: 'https://www.pinnacle.com',
                    Referer: 'https://www.pinnacle.com/fr/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                },
            },
        },
    },
    build: {
        commonjsOptions: {
            include: [/node_modules/],
        },
        rollupOptions: {
            plugins: [
                license({
                    thirdParty: {
                        multipleVersions: true,
                        output: {
                            file: resolve(projectRoot, 'dist', 'THIRD_PARTY_NOTICES.txt'),
                            template(dependencies) {
                                if (dependencies.length === 0) {
                                    return 'No third-party dependencies.';
                                }
                                return (
                                    'This file was auto-generated at build time.\n\n' +
                                    dependencies
                                        .map((dep) => {
                                            const lines = [
                                                `${dep.name}@${dep.version}`,
                                                `License: ${dep.license || 'UNKNOWN'}`,
                                            ];
                                            if (dep.author) {
                                                lines.push(`Author: ${typeof dep.author === 'string' ? dep.author : dep.author.text()}`);
                                            }
                                            if (dep.noticeText) {
                                                lines.push('', 'NOTICE:', dep.noticeText.trim());
                                            }
                                            if (dep.licenseText) {
                                                lines.push('', dep.licenseText.trim());
                                            }
                                            return lines.join('\n');
                                        })
                                        .join('\n\n' + '='.repeat(60) + '\n\n')
                                );
                            },
                        },
                    },
                }),
            ],
        },
    },
});
