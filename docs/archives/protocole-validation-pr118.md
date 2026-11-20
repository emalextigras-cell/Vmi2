# Protocole de validation matérielle — PR #118

## Objet

Vérifier sur un téléphone Android et une VMI PUREVENT que les protections Bluetooth de la PR #118 se comportent correctement. Ce protocole complète les tests automatisés ; il ne les remplace pas.

La PR #118 isole le décodage des notifications, sérialise les écritures, rattache les opérations à une session BLE et contrôle l'intégrité du flux d'historique. Elle ne modifie pas les UUID, CRC ni les trames sortantes du protocole.

## Préparation

1. Ouvrir la version de test VMI-TEST en HTTPS dans Chrome sur Android.
2. Vérifier que la bannière orange « APPLICATION DE TEST — VMI-TEST » est visible.
3. Faire une sauvegarde JSON de l'historique depuis la page principale.
4. Fermer complètement l'application VMI+ avant de connecter VMI Purevent.
5. Ouvrir « Test PR #118 » dans la navigation. Les résultats sont conservés localement sur ce téléphone.

Ne pas effectuer les essais si la VMI présente déjà un défaut ou si son état de fonctionnement n'est pas connu. Ne jamais effectuer ces essais sur une installation dont l'accès électrique ou mécanique n'est pas sûr.

## Essais à consigner

La page `validation-pr118.html` propose les mêmes essais et produit un compte rendu copiable.

| N° | Essai | Résultat attendu |
|---|---|---|
| 1 | Connexion Bluetooth | Connexion établie, sans erreur immédiate |
| 2 | Notifications en direct | Salon, sondes et état se mettent à jour en moins de 60 s |
| 3 | Déconnexion volontaire | Statut déconnecté ; les scrutations cessent |
| 4 | Reconnexion | Les mesures reviennent ; pas d'événement tardif d'une ancienne session |
| 5 | Téléchargement historique | Transfert terminé, données lisibles, aucune erreur d'intégrité |
| 6 | Deuxième synchronisation | Pas de doublons ; seules les lignes nouvelles sont ajoutées |
| 7 | Interruption volontaire du transfert (facultatif) | Transfert déclaré incomplet ; pas de fausse confirmation « à jour » ; relance possible |

L'essai 7 est facultatif. Ne le faire que si l'interruption volontaire est maîtrisée et que l'utilisateur est à l'aise. Une interruption ne doit pas être interprétée comme une panne de la VMI.

## Commandes de pilotage

Cette validation ne demande pas de modifier la vitesse, Boost ou le mode vacances. La PR #118 ne change pas les octets des commandes, mais les tests unitaires de la file d'écriture ne prouvent pas le comportement du firmware réel. Les essais de commandes doivent faire l'objet d'une validation séparée, progressive, avec observation de l'état avant/après et retour au réglage initial.

## Critères de conclusion

- **Réussi sur ce matériel** : les six essais obligatoires sont réussis et aucun message d'intégrité ou erreur Bluetooth n'est observé. L'essai d'interruption facultatif peut rester non testé.
- **À investiguer** : au moins un essai échoue, ou le transfert est marqué incomplet.
- **Non validé** : un ou plusieurs des six essais obligatoires restent non testés.

Même si tout est réussi, la conclusion ne vaut que pour ce téléphone, ce navigateur, cette VMI et cette session. Elle ne démontre pas la compatibilité avec tous les firmwares ni la fiabilité longue durée.

## Contrôles automatiques du navigateur

La page contrôle le contexte HTTPS, la présence de Web Bluetooth, la prise en charge du service worker et son contrôle effectif de la page. Elle ne peut pas lire l'état de connexion interne de la page principale : connexion, mesures, déconnexion et historique restent des essais manuels.

## Compte rendu

Dans la page « Test PR #118 », appuyer sur **Copier le compte rendu** et transmettre le texte obtenu pour analyse. Le rapport inclut le navigateur, les capacités détectées et le résultat de chaque essai. Aucun historique ni donnée hygrométrique n'est exporté par cette page.
