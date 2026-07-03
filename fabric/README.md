# fabric/

Dossier synchronisé automatiquement par l'**intégration Git native de Microsoft Fabric** (Workspace Settings → Git integration) — à ne pas confondre avec `rayfin/`, qui gère le déploiement de l'app elle-même via le CLI Rayfin. Ici, ce sont les *items* du workspace Fabric (rapports, pipelines, base de données...) qui sont sérialisés en fichiers texte/JSON pour être suivis par git.

**Ne pas éditer ces fichiers à la main** : le contenu est géré depuis le portail Fabric (bouton *Commit* pour pousser vers git, *Update* pour rapatrier depuis git). Toute modification manuelle ici serait écrasée ou créerait un conflit au prochain sync.

## Items synchronisés (9)

### `Scrapping_Bet/` — infrastructure active de l'app

| Item | Type | Rôle |
|---|---|---|
| `rayfindb.SQLDatabase` | SQL Database | La base SQL de l'app (« SQL Database for Rayfin application ») — contient `fait_paris` et les tables `dim_*` documentées dans le README principal, exposées à l'app via Data API Builder/GraphQL. |
| `lh_paris.Lakehouse` | Lakehouse | Lakehouse associé, probablement utilisé comme zone de dépôt/staging en amont de la base SQL. |
| `fc_scrapping-bet.UserDataFunction` | User Data Function | Fonctions serveur exposées au workspace — notamment `scrapeAndStoreSlott`, invoquée par `npm run rayfin:slott-store` (`scripts/invoke-slott-store.mjs`) et lue par l'app via `slott-store-service.ts`. |
| `pl_scrapping-slott.DataPipeline` | Data Pipeline | Orchestration planifiée du scraping Slott côté serveur (complète le scraping client-side des 4 autres bookmakers, voir README principal § Pipeline de données). |
| `pl_import_paris.DataPipeline` | Data Pipeline | Pipeline d'import de paris. |
| `df_import_paris.Dataflow` | Dataflow | Transformation (Power Query) associée à l'import de paris. |
| `reflex_import_paris.Reflex` | Reflex (Data Activator) | « Reflex Project created from Trigger Pane » — alerte/déclencheur temps réel lié à l'import de paris. |

⚠️ **À vérifier** : `pl_import_paris`, `df_import_paris` et `reflex_import_paris` semblent correspondre à l'ancienne fonctionnalité *« Import Excel → OneLake »* de l'app, dont le code React (`ParisExcelImportPanel` et les fichiers `lib/` associés) a été supprimé lors du nettoyage du repo — remplacé par la saisie directe via le formulaire/GraphQL. Ces 3 items côté Fabric sont peut-être devenus orphelins eux aussi (plus rien ne les déclenche depuis l'app) — à confirmer avant de les désactiver/supprimer du workspace si c'est bien le cas.

### `Old/` — legacy Power BI (avant l'app)

| Item | Type | Rôle |
|---|---|---|
| `MonSuiviPariSportif.Report` | Report | Le rapport Power BI d'origine pour le suivi des paris — précède cette app. |
| `MonSuiviPariSportif.SemanticModel` | Semantic Model | Le modèle sémantique associé à ce rapport. |

C'est littéralement le prédécesseur de la page **KPI** de l'app : le rapport Power BI que le suivi des paris utilisait avant ce projet. Directement lié à la question ouverte du README principal (*« la partie KPI/dashboard rivalise-t-elle avec Power BI sur ce cas d'usage ? »*) — c'est ici la référence de comparaison.

## Différence avec `rayfin/`

| | `rayfin/` | `fabric/` |
|---|---|---|
| Géré par | CLI Rayfin (`npm run rayfin:*`) | Portail Fabric (Git integration) |
| Contient | Config du projet Rayfin, entités `@entity`, Azure Functions | Sérialisation des items du workspace (rapports, pipelines, bases...) |
| Modifié comment | En local, par le code | Depuis le portail Fabric (*Commit* / *Update*) |
