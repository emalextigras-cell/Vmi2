## Maintenance — sécurité du chargement et qualité du code
- SheetJS 0.18.5 reste chargé à la demande depuis cdnjs, mais son chargement dynamique vérifie désormais une empreinte SRI SHA-384 et utilise CORS anonyme ; le CDN de secours non vérifié est retiré.
- La CSP conserve `default-src 'self'` et n'autorise plus le CDN jsDelivr inutilisé.
- ESLint contrôle maintenant les variables et imports inutilisés, interdit `var` et les conditions constantes.
- Suppression de l'adaptateur local `pruneHist`, inutilisé ; la fonction pure `pruneHistory` reste disponible et testée dans son module.
- Les erreurs de sauvegarde en direct, de préférences de thème et d'enregistrement du service worker ne sont plus avalées silencieusement.
- Cache du service worker porté à `vmi-test-v14-cache-85`.

## Nettoyage — suppression du suivi par compteur électrique externe
- Suppression de la saisie et de l'analyse d'index de compteurs externes, qui ne correspond pas à l'installation VMI.
- Retrait du stockage dédié, de sa fusion dans les sauvegardes, de l'analyseur, des tests et de son entrée dans le précache.
- Les sauvegardes anciennes contenant `energyReadings` restent importables : ce champ obsolète est simplement ignoré.
- Conservation de l'estimation énergétique du ventilateur à partir du débit VMI+ et de la courbe constructeur, ainsi que du rapprochement descriptif avec les données hygrométriques.
- Cache du service worker porté à `vmi-test-v14-cache-84`.

## Sécurité — commandes avancées non validées
- Désactivation visible et verrouillage à l’exécution de toutes les écritures des réglages avancés Purevent (surventilation, limite estivale, débit fixe, consigne et marche du préchauffage).
- Les commandes manuelles classiques (vitesse, Boost, vacances), la lecture d’état et les analyses restent disponibles.
- Les références publiques ne sont pas considérées comme une preuve de compatibilité avec cette VMI. Réactivation conditionnée à une capture VMI+ officielle de chaque action et à une revue des trames.
- Aucun essai matériel ni envoi de commande à la VMI n’a été réalisé.
- CSP complétée avec `default-src 'self'` et directives de ressources explicites.
- Cache du service worker porté à `vmi-test-v14-cache-83`.

## Correctif CI — moteur hygrométrique
- Restauration de l'import local de `median` et des validateurs utilisés par `summarizeTemperatureLimit`, resté dans `analysis.js`.
- Restauration du formateur de durée `fmtHours` dans le module hygrométrique après extraction.
- Cache du service worker porté à `vmi-test-v14-cache-82`.

## Refactor — extraction du moteur hygrométrique
- Extraction des analyses de périodes, tendances journalières, profils horaires, variations rapides et diagnostic hygrométrique vers `hygrometric-analysis.js`.
- Conservation des exports historiques depuis `analysis.js` pour préserver les imports existants.
- Les calculs psychrométriques, contrôles de qualité et statistiques restent délégués à leurs modules dédiés.
- Ajout de tests de compatibilité des exports et de non-mutation des relevés sources.
- Module ajouté au précache du service worker ; cache porté à `vmi-test-v14-cache-82`.

## Refactor — moteur d'analyse des modes et périodes
- Extraction des comparaisons de vitesses manuelles, du contexte horaire et des comparaisons de périodes dans `operating-analysis.js`.
- Extraction de la médiane commune dans `statistics.js`.
- Conservation des exports historiques de `analysis.js` pour ne pas casser les imports existants.
- Aucun seuil, calcul métier, diagnostic ni commande Bluetooth modifié.
- Tests de compatibilité des exports et du calcul de médiane ajoutés.

# Journal des modifications

## [Non publié]

### Modularisation des rendus énergétiques et hebdomadaires
- Extraction des rendus de l’estimation énergétique ventilateur, du rapprochement énergie/climat journalier et du diagnostic hebdomadaire dans `energy-analysis-renderer.js`.
- Injection explicite des conteneurs, fonctions de calcul et formatteurs ; les règles métier et les calculs restent dans leurs modules dédiés.
- Ajout de tests ciblés et incrément du cache du service worker.

### Modularisation des renderers de recommandations
- Extraction du rendu de fraîcheur de l'historique, des conseils saisonniers et de la recommandation hygrométrique dans `history-advice-renderer.js`.
- Les fonctions de rendu reçoivent explicitement leurs données, éléments DOM et dépendances métier ; aucun état applicatif n'est stocké dans le nouveau module.
- Ajout de tests ciblés et incrément du cache du service worker.

