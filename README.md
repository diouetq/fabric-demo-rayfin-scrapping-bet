# Paris Sportif - Value Bet

> Fabric App développée avec [Rayfin](https://github.com/microsoft/rayfin) — projet vitrine testant la construction d'une application data complète (ingestion, modélisation, calculs métier, restitution) sur Microsoft Fabric, par un profil analytics (Power BI) plutôt que développement.

## Sommaire

1. [Contexte](#contexte)
2. [Architecture](#architecture)
3. [Modèle de données](#modèle-de-données)
4. [Logique métier / formules](#logique-métier--formules)
5. [Pipeline de données](#pipeline-de-données)
6. [Sécurité et accès](#sécurité-et-accès)
7. [Stack technique](#stack-technique)
8. [Tests](#tests)
9. [Démarrage local](#démarrage-local)
10. [Scripts](#scripts)
11. [Structure du projet](#structure-du-projet)
12. [Limites actuelles et roadmap](#limites-actuelles-et-roadmap)
13. [Glossaire](#glossaire)

## Contexte

Je suis spécialiste Power BI, pas développeur. Le flux ci-dessous existait déjà, géré à la main :

- scripts Python planifiés pour scraper les cotes de plusieurs bookmakers,
- un générateur de classeur Excel qui recalculait cote vraie, TRJ, Kelly et surebets à partir de ces cotes,
- un suivi de mes paris dans le même classeur.

Ce projet reproduit ce pipeline comme une vraie application (frontend, backend, base de données, auth, déploiement), construite entièrement via un assistant de code IA sur **Microsoft Fabric**, avec **Rayfin** (SDK/CLI open-source Microsoft) comme couche d'intégration. Objectif : vérifier jusqu'où un profil analytics peut aller sans écrire de code à la main — de l'ingestion à un dashboard, en passant par la modélisation et la logique métier.

## Architecture

```
┌─────────────────────┐      ┌──────────────────────────────┐      ┌─────────────────────────┐
│   APIs bookmakers    │      │        React SPA (Vite)       │      │   Microsoft Fabric       │
│  Betify · MyStake    │─────▶│  scrapers client-side          │      │                          │
│  Sportaza · Greenluck│      │  (fetch direct / proxy CORS)   │      │  ┌────────────────────┐  │
│  Slott               │      │                                │      │  │ Data API Builder    │  │
└─────────────────────┘      │  calculs Kelly/TRJ/MPTO en      │      │  │ (GraphQL sur SQL)   │  │
                              │  mémoire (betting-calculations) │◀────▶│  └──────────┬─────────┘  │
                              │                                │      │             │            │
                              │  Auth: Fabric SSO (Rayfin)      │      │  ┌──────────▼─────────┐  │
                              └──────────────────────────────┘      │  │ Entrepôt SQL          │  │
                                                                     │  │ fait_paris + dim_*    │  │
                                                                     │  └──────────────────────┘  │
                                                                     │                             │
                                                                     │  Hébergement statique        │
                                                                     │  (Fabric App via Rayfin)      │
                                                                     └─────────────────────────────┘
```

Le scraping et le calcul de value betting se font **côté client** (dans le navigateur, à la demande) — rien n'est planifié/batché côté serveur pour ces 5 bookmakers (exception : Slott, dont le scraping est aussi assuré côté serveur par une Azure Function planifiée, `scrapeAndStoreSlott`, qui écrit directement en base ; l'app lit alors ces cotes via GraphQL plutôt que de scraper en direct dans le navigateur). Seule l'écriture d'un pari (« Mes paris ») et la lecture des dimensions passent par le GraphQL/DAB de Fabric.

## Modèle de données

Modèle en étoile classique : une table de faits (`fait_paris`) et des dimensions de référence.

### `fait_paris` (table de faits)

| Colonne | Type | Description |
|---|---|---|
| `id_pari` | BIGINT IDENTITY (PK) | Généré par la base |
| `source_insertion` | varchar(20) | `Manuel` / `Scrap` / `Import` |
| `date_pari` | date | Date du pari |
| `id_bookmaker` | int (FK → dim_bookmaker) | |
| `id_sport` | int (FK → dim_sport) | |
| `libelle_competition` | varchar(150), nullable | |
| `libelle_evenement` | varchar(250) | |
| `id_type_pari` | int (FK → dim_type_pari) | |
| `cote_bookmaker` | decimal(8,4) | Cote proposée par le bookmaker |
| `mise_engagee` | decimal(10,2) | Mise en euros |
| `id_resultat` | int, nullable (FK → dim_resultat) | `NULL`/valeur "en cours" tant que non réglé |
| `cote_marche_reference` | decimal(8,4), nullable | Cote de référence marché (ex. PS3838) |
| `cote_vraie_mpto` | decimal(8,4), nullable | Cote vraie recalculée (voir formules) |
| `probabilite_implicite` | decimal(7,4), nullable | |
| `probabilite_reelle_mpto` | decimal(7,4), nullable | |
| `trj_bookmaker` | decimal(7,4), nullable | |
| `trj_ps3838` | decimal(7,4), nullable | |
| `trj_marche` | decimal(7,4), nullable | |
| `pourcentage_boost` | decimal(7,4), nullable | |
| `critere_kelly` | decimal(7,4), nullable | |
| `flag_surebet` | bit, nullable | |
| `date_heure_maj_scrap` | date, nullable | |
| `date_heure_modification` | date, nullable | |

`gain_net` est calculé côté application (pas stocké), à partir de `id_resultat` + `id_type_pari` + `cote_bookmaker` + `mise_engagee` (règles spécifiques pour les freebets, `id_type_pari = 4`).

### Dimensions

| Table | Colonnes exposées | Rôle |
|---|---|---|
| `dim_bookmaker` | `id_bookmaker`, `nom`, `type_bookmaker` | Référentiel bookmakers |
| `dim_sport` | `id_sport` (IDENTITY), `nom`, `type_sport` (CHECK : `Sports de NICHE` / `Sports MAJEURS`), `actif`, `date_creation` | Référentiel sports |
| `dim_type_pari` | `id_type_pari`, `libelle` | Type de pari (classique, boosté, freebet…) |
| `dim_resultat` | `id_resultat`, `libelle` | Gagné / perdu / remboursé / en cours |
| `dim_sport_ids_API` | `bookmaker`, `api_id` (PK composite avec `bookmaker`), `nom_api`, `id_sport` (FK → dim_sport, nullable), `actif` | **Table de mapping** — associe l'ID sport interne à l'API de chaque bookmaker (les bookmakers exposent des IDs numériques propriétaires, pas des noms) |

`dim_sport_ids_API` est la pièce la plus intéressante du modèle : `id_sport` y est volontairement nullable, pour permettre d'enregistrer un ID API rencontré au scraping avant même de savoir à quel sport il correspond. L'app referme cette boucle : quand un ID API n'a pas de mapping, le formulaire de saisie propose de le résoudre manuellement et peut écrire la ligne manquante toute seule (`upsertSportIdMapping`), voire créer un nouveau `dim_sport` à la volée si le sport n'existe pas du tout encore.

## Logique métier / formules

Toutes les formules ci-dessous sont implémentées dans `src/lib/betting-calculations.ts`, et reproduisent à l'identique les formules Excel du pipeline d'origine.

**Probabilité implicite** — à partir de la cote de référence marché `g` :
```
p_implicite = 1 / g
```

**Cote vraie MPTO** (Moyenne Pondérée Two-Outcome) — retire la marge du bookmaker de référence, répartie sur les *n* issues d'un même marché :
```
sumImplied  = Σ(1 / cote_référence_des_autres_issues_du_marché) − 1
dénominateur = n − sumImplied × g
cote_vraie   = (n × g) / dénominateur
p_réelle     = 1 / cote_vraie
```

**% Boost** — écart entre la cote proposée par le bookmaker `f` et la cote vraie :
```
boost = f / cote_vraie − 1
```

**Critère de Kelly** (fractionné, `kellyFraction` paramétrable, ex. Kelly/4) :
```
kelly = ((f − 1) × p_réelle − (1 − p_réelle)) / (f − 1) / kellyFraction
mise_suggérée = kelly × unité_stake × 100
```

**TRJ (taux de retour joueur), croisé sur une paire d'issues A/B :**
```
TRJ_marché    = 1 / (1/cote_bookmaker_A + 1/cote_référence_B)
TRJ_bookmaker = 1 / (1/cote_bookmaker_A + 1/cote_bookmaker_B)
TRJ_référence = 1 / (1/cote_référence_A + 1/cote_référence_B)
Surebet       = TRJ_marché > 1
```

**Appariement des paires (`pairKey`)** — un événement peut avoir plusieurs marchés à 2 issues (1X2, handicap, total…). Pour ne pas croiser par erreur deux lignes différentes, chaque scraper calcule une clé de paire exacte (`pairKey`, équivalent du `_MarketKey` du pipeline Excel d'origine) — par exemple `event_id|market_id|variant_key` chez Betify, ou `game_id|market_id|specifiers` chez MyStake. Le calcul de TRJ ne s'exécute que sur des groupes de **exactement 2** lignes partageant le même `pairKey`.

## Pipeline de données

1. **Scraping** (`src/lib/scrapers/*.ts`) — un scraper par bookmaker, appel direct aux APIs publiques des sites (fetch, avec proxy CORS en prod si nécessaire). Chaque ligne produite (`ScrapedOdd`) porte : bookmaker, compétition, événement, marché, cote, cutoff, `apiId` (sport), `pairKey`.
2. **Calcul** (`src/lib/betting-calculations.ts`) — regroupement par `pairKey`, application des formules ci-dessus, en mémoire, à chaque scrape.
3. **Persistance locale** (`src/lib/scrape-persistence.ts`) — cache `localStorage` (dernier scrape, historique de cotes pour détecter les variations) ; rien n'est encore écrit en base à ce stade.
4. **Écriture** — seulement quand l'utilisateur enregistre un pari depuis le formulaire : mutation GraphQL `createFaitPari` / `updateFaitPari` vers l'entrepôt Fabric.
5. **Lecture** — page KPI et grille "Mes paris" : lecture GraphQL paginée de `fait_paris`, jointure côté client avec les dimensions (déjà chargées et cachées en mémoire par `useDimensions`).

## Sécurité et accès

- **Authentification** : Fabric SSO (`@microsoft/rayfin-auth-provider-fabric`), accès sur invitation au workspace Fabric (voir écran de connexion de l'app).
- **Autorisations GraphQL** (Data API Builder, `scripts/dab-scrapping-bet-config.mjs`), par entité et par rôle `authenticated` :

| Entité | Actions autorisées |
|---|---|
| `FaitPari` | create, read, update, delete |
| `DimSportIdsAPI` | create, read, update |
| `DimBookmaker`, `DimSport`, `DimTypePari`, `DimResultat` | read |
| `SlottCote`, `SlottJob` | read |

Pas de règle de sécurité au niveau ligne (RLS) au-delà du rôle `authenticated` — cohérent avec un usage mono-utilisateur/démo, à revoir si l'app devait un jour être multi-utilisateurs.

- **Secrets** : `rayfin/.env*`, `rayfin/.deployments.json`, `rayfin/functions/local.settings.json` sont exclus du dépôt (`.gitignore`) — générés localement par `rayfin env --framework vite` à partir de `rayfin/rayfin.yml`.

## Stack technique

- [Vite](https://vitejs.dev/) + [React 19](https://react.dev/) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com/)
- [Rayfin](https://github.com/microsoft/rayfin) — auth Fabric SSO, client GraphQL, déploiement Fabric App
- Microsoft Fabric : entrepôt SQL + Data API Builder (GraphQL) + Azure Function (`scrapeAndStoreSlott`) pour l'ingestion planifiée Slott
- [Vitest](https://vitest.dev/) + Testing Library pour les tests

## Tests

- `src/lib/betting-calculations.spec.ts` — vérifie les formules Kelly/TRJ/surebet sur des cas connus.
- `src/App.spec.tsx` — rendu de l'app / navigation entre pages.
- Pas de tests end-to-end automatisés à ce jour (Playwright est présent en tooling de dev — `npm run test:fabric` — mais pour ouvrir le portail Fabric en local, pas pour du test automatisé de non-régression).

## Démarrage local

```bash
npm install
npm run dev
```

`predev`/`prebuild` exécutent `rayfin env --framework vite`, qui génère `.env.local` depuis `rayfin/rayfin.yml` (workspace/item Fabric).

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de dev Vite |
| `npm run build` | Build de production |
| `npm run test` / `test:watch` | Tests Vitest |
| `npm run lint` | ESLint |
| `npm run rayfin:deploy` | Build + déploiement Fabric App |
| `npm run rayfin:db` | Enregistre le connecteur + applique la config DAB |
| `npm run rayfin:db-slott` | Applique uniquement les permissions DAB par entité |
| `npm run rayfin:diag-bdd` | Diagnostic app → DAB → entrepôt SQL |
| `npm run rayfin:slott-store` | Invoque manuellement l'Azure Function de scraping Slott |
| `npm run test:fabric` | Ouvre le portail Fabric embed via Playwright (dev local) |

## Structure du projet

```
src/
  components/   composants UI (tableaux de cotes, formulaire, panneaux, dictionnaire des données…)
  pages/        Cotes en direct, Mes paris, KPI
  lib/          calculs Kelly/TRJ, scrapers par bookmaker, formatage, persistance locale
  services/     accès aux données (paris, dimensions) via GraphQL Rayfin
  hooks/        auth, dimensions, redimensionnement…
rayfin/
  rayfin.yml    config du projet (id, workspace/item Fabric, auth, hébergement statique)
  data/         entités Rayfin (@entity) mappées sur les tables SQL
  functions/    Azure Function TypeScript (import de paris)
  functions-python/  Azure Function Python (scrapeAndStoreSlott)
scripts/        config DAB, diagnostic, déploiement
```

## Limites actuelles et roadmap

- **KPI/dashboard** : fonctionnel (ROI, bankroll, répartitions, filtres période) mais pas encore assez poussé pour juger s'il rivalise avec un vrai rapport Power BI sur ce cas d'usage — question ouverte que ce projet doit m'aider à trancher.
- **Pas de CI/CD** : lint/tests/déploiement sont lancés manuellement (`npm run lint`, `npm run test`, `npm run rayfin:deploy`) — pas de pipeline GitHub Actions à ce jour.
- **Scraping non planifié** (sauf Slott) : les cotes ne sont récupérées qu'à la demande, pas de batch automatique périodique pour les 4 autres bookmakers.
- **Couverture des marchés** : uniquement les marchés à 2 issues (contrainte volontaire, pour garder les formules TRJ/Kelly simples et fiables).
- **Mono-environnement** : un seul workspace Fabric (pas de séparation dev/prod formelle).
- Projet personnel/démo — pas d'engagement de support.

## Glossaire

- **TRJ** (Taux de Retour Joueur) : part théorique des mises reversée aux parieurs sur un marché ; un TRJ > 100 % croisé entre 2 bookmakers signale un surebet.
- **MPTO** (Moyenne Pondérée Two-Outcome) : méthode de recalcul de la cote "vraie" d'un marché à 2 issues, en retirant la marge du bookmaker de référence.
- **Surebet** : combinaison de mises sur les 2 issues d'un même événement, chez 2 bookmakers différents, garantissant un gain quelle que soit l'issue.
- **Critère de Kelly** : formule de dimensionnement optimal de la mise, en fonction de l'écart entre cote proposée et probabilité réelle estimée.
- **PairKey** : identifiant technique reliant les 2 issues d'un même marché, pour un appariement fiable des calculs croisés (TRJ, surebet).

## Auteur

Quentin DIOUET — [LinkedIn](https://www.linkedin.com/in/quentin-diouet/) · [Portfolio](https://diouetq.github.io/portfolio/)
