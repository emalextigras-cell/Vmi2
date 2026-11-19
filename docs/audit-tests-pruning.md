# Audit des tests — VMI2

Date : 18 novembre 2026
Branche de référence : `main`
Objectif : réduire les tests inutiles sans affaiblir les fonctions réellement utilisées avec la VMI Purevent Vision'R.

## Périmètre constaté

- 44 fichiers `*.test.js` dans `tests/`.
- La commande `npm test` lance les tests Node.js avec `node --test`.
- La CI vérifie aussi la syntaxe JavaScript et les types JSDoc.
- Les tests ne sont pas importés par l'application dans le navigateur : leur nombre ne ralentit donc pas directement la VMI ni le téléchargement Bluetooth. Leur coût concerne principalement la maintenance et l'exécution de la CI.

## Tests à protéger

À conserver en priorité, car ils portent sur le matériel, le protocole ou la conservation des données :

- `bluetooth-protocol.test.js` : UUID, trames de commande et CRC capturés.
- `bluetooth-decoder.test.js` : décodage des trames et offsets historiques.
- `bluetooth-history-row.test.js` et `bluetooth-history-stream.test.js` : validation et reconstitution du flux d'historique, y compris les fragments manquants ou désordonnés.
- `bluetooth-session.test.js`, `bluetooth-write-queue.test.js` et `bluetooth-intentional-sync-disconnect.test.js` : séquencement, changement de session, déconnexion volontaire et synchronisation.
- `store.test.js`, `backup.test.js`, `legacy-migration.test.js` et `migration-retry-safety.test.js` : stockage, sauvegarde, compatibilité et migrations.
- `dataio.test.js` et `dataio-csv.test.js` : import des relevés.
- `psychrometry.test.js`, `hygrometric-analysis.test.js` et `hygrometric-diagnosis.test.js` : calculs et diagnostics hygrométriques.

Ces tests ne doivent pas être supprimés au seul motif qu'ils sont techniques.

## Candidats à simplification ou regroupement

### 1. Contrats et validations transversales

`analysis-contracts.test.js` fait 847 lignes et regroupe de nombreux contrats de fonctions différentes. Il contient notamment plusieurs séries de vérifications sur les horodatages hors plage JavaScript, les doublons et les historiques volumineux.

Action recommandée : examiner les cas extrêmes répétés fonction par fonction. Ne garder qu'une protection commune lorsque le même comportement est réellement partagé ; conserver les tests propres à une fonction lorsque celle-ci a une logique différente.

### 2. Comparaisons de vitesses

Les fichiers `speed-analysis.test.js`, `speed-comparison.test.js` et `speed-time-context.test.js` couvrent des notions proches. Ils ne sont pas automatiquement redondants : certains testent les niveaux manuels, d'autres les comparaisons temporelles et les jours réellement communs.

Action recommandée : regrouper les tests par fonction publique et éliminer uniquement les assertions qui répètent exactement le même contrat.

### 3. Dates et données extrêmes

Des cas de dates impossibles ou hors plage JavaScript apparaissent dans plusieurs suites (analyse, sauvegarde, qualité, saisonnalité, diagnostic). Ils peuvent être utiles contre des fichiers corrompus ou des horloges défectueuses, mais leur répétition systématique mérite une revue.

Action recommandée : conserver un test représentatif par contrat partagé et les tests spécifiques lorsqu'une fonction doit traiter les dates indépendamment.

### 4. Analyse énergétique

Les suites `energy-climate-context`, `energy-climate`, `energy-estimate`, `energy-meter-persistence-source`, `energy-meter` et `energy-readiness` couvrent des sous-fonctions différentes. Leur proximité de thème ne prouve pas qu'elles font double emploi.

Action recommandée : vérifier les imports et les fonctions publiques testées avant toute suppression. Les tests de persistance d'index de compteurs et les calculs estimatifs ne doivent pas être confondus.

### 5. Tests structurels de l'interface

`repository-integrity.test.js` vérifie les ressources locales, les identifiants HTML, le cache du service worker et les imports. Ces contrôles peuvent éviter une page blanche ou une ressource absente ; ils sont utiles, mais doivent rester simples et ne pas figer inutilement l'organisation interne.

## Décision de nettoyage

Cette PR ne supprime aucun fichier de test. Elle retire toutefois un scénario autonome de `speed-time-context.test.js`, dont le cas est repris et renforcé dans `energy-readiness.test.js`. La première version de la PR avait aussi retiré des assertions de résultats dans deux tests de `analysis-contracts.test.js` ; cette perte de couverture a été identifiée pendant la revue et les assertions sont restaurées dans la correction.

La revue a identifié des candidats à simplification, mais les informations actuellement disponibles ne permettent pas de prouver qu'un scénario est impossible sur le matériel Purevent. Supprimer un test parce qu'il semble rare serait risqué, en particulier pour les erreurs d'horloge, les transferts interrompus et les fichiers incomplets.

La prochaine passe de nettoyage doit se faire par petits lots, avec comparaison du nombre de tests et résultat CI avant/après. Priorité proposée :

1. réduire les répétitions clairement identiques dans `analysis-contracts.test.js` ;
2. vérifier les recouvrements entre les trois suites de comparaison des vitesses ;
3. examiner les validations extrêmes de dates et de paramètres ;
4. ne toucher aux tests Bluetooth, stockage et sauvegarde qu'en présence d'un doublon démontré.

## Limites de cet audit

Cet inventaire est une revue statique des noms, imports et cas de test. Il ne constitue pas une preuve matérielle de ce que la VMI peut ou ne peut pas émettre. Les captures réelles du protocole et les fichiers réellement téléchargés restent la référence pour classer un scénario comme impossible.