### Fiabilité de la synchronisation historique
- La tolérance de 30 secondes du téléchargement Bluetooth est désormais appliquée jusqu'à la fusion des relevés ; les imports ordinaires conservent le filtrage strict.
- L'historique et les métadonnées de fin de synchronisation sont enregistrés dans une transaction IndexedDB unique. Une erreur de stockage empêche la validation de la synchronisation et ne met pas à jour `lastSync`.
- Ajout de tests couvrant le relevé à +6 s, le rejet à +60 s, le comportement strict par défaut et l'échec de persistance.
- Cache du service worker incrémenté à `vmi-test-v14-cache-79` et ajout du nouveau module au shell hors ligne.

Ce fichier conserve les évolutions fonctionnelles et techniques de **VMI Purevent (dépôt Vmi2)**.

Les numéros de version de l'interface et du cache du service worker sont deux identifiants distincts :
- version affichée dans `index.html` (actuellement **v14**) ;
- nom du cache dans `sw.js` (actuellement **vmi-test-v14-cache-83**).

Ils ne sont pas générés automatiquement. La convention de mise à jour est décrite à la fin de ce fichier.

## [v14] — État du dépôt au 20 novembre 2026

### Fonctionnalités et interface
- Extraction du runtime Bluetooth dans un module dédié, sans changement volontaire du protocole de communication.
- Amélioration de l'accessibilité de la navigation et ajout d'un tableau de valeurs pour les graphiques.
- Regroupement des outils secondaires dans une section « Avancé » et clarification de l'accès à la connexion Bluetooth.
- Ajout d'un assistant local qui présente les résultats d'analyse et leurs limites.

### Fiabilité et sécurité
- Gestion et contextualisation des erreurs de persistance.
- Sécurisation de l'affichage du rapport énergétique en évitant l'injection de contenu HTML non fiable.
- Ajout d'une politique CSP et déplacement du script de navigation vers un module JavaScript externe.
- Restriction du cache du service worker à la liste explicite des ressources de l'application ; les pages de test et les URL avec paramètres ne sont pas mises en cache.

### Performance et qualité des analyses
- Optimisation du diagnostic hygrométrique sur les historiques volumineux, avec réutilisation des données préparées.
- Réduction des allocations et des parcours répétés lors du résumé des intervalles exclus.
- Mise en cache de résultats de diagnostic lorsque l'historique de référence n'a pas changé.
- Ajout d'un test de non-régression vérifiant le seuil RH par défaut de détection des variations rapides : 14 points ne déclenchent pas l'événement, 16 points le déclenchent pour un seuil de 15.

### Maintenance et tests
- Ajout de contrôles TypeScript/JSDoc et amélioration de la vérification syntaxique dans la CI.
- Mise à jour de l'environnement CI et de la version Node documentée.
- Ajout de tests sur les points d'entrée graphiques et météo, ainsi que sur les chemins normal et erreur de l'adaptateur de l'assistant.
- Les tests automatisés vérifient le code ; ils ne remplacent pas les essais sur la VMI réelle.

### Repères de changements fusionnés
- PR #41 à #49 : modularisation Bluetooth, persistance, sécurité du rendu, outillage et CI, accessibilité, optimisation hygrométrique et optimisation de l'assistant.
- PR #52 et #53 : CSP, module de navigation et liste d'autorisation du cache.
- PR #54 : optimisation du traitement des intervalles hygrométriques exclus.
- PR #55 : test aux bornes du seuil RH par défaut.
- PR #56 : tests des points d'entrée graphiques/météo et de l'adaptateur de l'assistant.

Les PR #50 et #51 étaient des essais temporaires de benchmark abandonnés ; elles ne font pas partie de l'état livré.

## Convention pour les prochaines évolutions

Pour chaque évolution fusionnée :

1. Ajouter une entrée dans la section `[Non publié]` en précisant la date, le changement et, si utile, le numéro de PR.
2. Lorsqu'une nouvelle version de l'application est décidée, créer une section `[vN]` et y regrouper les changements correspondants.
3. Mettre à jour ensemble les deux mentions de version visibles dans `index.html` (badge d'en-tête et pied de page).
4. Incrémenter le suffixe du cache dans `sw.js` lorsqu'une modification du shell applicatif doit provoquer un nouveau cache. Ne pas confondre ce compteur technique avec le numéro de version fonctionnelle.
5. Ne jamais incrémenter la version ou le cache uniquement pour une modification documentaire qui n'affecte pas les ressources mises en cache.

Une entrée de changelog décrit ce qui a réellement été fusionné. Elle ne signifie pas qu'une évolution a été validée sur le matériel : les essais physiques restent à consigner séparément lorsqu'ils ont été réalisés.
