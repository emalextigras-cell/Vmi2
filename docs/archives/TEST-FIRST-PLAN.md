# Stratégie de sécurisation et de refactorisation test-first

## Objectif

Faire évoluer VMI2 sans régression. Toute simplification d'un module complexe doit être précédée par des tests qui décrivent son comportement actuel attendu. Les changements sont ensuite réalisés en petites étapes, chacune validée avant la suivante.

## État initial constaté

- Le dépôt possède déjà une suite de tests Node.js dans `tests/`.
- Le projet est en modules ES (`type: module`) et utilise le runner natif `node:test`.
- La commande `npm test` vérifie la syntaxe de `js/app.js` et de `js/modules/chart-renderer.js`, puis exécute `node --test`.
- Le workflow GitHub Actions vérifie la syntaxe des fichiers JavaScript, exécute `npm test` et contrôle les types JSDoc avec TypeScript.
- Les tests existants couvrent notamment le Bluetooth, les écritures BLE, les imports CSV/JSON, les sauvegardes, les migrations, la qualité des données, la psychrométrie, l'analyse hygrométrique, les vitesses manuelles, l'énergie et les diagnostics.

## Ordre de travail et priorités

| Priorité | Domaine / modules | Tests existants à prendre comme référence | Travail préalable |
| --- | --- | --- | --- |
| P0 | Protocole et écritures Bluetooth : `bluetooth-protocol.js`, `bluetooth-write-queue.js`, `bluetooth-session.js`, `bluetooth-history-stream.js` | `bluetooth-protocol.test.js`, `bluetooth-write-queue.test.js`, `bluetooth-session.test.js`, `bluetooth-history-stream.test.js`, `bluetooth-decoder.test.js` | Renforcer les cas limites et les changements de session avant toute modification. Ne pas modifier les commandes, trames, UUID ou temporisations sans preuve et tests dédiés. |
| P0 | Analyse hygrométrique et vitesses : `analysis.js` | `hygrometric-analysis.test.js`, `speed-analysis.test.js`, `speed-comparison.test.js`, `speed-time-context.test.js`, `temporal-analysis.test.js` | Cartographier les fonctions exportées et vérifier que chacune des fonctions critiques possède des cas représentatifs. |
| P1 | Import/export et sauvegardes : `dataio.js`, `backup.js`, `legacy-migration.js` | `dataio.test.js`, `dataio-csv.test.js`, `backup.test.js`, `legacy-migration.test.js`, `migration-retry-safety.test.js` | Consolider les cas de fichiers incomplets, données anciennes, doublons et restauration sans perte. |
| P1 | Diagnostics : `weekly-diagnostic.js`, `diagnostic-confidence.js`, `assistant-summary.js`, `seasonal-advice.js` | `weekly-diagnostic.test.js`, `diagnostic-confidence.test.js`, `hygrometric-diagnosis.test.js`, `assistant-summary.test.js`, `seasonal-advice.test.js` | Vérifier les données insuffisantes, les résultats incertains et l'absence de recommandations excessives. |
| P1 | Énergie : `energy-meter.js`, `energy-estimate.js`, `energy-climate.js` | `energy-meter.test.js`, `energy-meter-persistence-source.test.js`, `energy-estimate.test.js`, `energy-climate.test.js`, `energy-climate-context.test.js`, `energy-readiness.test.js` | Figer les unités, hypothèses, périodes et états de disponibilité avant simplification. |
| P2 | Interface et orchestration : `app.js`, `chart-renderer.js`, `assistant-renderer.js` | `assistant-renderer.test.js`, `chart-data-quality.test.js`, `interface-reference.test.js`, `repository-integrity.test.js` | Ajouter des tests ciblés avant toute extraction de logique ou migration de composants DOM. |

Cette matrice est un point de départ fondé sur les fichiers de tests présents. Elle ne prétend pas que chaque fonction de chaque module est déjà couverte.

## Règle obligatoire pour chaque micro-itération

1. Identifier une seule fonction ou un seul comportement à simplifier.
2. Lire le code et le test existant correspondant.
3. Ajouter ou renforcer d'abord le test qui décrit le comportement attendu, y compris les cas limites et les entrées invalides utiles.
4. Exécuter le test ciblé et vérifier qu'il valide bien le comportement de référence.
5. Effectuer le plus petit changement possible, sans changement fonctionnel implicite.
6. Relancer le test ciblé, puis la suite complète avec `npm test`.
7. Vérifier la syntaxe et les contrôles CI. Ne poursuivre que si tout est vert.
8. Conserver une modification isolée et explicable ; en cas d'échec, corriger ou revenir en arrière avant toute étape suivante.

## Interprétation des seuils hygrométriques

- Le seuil par défaut de 1 g/m³ pour l'écart d'humidité absolue salon − air entrant est un paramètre heuristique de classement. Il ne constitue ni une norme, ni une limite physique validée pour les capteurs installés.
- La règle de dominance à 60 % sert uniquement à classer une situation comme majoritaire dans les intervalles observés. Elle ne représente pas une durée minimale d'assèchement et ne prouve pas l'efficacité réelle du renouvellement d'air.
- Ces paramètres ne doivent pas être recalibrés à partir d'un seul export discontinu. Une calibration pertinente exige des capteurs identifiés avec leur précision, des mesures simultanées contrôlées et un historique représentatif de plusieurs saisons.
- Les analyses de sensibilité doivent montrer comment le résultat évolue lorsque le seuil varie, sans présenter le seuil qui produit le résultat le plus favorable comme le meilleur seuil physique.
- Le potentiel hygrométrique doit rester distinct de l'évolution réellement mesurée de l'humidité absolue intérieure. Le débit réellement renouvelé et les échanges avec les parois ne sont pas déduits de ces seuls capteurs.

## Garde-fous VMI

- Les vitesses 1, 2 et 3 restent des réglages manuels ; aucune automatisation de commande n'est introduite par cette refactorisation.
- Le protocole BLE, les UUID, les octets des trames, le CRC, l'ordre des écritures et les temporisations sont considérés comme sensibles.
- Les données historiques et les sauvegardes ne doivent jamais être supprimées, réécrites ou migrées sans tests de non-régression.
- Une modification de l'interface ne doit pas modifier les calculs métier ni la communication Bluetooth.
- Les Web Components et le Shadow DOM ne sont pas un objectif de cette première phase : ils seront évalués séparément, après sécurisation des comportements.

## Validation

La validation locale de référence est :

```sh
npm test
```

Le workflow GitHub Actions effectue en complément la vérification syntaxique de tous les fichiers JavaScript et le contrôle JSDoc/TypeScript. La refactorisation n'est considérée comme validée que lorsque les contrôles correspondants sont réussis sur GitHub Actions.
