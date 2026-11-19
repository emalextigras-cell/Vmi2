# VMI Purevent — Vmi2

Application web progressive de **supervision, d'analyse et d'aide à la compréhension d'une VMI Purevent**. Le dépôt `Vmi2` est un environnement de travail et de validation indépendant du dépôt historique `Vmi`.

> **Attention — environnement de test :** l'interface affiche volontairement une bannière « APPLICATION DE TEST — VMI-TEST ». Ne considère pas cette copie comme une version de production validée tant que les essais sur la VMI réelle n'ont pas été effectués.

## Sommaire

- [Objectif](#objectif)
- [Fonctionnalités](#fonctionnalités)
- [Démarrage et déploiement](#démarrage-et-déploiement)
- [Utilisation avec la VMI](#utilisation-avec-la-vmi)
- [Architecture du dépôt](#architecture-du-dépôt)
- [Données et méthodes d'analyse](#données-et-méthodes-danalyse)
- [Sécurité et limites connues](#sécurité-et-limites-connues)
- [Tests et validation](#tests-et-validation)
- [Documentation complémentaire](#documentation-complémentaire)

## Objectif

Vmi2 rassemble les fonctions nécessaires pour consulter les données de la VMI, conserver son historique, analyser les conditions hygrométriques et thermiques, comparer des périodes de fonctionnement et suivre des index électriques saisis depuis des compteurs externes.

L'application fonctionne dans le navigateur. Les analyses sont réalisées localement à partir des données disponibles ; aucune API distante n'est nécessaire pour le moteur de diagnostic.

## Fonctionnalités

- **Connexion Bluetooth LE** à la VMI : lecture de l'état, des capteurs et téléchargement de l'historique.
- **Historique et données en direct** : affichage séparé des relevés historiques et des relevés captés pendant une connexion.
- **Import VMI+** : CSV lu par le parseur natif ; XLS et XLSX lus avec SheetJS. Le premier import Excel nécessite une connexion internet pour charger la bibliothèque depuis un CDN.
- **Graphiques et qualité des données** : visualisation, contrôle des valeurs et de la couverture temporelle.
- **Analyses hygrométriques** : humidité absolue, point de rosée calculé, évolution dans le temps et comparaison entre salon et air entrant.
- **Comparaisons de fonctionnement** : profils descriptifs par mode manuel déclaré et comparaison de périodes lorsque les données sont suffisantes.
- **Assistant intelligent local** : synthèse des analyses, explication des constats, de leur niveau de confiance et de leurs limites.
- **Suivi électrique** : le module de saisie et de calcul des index externes en kWh est présent, mais son formulaire est actuellement masqué dans l'interface ; cette fonction n'est donc pas accessible normalement depuis l'application.
- **Sauvegarde et restauration** : export JSON des données locales et restauration d'une sauvegarde.
- **Application installable (PWA)** : manifeste et service worker pour l'utilisation depuis un navigateur compatible.

## Démarrage et déploiement

### Déploiement GitHub Pages

1. Ouvrir **Settings → Pages** dans le dépôt GitHub.
2. Choisir la branche `main` et le dossier `/(root)`.
3. Enregistrer et attendre la publication.
4. Ouvrir l'adresse HTTPS publiée dans un navigateur compatible.

Pour utiliser le Bluetooth sur Android, ouvrir l'application dans **Chrome** via HTTPS. Le support Web Bluetooth dépend du navigateur et de l'appareil.

### Exécution locale pour le développement

Le dépôt utilise des modules JavaScript natifs et ne nécessite pas de compilation front-end.

- Installer Node.js 22 (version utilisée par la CI).
- Servir le dossier à l'aide d'un serveur HTTP local ; ne pas ouvrir simplement `index.html` en `file://` si l'on veut tester les fonctions navigateur. Aucun `npm install` n'est requis pour les tests Node actuels.
- Pour les essais Bluetooth, utiliser un contexte sécurisé compatible (HTTPS ou localhost) et un navigateur prenant en charge Web Bluetooth.

Commande de tests :

```bash
npm test
```

## Utilisation avec la VMI

1. Fermer l'application **VMI+** avant de connecter Vmi2 : la VMI ne gère pas deux connexions simultanées.
2. Depuis Vmi2, lancer la connexion Bluetooth et sélectionner la VMI.
3. Vérifier l'état et les mesures reçues.
4. Télécharger l'historique depuis la VMI ou importer un export VMI+.
5. Consulter les graphiques, les analyses et l'assistant.
6. Avant toute utilisation durable, vérifier les commandes manuelles et les résultats directement sur l'appareil.

La connexion Bluetooth est facultative pour consulter et analyser un historique déjà importé. Les analyses s'appuient sur l'historique VMI+ ou téléchargé depuis la VMI, et non sur le seul flux de données en direct.

## Architecture du dépôt

Le point d'entrée de l'application est `index.html`, qui charge les styles, le manifeste et `js/app.js`.

| Chemin | Responsabilité |
|---|---|
| `index.html` | Structure de l'interface et panneaux de l'application |
| `css/style.css` | Styles, thèmes et présentation mobile |
| `js/app.js` | Orchestration, événements, connexion, stockage et rendu de l'application |
| `js/modules/core.js` et `date-utils.js` | Fonctions communes, dates et formatage |
| `js/modules/ble.js` et `sync.js` | Paramètres BLE historiques et gestion des délais de téléchargement |
| `js/modules/bluetooth-protocol.js` | UUID, CRC et construction des commandes/trames BLE |
| `js/modules/bluetooth-decoder.js` | Décodage des notifications Bluetooth |
| `js/modules/bluetooth-write-queue.js` | Sérialisation des écritures Bluetooth |
| `js/modules/bluetooth-session.js` | Contrôle du cycle de vie des séquences BLE |
| `js/modules/bluetooth-history-stream.js` et `bluetooth-history-row.js` | Réassemblage, validation et contrôle des fragments/lignes d'historique |
| `js/modules/bluetooth-autoconnect.js` | Sélection prudente d'un appareil déjà autorisé par le navigateur |
| `js/modules/clock-correction.js` | Correction des horodatages de l'historique |
| `js/modules/psychrometry.js` | Calculs psychrométriques |
| `js/modules/analysis.js` | Analyses, statistiques et comparaisons |
| `js/modules/weekly-diagnostic.js` | Analyse des tendances sur plusieurs jours |
| `js/modules/data-quality.js` | Plausibilité, complétude et anomalies des mesures |
| `js/modules/diagnostic-confidence.js` et `live-freshness.js` | Confiance des constats et fraîcheur des flux en direct |
| `js/modules/seasonal-advice.js` | Conseils saisonniers à partir des données disponibles |
| `js/modules/history-selection.js` | Sélection des périodes affichées sans modifier l'historique source |
| `js/modules/assistant-summary.js` et `assistant-renderer.js` | Synthèse et affichage de l'assistant local |
| `js/modules/dataio.js` | Import et conversion des données |
| `js/modules/history.js` et `legacy-migration.js` | Traitement et migration des historiques |
| `js/modules/store.js` | Persistance IndexedDB |
| `js/modules/backup.js` | Création et fusion des sauvegardes |
| `js/modules/chart-renderer.js` et `charts.js` | Graphiques et préparation des séries |
| `js/modules/energy-meter.js`, `energy-estimate.js` et `energy-climate.js` | Index externes, estimation ventilateur et rapprochements énergie/climat |
| `js/modules/weekly-diagnostic.js` | Comparaison hygrométrique de fenêtres hebdomadaires |
| `js/modules/energy-*.js` | Estimations indicatives, contexte climatique et suivi par compteurs |
| `js/types/` et `jsconfig.json` | Types JSDoc et vérification statique |
| `sw.js` et `manifest.json` | Cache applicatif et installation PWA |
| `tests/` | Tests automatisés et page de validation manuelle |

## Données et méthodes d'analyse

### Stockage et séparation des sources

Les données sont conservées dans IndexedDB sur l'appareil. Cette copie de test utilise volontairement la base `VMI_PUREVENT_DB_TEST`, distincte de la base historique `VMI_PUREVENT_DB`. Elle ne réalise aucune migration automatique de la base de production.

Les relevés en direct et l'historique sont conservés séparément. Les analyses et comparaisons reposent sur l'historique importé ou téléchargé. Une absence de relevés en direct ne signifie donc pas que la VMI est arrêtée ou en panne.

### Interprétation des données VMI+

- Le champ `Debit` de l'export VMI+ correspond au débit d'air en **m³/h**.
- Le régime moteur est exprimé en **tr/min** lorsqu'il est disponible.
- Les comparaisons des niveaux manuels utilisent uniquement le champ `Mode` (`vmiModeRaw`) lorsqu'il est présent. Les champs `Vitesse`, `vit` et `vmiSpeedRaw` ne sont pas utilisés comme substituts.
- PWM, `Cons DP`, `Pression Moteur` et plusieurs champs `Cons...` restent des valeurs brutes lorsque leur signification ou leur unité n'est pas confirmée.
- L'application distingue les valeurs mesurées, les données brutes et les estimations calculées.

### Assistant et diagnostic

L'« Assistant intelligent VMI » est un moteur local à règles explicables. Il reformule et hiérarchise les résultats calculés par les modules ; ce n'est pas un modèle génératif ni un système d'apprentissage automatique.

Les constats sont accompagnés de leurs critères et de leurs limites. Les comparaisons horaires et temporelles nécessitent une couverture suffisante ; elles restent descriptives et ne neutralisent pas automatiquement la météo, l'occupation, les apports d'humidité ou les changements de réglage.

### Suivi énergétique

Le module sait calculer une énergie consommée entre deux index successifs saisis depuis un compteur externe. Cette valeur provient du compteur, pas de la VMI. **Attention : le formulaire de saisie est actuellement placé dans un conteneur HTML masqué** ; la fonction est conservée dans le code et les sauvegardes, mais n'est pas proposée dans l'interface visible.

La courbe de puissance du ventilateur utilisée par le module d'estimation est une estimation par interpolation issue de la documentation référencée dans l'interface. Elle ne constitue ni une mesure électrique ni une mesure de consommation réelle. Aucun champ brut non documenté (PWM, Cons DP, compteurs internes, etc.) n'est converti arbitrairement en W, kWh ou Pa.

## Sécurité et limites connues

- Les changements de vitesse, le Boost et le mode vacances restent des **commandes manuelles**.
- Aucun pilotage automatique par IA n'est activé. L'assistant ne commande jamais la VMI et ne choisit pas une vitesse optimale.
- Les commandes Bluetooth sont envoyées séquentiellement ; le logiciel vérifie la session et les retours disponibles. Les tests logiciels ne remplacent pas une vérification matérielle.
- Les indicateurs hygrométriques sont des aides à l'analyse. Le point de rosée de l'air n'est pas une température de paroi et ne suffit pas à conclure à un risque de condensation.
- Une corrélation entre variables ne démontre ni une relation causale, ni une panne, ni l'efficacité de la ventilation.
- Le devis de l'installation indique un caisson Purevent Vision'R, un débit maximal annoncé de 350 m³/h, une puissance moteur maximale annoncée de 169 W et un chauffage électrique maximal annoncé de 1 800 W. Ce sont des caractéristiques documentaires, pas des mesures réelles de fonctionnement.
- La base de données de test et le cache du service worker sont isolés de l'application historique ; ne pas supprimer cette séparation sans procédure de migration et de validation dédiée.

## Tests et validation

### Tests automatisés

La commande `npm test` vérifie la syntaxe de certains points d'entrée puis exécute les tests Node.js.

La CI GitHub Actions effectue en complément :
- la vérification syntaxique de tous les fichiers JavaScript sous `js/` et `tests/` ;
- l'exécution de `npm test` ;
- le contrôle JSDoc/TypeScript avec `tsc --noEmit -p jsconfig.json`.

### Essais matériels indispensables

Avant de considérer une évolution comme validée sur la VMI réelle, contrôler au minimum :

1. Connexion et déconnexion Bluetooth.
2. Lecture de l'état et des capteurs.
3. Téléchargement complet de l'historique, y compris le comportement en cas d'interruption.
4. Import d'un CSV et d'un fichier Excel VMI+.
5. Cohérence des graphiques et des analyses.
6. Export CSV, sauvegarde JSON et restauration.
7. Commandes manuelles, une par une, avec vérification de leur effet réel sur la VMI.

Une CI verte confirme les contrôles automatisés ; elle ne certifie pas le fonctionnement sur le matériel.

## Documentation complémentaire

- [Comprendre le fonctionnement de la VMI Purevent Vision'R](docs/comprendre-la-vmi.md) — matériel, données disponibles, interprétations et inconnues.
- [Référence matérielle Purevent Vision'R](docs/reference-materiel-purevent-vision-r.md) — caractéristiques explicitement documentées.
- [Audit de la capture Bluetooth](docs/audit-bluetooth-capture.md) — observations issues de la capture HCI et limites de preuve.
- [Maintenance sans changement fonctionnel](docs/maintenance-sans-changement-fonctionnel.md) — périmètre autorisé et contrôles de maintenance.
- [Protocole de validation matérielle](docs/protocole-validation-pr118.md) — procédure d'essais sur l'appareil.
- [Stratégie de sécurisation test-first](docs/TEST-FIRST-PLAN.md) — priorités et garde-fous de développement.
- [Audit de simplification des tests](docs/audit-tests-pruning.md) — décisions de conservation et de regroupement des tests.

---

**État du projet :** Vmi2 est une copie de travail expérimentale. Toute modification du protocole Bluetooth, du stockage ou des commandes doit être revue et validée séparément avant d'être considérée comme sûre pour un usage quotidien.
