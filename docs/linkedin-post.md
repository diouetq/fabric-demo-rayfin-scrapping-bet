Je ne suis pas développeur. Je suis spécialiste Power BI.

Pendant des mois, j'ai géré tout mon suivi de value betting à la main dans Excel : des scripts Python pour scraper les cotes de plusieurs bookmakers, un générateur de classeur pour calculer cote vraie, TRJ, Kelly, surebets.

Je me suis posé une question : est-ce que je peux transformer tout ça en vraie application web — sans écrire une ligne de code moi-même ?

J'ai testé Rayfin, le SDK/CLI open-source de Microsoft pour construire des applications d'entreprise sur Microsoft Fabric, couplé à un assistant de code IA (Claude Code) pour tout piloter à la conversation.

Résultat : une app qui scrape en direct les cotes de plusieurs bookmakers, recalcule automatiquement les mêmes indicateurs qu'avant dans Excel, enregistre tout dans un entrepôt SQL Fabric, et centralise le suivi de mes paris avec des KPI.

Ce qui me marque le plus : je n'ai jamais eu besoin d'ouvrir un IDE pour comprendre ce qui se passait. Frontend, backend, base de données, authentification, déploiement — tout est passé par la conversation avec l'IA, appuyée sur l'infrastructure Fabric.

Ça ouvre, je crois, pas mal de possibilités pour les profils non-développeurs comme le mien : on peut aujourd'hui construire des applications complètes — jusqu'au dashboard — sans être ingénieur logiciel.

Honnêtement, je n'ai pas encore assez poussé la partie dashboard/KPI de l'app pour savoir si elle peut rivaliser avec un vrai rapport Power BI sur ce cas d'usage précis. C'est une des prochaines choses que je veux creuser.

Ce projet reste une vitrine, pas un produit — mais si vous êtes vous-même côté Power BI/Excel et curieux de ce que l'IA + Fabric peuvent débloquer sans passer par le développement classique, je serais curieux d'échanger.

#MicrosoftFabric #Rayfin #PowerBI #IA #NoCode
