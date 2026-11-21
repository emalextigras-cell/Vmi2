# Journal d'audit — références publiques VMI / Purevent

> **Document de continuité pour les prochaines sessions de travail.**  
> Dernière mise à jour : 21 novembre 2026.  
> Périmètre de ce document : dépôts publics externes transmis par l'utilisateur. Ce document ne remplace pas l'audit des dépôts personnels et ne constitue pas une autorisation de modifier ou piloter la VMI.

## 1. Dépôts publics de référence

| Dépôt | Rôle | Pertinence pour la Purevent |
|---|---|---|
| [clemvillon/ha-vmi-purevent](https://github.com/clemvillon/ha-vmi-purevent) | Intégration Home Assistant dédiée à la Purevent | **Référence prioritaire** : son protocole indique des vérifications sur Purevent logiciel 6.4.002 et une capture du 04/10/2026. |
| [srThibaultP/ha-vmi-plus](https://github.com/srThibaultP/ha-vmi-plus) | Documentation et intégration VMI+ générique | Référence utile pour les fonctions et registres génériques ; documentation annoncée comme testée sur Urban, donc transposition à la Purevent à confirmer. |
| [srThibaultP/vmi-plus-ble](https://github.com/srThibaultP/vmi-plus-ble) | Bibliothèque Python de protocole et client BLE | Référence utile pour le décodage générique, les capteurs, le bypass, les programmes horaires et le client asynchrone. |

## 2. Constats techniques vérifiés dans les sources

### 2.1 Protocole Purevent — `ha-vmi-purevent`

Fichier principal : [protocol.py](https://github.com/clemvillon/ha-vmi-purevent/blob/main/custom_components/vmi_plus/protocol.py)  
Cycle BLE : [device.py](https://github.com/clemvillon/ha-vmi-purevent/blob/main/custom_components/vmi_plus/device.py)  
Constantes : [const.py](https://github.com/clemvillon/ha-vmi-purevent/blob/main/custom_components/vmi_plus/const.py)

- L'en-tête de trame est `A5 B6`. Le format documenté est `A5 B6 | type | 06 | longueur | données | somme`.
- Types reçus explicitement traités : état `0x01`, télécommande `0x02`, sondes filaires `0x03`, accusé `0x23`.
- Registres de lecture : `0x03` état, `0x06` télécommande, `0x07` sondes.
- Commandes documentées dans le module : surventilation `0x0B`, limite été `0x17`, vitesse `0x18`, boost `0x19`, vacances `0x1A`, débit fixe `0x1B`, consigne préchauffage `0x1C`, marche préchauffage `0x2F`.
- Les offsets de l'état incluent notamment : volume à 22 (2 octets LE), jours de fonctionnement à 26, jours filtre à 28, surventilation à 33 (logique inversée), vitesse à 34, consigne préchauffage à 35, limite été à 38, vacances à 43, boost à 44, débit fixe à 45, renouvellement à 47 (2 octets LE), préchauffage actif à 53.
- Les sondes filaires sont décodées à partir des positions 6 (température 1), 8 (humidité 1) et 11 (température 2). La télécommande utilise les positions 11 (température) et 13 (humidité).
- Le débit théorique est calculé à partir du renouvellement et du volume de la maison ; ce n'est pas une mesure directe de débit d'air.

**Contrôle d'intégrité — distinguer les sens de transmission.**
- Pour les trames sortantes, Purevent calcule le XOR de tout le corps après l'en-tête, jusqu'au dernier des octets annoncés.
- Pour les trames entrantes, `somme_recue()` calcule le XOR du type jusqu'à l'avant-dernier octet de données annoncées : le dernier octet de données est exclu, puis la somme est lue juste après.
- Cette différence de plage est explicitement documentée dans `protocol.py`. L'auteur précise que le dernier octet de données est presque toujours nul dans ses captures, ce qui masquait la différence.
- La formule du dépôt VMI+ générique (CRC-8, polynôme 0x01, init 0, XOR final 0x13, calcul sur la trame complète sans l'octet de somme) n'est pas un algorithme distinct dans ce cas : le polynôme 0x01 ramène le calcul au XOR des octets, et `0xA5 XOR 0xB6 = 0x13`. Le XOR final annule donc le XOR de l'en-tête et donne le même résultat que le XOR Purevent du corps sortant.
- Le parseur générique `parse_frame()` de `vmi-plus-ble` ne vérifie toutefois pas le CRC dans ce chemin de décodage.
- Le décodeur Purevent vérifie l'en-tête, la longueur annoncée et la somme avant de traiter une notification ; les octets de padding ATT après la trame utile ne font pas partie du calcul.

**Températures négatives : non résolu.**
- Purevent utilise `octet - 256` pour les octets signés.
- Le commentaire du code précise que cette interprétation sous 0 °C est une hypothèse, jamais observée par l'auteur.
- Ne pas considérer ce point comme validé.

### 2.2 Connexion, fraîcheur et commandes — Purevent

Dans `device.py` :
- Les échanges sont sérialisés par un verrou.
- Une requête attend une notification du type prévu.
- Les attentes en cours sont abandonnées si la liaison tombe.
- Après chaque nouvelle connexion, les filtres sont remis à zéro et les horodatages de réception `_recu_le` sont effacés : une donnée n'est donc pas considérée fraîche sur la nouvelle session avant réception d'une trame.
- La fraîcheur de connexion dépend d'une trame d'état récente, pas uniquement de l'état GATT.
- Le code traite le cache GATT périmé : en cas de caractéristique introuvable, il efface le cache et ferme la liaison pour permettre une nouvelle tentative.
- Une commande de réglage n'est considérée réussie que lorsque la trame d'état confirme la valeur demandée. Pour les commandes à bascule, le code peut relire l'état avant d'envoyer afin d'éviter une inversion involontaire.
- L'horloge est synchronisée après connexion et lors d'un changement de décalage horaire ; l'échec de cette synchronisation n'interrompt pas le relevé.

Constantes Purevent observées dans `const.py` :
- Relevé : 10 s ; attente de réponse : 5 s ; connexion : 30 s ; fraîcheur : 35 s ; fermeture : 10 s.
- Filtre de saut : seuil de 10 °C et 30 points d'humidité ; trois mesures hors plage successives avant de rendre la valeur inconnue.

### 2.3 Filtre anti-sauts — Purevent

Le `FiltreDeSaut` :
- conserve une valeur précédente ;
- met en attente un candidat qui s'écarte trop ;
- n'accepte ce candidat que si la mesure suivante le confirme ;
- au démarrage ou après reconnexion, demande aussi confirmation de la première valeur ;
- conserve temporairement la valeur précédente lors d'une mesure hors plage, puis la rend inconnue après le nombre maximal de rejets.

Le dépôt donne comme exemple une lecture isolée à 0 °C entre deux relevés à 25 °C. C'est un exemple de défaut ponctuel, pas une preuve que les seuils proposés conviennent à tous les capteurs.

### 2.4 Protocole générique — `ha-vmi-plus`

Documentation : [PROTOCOL.md](https://github.com/srThibaultP/ha-vmi-plus/blob/main/PROTOCOL.md)  
README : [README.md](https://github.com/srThibaultP/ha-vmi-plus/blob/main/README.md)

- La documentation décrit le protocole VMI+/VMCI et précise que les vérifications matérielles principales ont été faites sur une unité Urban. Les éléments non marqués comme vérifiés proviennent du code de l'application.
- La VMI accepte un seul central BLE simultanément ; pendant une connexion, l'unité cesse d'annoncer sa présence.
- La documentation décrit un CRC-8 : polynôme 0x01, initialisation 0, XOR final 0x13, calculé sur les octets avant le CRC.
- Les commandes sont des trames de classe `0x10`, avec le registre et la valeur dans le payload.
- Le protocole générique décrit davantage de fonctions que l'intégration Purevent : bypass, programmation hebdomadaire, paramètres GTC/Modbus, capteurs sans fil, période de mesure des capteurs, etc.
- Les capacités décrites dans ce dépôt ne doivent pas être présumées disponibles sur la Purevent sans confirmation par trame ou essai encadré.

### 2.5 Bibliothèque générique — `vmi-plus-ble`

Protocole : [protocol.py](https://github.com/srThibaultP/vmi-plus-ble/blob/main/src/vmi_plus_ble/protocol.py)  
Client BLE : [client.py](https://github.com/srThibaultP/vmi-plus-ble/blob/main/src/vmi_plus_ble/client.py)

- Le module de protocole définit le CRC-8 générique et les classes de trames.
- Il décode les états, sondes, capteurs sans fil, programmes horaires, bypass et GTC/Modbus.
- Le décodeur générique interprète les températures signées avec `value - 0xFF` à partir de 0x80. C'est différent de Purevent (`value - 256`) ; les deux dépôts signalent donc une divergence.
- L'état générique expose notamment le statut d'auto-test et quatre octets de détails (positions 10 à 14), version logicielle, type de préchauffage, bypass, volume, jours de fonctionnement, filtre, vitesse, consigne, débit et autres états.
- Le client BLE utilise un verrou, des waiters par classe de réponse, et résout les requêtes de lecture à réception de la classe attendue.
- Les écritures de réglage simples passent par `write_gatt_char(..., response=True)` ; dans le client, cela confirme la réponse GATT, mais ne réalise pas à lui seul une relecture de l'état métier après chaque écriture.
- Le chemin `parse_frame()` visible dans le code vérifie l'en-tête et les longueurs minimales par type, mais n'appelle pas de vérification du CRC dans ce parseur. À garder en tête lors de la comparaison avec la validation stricte de Purevent.

## 3. Comparaison avec les observations Bluetooth de l'utilisateur

Fichier analysé : `btsnoop_hci.log` fourni dans la conversation.

Constats déjà relevés lors de l'analyse de cette capture :
- 1 892 notifications ATT ont été reconstituées ; 1 880 portent une trame d'historique `0x30` de 116 octets utiles dans une valeur ATT de 182 octets.
- Sur ces 1 880 trames `0x30`, 1 870 passent la somme entrante Purevent et 10 sont invalides. Le dernier octet de données annoncé (index 114 dans la trame) vaut zéro sur les 1 880 trames : la capture seule ne permet donc pas de distinguer l'ancienne plage XOR de la plage Purevent documentée.
- Les séquences observées vont de 0 à 399. Les séquences 0 à 24 sont des blocs de métadonnées à un fragment ; les séquences 25 à 399 correspondent à 375 lignes de données attendues sur cinq fragments (indices 0, 10, 20, 30, 40). 356 lignes sont complètes et 19 incomplètes ; 20 positions de fragments sont absentes sur 17 séquences, auxquelles s'ajoutent 10 fragments reçus mais invalides par leur somme.
- 43 requêtes ATT d'écriture ont été observées : 39 trames protocole sur le handle de commande (handle ATT 0x0013) et 4 écritures CCCD (deux sur 0x000F, deux sur 0x0015). Les 39 trames protocole comprennent 38 commandes de classe `0x10` et une mise à l'heure `0x1A`. Les commandes `0x10` observées portent les registres `0x03` (12 fois), `0x06` (12), `0x07` (11), `0x2C`, `0x20` et `0x22` (une fois chacun).
- Les 39 trames sortantes passent le XOR Purevent. Elles passent aussi la formule CRC-8 générique, ce qui est attendu puisque les deux formules sont algébriquement équivalentes sur la trame sortante décrite ci-dessus ; la capture ne constitue pas deux validations indépendantes.
- Une notification `0x23` a été observée ; cela ne suffit pas à démontrer que toutes les commandes reçoivent ou doivent attendre un ACK dans ce scénario.
- Une notification `0x04` porte les octets `02 38 03 00 00` (valeur little-endian `824` aux positions 6–7). Elle arrive environ 218 ms après l'écriture du registre `0x20` et avant l'écriture `0x22`. La documentation VMI+ générique nomme `0x04` `SimpleData` et `0x20` `CsvLength`, mais ne décrit pas le payload ni ne prouve explicitement leur relation sur Purevent. L'export CSV fourni le 10/11/2026 à 16 h 45 contient 800 lignes datées (804 lignes au total, dont 4 lignes d'en-tête). La capture HCI a été réalisée le 12/11/2026 vers 13 h 30 : les deux mesures sont donc séparées d'environ 45 heures, pendant lesquelles l'historique a continué à s'enrichir. La valeur `824` reçue dans la trame `0x04` est cohérente avec le nombre de lignes de l'historique au moment de la capture, soit 24 de plus que les 800 relevés datés du CSV antérieur. L'écart de 1 avec `800 + 24` dépend de la convention de comptage/indexation du protocole et reste à documenter, mais il n'est plus pertinent de comparer directement les deux valeurs comme si elles avaient été relevées au même instant. Les séquences BLE observées (0–399) et les fragments manquants/incomplets restent un sujet distinct : ils décrivent ce qui est présent dans le fichier HCI, pas nécessairement le nombre total de lignes de l'historique.
- Les notifications sont remplies/paddées au niveau ATT ; les octets après la trame utile ne doivent pas être décodés comme des données métier.
- Aucun échantillon de température négative n'a été identifié dans les données utilisateur analysées jusqu'ici ; la divergence de conversion `-255` / `-256` reste donc ouverte.

### 3.1 Comparaison détaillée des trames et de la séquence d'historique

| Élément | Référence Purevent | Référence VMI+ générique | Capture utilisateur / décision Vmi2 |
|---|---|---|---|
| GATT | UUID service/commande et service/télémétrie | Mêmes UUID | Les quatre UUID et les handles 0x000C–0x0015 concordent. |
| Trame sortante | XOR du type au dernier octet de données | CRC-8 poly 0x01, init 0, XOR final 0x13 | Les 39 trames applicatives écrites concordent avec les deux formules, algébriquement équivalentes ici. |
| Trame entrante | XOR du type jusqu'à l'avant-dernier octet de données | Le parseur générique ne valide pas le CRC dans son chemin de décodage | Vmi2 applique la plage Purevent et dispose d'un test synthétique avec dernier octet non nul. La capture utilisateur ne distingue pas les plages : cet octet est nul sur les 1 880 trames d'historique. |
| `0x01` état | Positions Purevent : volume 22, jours 26, filtre 28, surventilation 33, vitesse 34, consigne 35, limite été 38, vacances 43, boost 44, débit fixe 45, renouvellement 47, préchauffage 53 | Plusieurs positions concordent ; la doc générique attribue notamment une signification à l'octet 36 | Vmi2 lit les champs observés ; l'octet 36 reste volontairement ignoré, car Purevent ne le caractérise pas. |
| `0x02` | La référence Purevent l'appelle télécommande et lit température 11 / humidité 13 | La référence générique décrit une liste de capteurs ; le type de slot 0x03 correspond à la télécommande | La trame capturée fait 128 octets utiles ; son premier slot a le type 0x03 et les valeurs 24 °C / 57 %. Vmi2 vérifie désormais ce type avant d'exposer les valeurs comme mesures du salon. |
| `0x03` | Sondes filaires, offsets 6, 8 et 11 | Jusqu'à cinq sondes de cinq octets | La capture contient une trame de 31 octets utiles ; les deux premiers emplacements sont 0 et 1, avec 13 °C / 96 % et 12 °C / 97 %. Vmi2 décode ces deux emplacements, pas les autres. |
| `0x04` | Non documenté dans le module Purevent public | Classe `SimpleData` | La capture reçoit `02 38 03 00 00` après le registre 0x20 et avant 0x22. La valeur 824 est considérée comme un candidat sérieux au nombre de lignes annoncé par la VMI au moment de la capture. Le CSV du 10/11 contient 800 relevés datés, soit un écart temporel plausible d'environ 24 lignes au 12/11. Cette hypothèse explique l'écart entre les deux compteurs, mais ne prouve pas à elle seule que les 824 lignes ont toutes été reçues dans le fichier HCI. |
| `0x23` | Classe d'accusé | `AckData`, documentée comme réponse aux écritures | Un seul ACK est observé sur le handle télémétrie 0x000E, environ 429 ms après la mise à l'heure 0x1A ; la capture ne confirme pas un ACK après chacune des 39 écritures. |
| `0x30` | Historique non documenté dans le module Purevent public | Classe `Csv` | 1 880 trames historiques observées ; 400 séquences 0–399. La capture s'arrête avant la fin. |
| `0x50` | Non documenté comme classe de trame | Non décrit comme classe de notification dans la table des classes ; `0x50` apparaît aussi comme code de panne dans une autre table, ce qui ne prouve pas un lien | Une notification télémétrie apparaît environ 284 ms après l'écriture 0x2C. Corrélation temporelle, rôle inconnu. |
| `0x10` reçu | Le module Purevent le définit comme type de commande sortant, pas comme notification traitée | Classe `Command` app → centrale | Deux notifications sur le handle commande 0x0013 reprennent les registres 0x03 et 0x22 ; leur fonction côté centrale n'est pas documentée. |

**Seuils de longueur :** la source Purevent définit des longueurs minimales de 14 octets pour la télécommande `0x02` et de 12 pour les sondes `0x03`, tandis que Vmi2 exige respectivement 128 et 31 octets utiles, les longueurs réellement observées dans la capture. Vmi2 est donc plus strict que les minima du parseur Purevent public ; aucune capture Purevent plus courte ne permet actuellement de déterminer si cette stricte longueur fixe est nécessaire ou si des trames plus courtes mais valides existent.

**Séquence d'export observée :** Vmi2 écrit 0x2C, puis 0x20, reçoit 0x04 environ 218 ms après 0x20, puis écrit 0x22. La documentation générique associe 0x20 à `CsvLength`, 0x21 à `StopCSV` et 0x22 à `StartCsvV2` (elle mentionne aussi 0x09 `StartCsv`). La capture ne contient aucune écriture 0x21 ni 0x09. Vmi2 coupe volontairement la liaison lorsqu'il atteint une ligne déjà connue ; l'existence de `StopCSV` dans la documentation générique ouvre une piste pour arrêter proprement le flux, mais son support et ses effets sur Purevent ne sont pas confirmés. Aucun essai ne doit être fait sans autorisation explicite. La charge utile 0x04 n'est pas spécifiée ; son lien avec 0x20 est fortement suggéré par l'ordre temporel, pas formellement spécifié pour Purevent.

**Comptage et décalage temporel :** le CSV du 10/11/2026 comporte 804 lignes au total : quatre lignes de métadonnées/en-tête et 800 lignes datées. La trame HCI du 12/11/2026 annonce 824. Comme les relevés ne sont pas contemporains, l'explication la plus simple est l'ajout d'environ 24 lignes d'historique entre les deux dates. On retient 824 comme compteur de lignes annoncé à la date de la capture (hypothèse de travail), avec une réserve sur la convention exacte de comptage/indexation et sur le nombre de lignes effectivement présentes dans le flux HCI.

**À ne pas confondre :** les statistiques ci-dessus proviennent de la capture de l'utilisateur, tandis que les détails des registres génériques proviennent des dépôts publics. Les uns ne valident pas automatiquement les autres.

### 3.2 Portée de la capture HCI : synchronisation incrémentale et compteur 824

La capture ne correspond pas à un export exhaustif de toutes les lignes de l'historique : elle montre le flux reçu pendant une synchronisation qui peut s'arrêter lorsqu'une ligne déjà connue est retrouvée. Cette distinction explique pourquoi le nombre de trames reçues n'est pas égal au compteur global annoncé.

Constats recoupés avec le CSV du 10/11 :
- La notification `0x04` annonce la valeur 824 après la lecture du registre `0x20`. Le CSV antérieur contient 800 relevés datés. L'écart d'environ 24 lignes entre le 10/11 et le 12/11 est cohérent avec l'hypothèse de l'utilisateur : 824 est le nombre total de lignes annoncé au moment de la capture.
- La sauvegarde JSON du 20/11/2026 contient exactement 848 entrées dans `hist`, avec des relevés datés du 16/05/2018 au 19/11/2026. On a donc trois valeurs observées sur trois artefacts : CSV du 10/11 = 800 lignes datées ; notification HCI du 12/11 = 824 ; sauvegarde JSON du 20/11 = 848 entrées `hist`. La progression 800 → 824 → 848 renforce fortement l'interprétation de 824 comme compteur global de lignes à la date de la capture. Les périmètres temporels des deux fichiers de données ne sont toutefois pas identiques (le CSV descend plus loin dans l'ancien historique que la sauvegarde JSON), donc cette progression confirme le compteur mais ne prouve pas une identité parfaite des jeux de données.
- La capture contient 1 880 trames `0x30`, couvrant les séquences 0–399 : 25 blocs de métadonnées (0–24), puis des lignes de données (25–399). Les séquences 25 à 398 ont leurs cinq fragments observés ; la séquence 399 ne montre que le fragment 0.
- La ligne de séquence 398 est datée du 01/05/2018 à 02:34:35. Cette ligne existe exactement dans le CSV fourni. C'est donc un candidat très solide pour la ligne déjà connue qui sert de borne à une synchronisation incrémentale.
- La séquence 399 commence à 01/05/2018 à 01:34:36, date également présente dans le CSV. Seul son premier fragment apparaît à la fin du fichier HCI. Cela est compatible avec une notification déjà en vol au moment où l'application atteint la ligne connue précédente et coupe la liaison ; ce fragment isolé ne doit pas être compté comme une ligne reconstituée.
- Le nombre de séquences/trames de cette capture ne doit donc pas être comparé directement au total 824 : l'application ne retransmet pas nécessairement tout l'historique déjà stocké. La fin de synchronisation incrémentale et la fin d'un export exhaustif sont deux notions distinctes.

**Conséquence pour Vmi2 :** conserver 824 comme compteur global annoncé (interprétation de travail fortement cohérente avec les deux dates et le CSV). Ne pas exiger de recevoir 824 lignes à chaque synchronisation. Pour une synchronisation incrémentale, la condition de fin pertinente reste la rencontre d'une ligne de référence déjà connue, après réception complète de ses cinq fragments observés. Le compteur global pourra servir de contrôle de cohérence ou d'indication de progression d'un export exhaustif, pas de borne de fin d'une synchronisation incrémentale.
## 4. Enseignements pour Vmi2

1. **Fraîcheur par session :** remettre à zéro les horodatages de mesures à chaque reconnexion. Distinguer lien BLE ouvert, dernière donnée reçue, donnée fraîche et donnée admissible à un snapshot.
2. **Commandes :** distinguer trois niveaux : écriture GATT acceptée, ACK protocolaire reçu, état métier relu et conforme. Ne pas afficher « commande réussie » sur le seul succès GATT si une confirmation d'état est disponible.
3. **Intégrité :** garder des fonctions de checksum séparées selon modèle et sens de transmission. Documenter précisément les octets inclus dans le calcul.
4. **Qualité des mesures :** étudier le filtre anti-sauts Purevent, mais conserver la mesure brute, la valeur filtrée, le motif de rejet et l'horodatage. Les seuils doivent être calibrés avant activation.
5. **Diagnostic matériel :** le statut d'auto-test et ses octets de détail sont une piste issue du protocole générique. Vérifier leur signification sur Purevent avant de les transformer en alertes.
6. **Fonctions avancées :** bypass, programmation horaire, capteurs CO₂/VOC et GTC sont des pistes génériques ; ne pas les présenter comme compatibles Purevent sans preuve.
7. **Températures négatives :** ne pas trancher la conversion signée avant une capture réelle sous zéro ou une spécification firmware fiable.

## 5. Points restant à vérifier

- Comparaison octet par octet des 39 trames applicatives sortantes et distinction des 4 écritures CCCD : effectuée. Les deux formules de somme sortante sont équivalentes dans ce protocole.
- Test synthétique du XOR entrant avec dernier octet non nul : ajouté et exécuté dans la suite de Vmi2.
- Vérifier exactement la signification et la réponse attendue du type `0x23` selon le registre et le modèle.
- Vérifier les tests unitaires des trois dépôts et réutiliser uniquement les vecteurs adaptés à la Purevent.
- Comparaison des champs d'état 0x01, des sondes 0x03 et de la télécommande 0x02 : réalisée pour les champs actuellement exploités par Vmi2. Les autres offsets restent à étudier.
- Examiner si les octets d'auto-test génériques sont présents et stables sur les trames Purevent de l'utilisateur.
- Confirmer sur la Purevent les fonctions bypass, programme hebdomadaire, capteurs avancés et GTC avant de les exposer dans Vmi2.
- Poursuivre l'audit Vmi2 de l'historique, de la persistance, des sauvegardes/restaurations, de la gestion offline et du service worker.

- Le compteur `0x04 = 824` est retenu comme nombre total de lignes annoncé au moment de la capture HCI (interprétation de travail). Le CSV du 10/11 contient 800 relevés datés ; environ 24 lignes supplémentaires au 12/11 sont cohérentes avec l'écart temporel. Le HCI montre une synchronisation incrémentale qui atteint une ligne déjà connue, pas un export exhaustif des 824 lignes. Voir §3.2.

## 6. Règles de prudence pour les prochaines sessions

- Ne pas envoyer de commandes de réglage, de calibration, de reset usine ou de mise à jour à la VMI sans autorisation explicite.
- Ne pas modifier `main`. Travailler sur une branche dédiée et proposer une PR.
- Ne pas fusionner une PR sans accord explicite de l'utilisateur.
- Ne pas déclarer l'audit terminé tant que les points de la section 5 et l'audit des dépôts personnels prévus ne sont pas traités.
- Dans les rapports, étiqueter chaque conclusion : **vérifié dans le code**, **observé dans la capture**, **hypothèse**, ou **à confirmer sur Purevent**.

## 7. Sources primaires

- https://github.com/clemvillon/ha-vmi-purevent/blob/main/custom_components/vmi_plus/protocol.py
- https://github.com/clemvillon/ha-vmi-purevent/blob/main/custom_components/vmi_plus/device.py
- https://github.com/clemvillon/ha-vmi-purevent/blob/main/custom_components/vmi_plus/const.py
- https://github.com/srThibaultP/ha-vmi-plus/blob/main/PROTOCOL.md
- https://github.com/srThibaultP/ha-vmi-plus/blob/main/README.md
- https://github.com/srThibaultP/vmi-plus-ble/blob/main/src/vmi_plus_ble/protocol.py
- https://github.com/srThibaultP/vmi-plus-ble/blob/main/src/vmi_plus_ble/client.py
