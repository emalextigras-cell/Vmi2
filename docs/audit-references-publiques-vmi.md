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

### 3.3 Audit de la sauvegarde et des clés de rapprochement

Artefacts contrôlés : `00_A0_50_48_B4_A3-2026-11-10-16_55.csv` et `vmi-sauvegarde-2026-11-20.json` fournis dans la conversation.

**Constats sur la sauvegarde JSON du 20/11 :**
- `hist` contient 848 relevés. Les 848 horodatages `t` sont valides, strictement croissants dans le tableau et uniques ; aucun doublon d'horodatage n'a été détecté.
- Les couples `rk|d` sont également uniques dans cette sauvegarde. Le compteur `d` est présent et numérique sur les 848 relevés.
- 35 relevés portent `fixed: true` (dates corrigées) ; 84 portent explicitement `syncPartial: false` et aucun ne porte `syncPartial: true`. Les autres n'ont pas de marqueur `syncPartial` ; le code actuel les traite comme des relevés complets pour la borne de synchronisation.
- Les dates brutes `rk` couvrent le 16/05/2018 au 19/11/2026. Le tableau est ordonné selon `t`, qui peut être une date corrigée et ne doit pas être confondue avec la date brute `rk`.

**Constats sur le CSV du 10/11 :**
- 804 lignes au total : quatre lignes de métadonnées/en-tête et 800 relevés datés.
- Le compteur `d` va de 159 à 186. Le CSV contient des dates brutes allant du 12/04/2018 au 10/11/2026.
- Après normalisation du zéro initial des jours/heures, seuls 461 couples `rk|d` sont communs aux deux exports. Ils ne constituent donc pas deux instantanés strictement identiques dont l'un serait simplement un ajout de lignes à l'autre.
- Exemple concret de non-unicité du compteur seul : `d=172` apparaît avec des dates brutes d'avril 2018 dans le CSV et d'octobre 2026 dans la sauvegarde JSON. Le compteur de jours ne peut donc pas être utilisé seul comme identifiant d'un relevé.

**Lecture du code de persistance :**
- `mergeImportedHistory` et `mergeBackupData` regroupent les relevés par horodatage corrigé `t` ; les doublons à `t` égal sont enrichis champ par champ.
- La borne de synchronisation BLE utilise une autre signature, `rk|d` (date brute + compteur). Cette distinction est cohérente avec la nécessité de conserver la date brute pour diagnostiquer l'horloge, mais elle mérite des tests ciblés lorsque le même relevé peut être présenté avec une date brute différente après une correction ou un redémarrage d'horloge.
- `mergeRecordFields` conserve les champs déjà connus lorsqu'une source ne les fournit pas et permet qu'un relevé partiel soit complété par une source complète. Les imports/restaurations fusionnent les données ; ils ne remplacent pas aveuglément l'historique local.
- La restauration sauvegarde `hist`, `live` et `energyReadings` dans une transaction IndexedDB unique. L'état mémoire n'est actualisé qu'après succès de cette transaction.


**Contrôle temporel et complétude des mesures dans le JSON :**
- Les 848 relevés sont triés par `t` ; l'intervalle médian entre deux relevés est de 60 minutes. Les champs `st`, `sh`, `t1`, `h1`, `te`, `he`, `rpm` et `fil` sont tous renseignés dans les 848 objets.
- Treize intervalles dépassent deux heures. Un intervalle particulièrement long dure environ 173 h 43, entre le 27/10/2026 à 10:15 (compteur `d=172`) et le 03/11/2026 à 15:57 (compteur `d=179`). C'est une lacune temporelle observée dans la sauvegarde ; elle ne prouve pas à elle seule une perte de données dans la VMI (arrêt, absence de journalisation ou export incomplet restent possibles).
- Les 35 relevés `fixed: true` ont une date brute `rk` de 2018, mais un horodatage `t` corrigé en 2026. Ils illustrent concrètement pourquoi les deux champs doivent être conservés et audités séparément.
- Le diagnostic applicatif signale déjà les trous de plus de deux heures. Il faudra distinguer dans l'interface une interruption de mesure observée, une lacune de transfert BLE et une ligne rejetée : ces événements n'ont pas la même signification.

**Point à poursuivre :** construire des tests de rapprochement sur des lignes identiques dont `rk` change, sur un compteur `d` réinitialisé, et sur deux relevés distincts partageant un même horodatage corrigé. Ne pas modifier la signature ou la clé de fusion avant d'avoir établi ces cas à partir des données et du comportement réel de la VMI.


### 3.5 Emplacements de sondes vides, fraîcheur BLE et séquencement des requêtes

**Emplacements vides — défaut confirmé sur la capture utilisateur :**
- La documentation de `ha-vmi-plus/PROTOCOL.md` indique que les emplacements de sondes filaires inutilisés portent la localisation `0x08`.
- Vérification directe du fichier `btsnoop_hci.log` : une trame Purevent `0x03` utile de 31 octets contient les cinq emplacements suivants :
  - slot 0 : `00 0d 00 60 00` (actif, localisation 0) ;
  - slot 1 : `01 0c 00 61 00` (actif, localisation 1) ;
  - slots 2, 3 et 4 : `08 00 00 00 00` (vides).
- Avant correction, le décodeur exposait les températures et humidités des cinq slots, et le runtime mettait à jour les deux premières sondes sans contrôler leur localisation. Les emplacements vides pouvaient donc être présentés comme des mesures à 0 °C et 0 % HR.
- Vmi2 ignore maintenant les mesures d'un slot dont la localisation vaut `0x08`, conserve les mesures des slots actifs et affiche un tiret pour un slot vide.
- Un test de décodage utilise la trame capturée exacte (`a5b6030619000d006000010c00610008000000000800000000080000000015`) ; un test runtime couvre le cas d'un premier slot vide et d'un second actif.

**Fraîcheur de la liaison :**
- La référence Purevent définit « connectée » comme une liaison GATT ouverte ET une trame d'état valide reçue depuis moins de 35 secondes. Elle ferme et recrée la liaison si le contrôleur reste ouvert mais ne répond plus.
- Avant cette évolution, Vmi2 assimilait essentiellement `gatt.connected` à une connexion active. Une liaison silencieuse pouvait donc rester affichée comme connectée, même sans nouvelle trame d'état.
- Vmi2 ajoute un watchdog de fraîcheur à 35 secondes, aligné sur la référence Purevent. Il tient compte de la date de connexion lorsqu'aucun état n'est encore arrivé, et suspend son contrôle pendant un téléchargement historique ou une commande utilisateur. En cas de silence, il demande une déconnexion GATT ; le mécanisme de reconnexion existant reprend ensuite la main.
- Les horodatages de réception sont réinitialisés à chaque nouvelle connexion afin qu'une ancienne trame d'état ne rende pas fraîche une nouvelle session.
- Tests dédiés : liaison déconnectée, téléchargement en cours, commande en cours, trame récente, trame ancienne et absence de première trame.

**Séquencement des requêtes — attente de réponse typée ajoutée :**
- Purevent sérialise les requêtes avec un verrou et attend une notification valide du type attendu. Le délai maximal de réponse est de 5 secondes. Pour une commande, il vérifie l'état métier renvoyé ; en cas de doute, il relit l'état sans renvoyer la commande, afin de ne pas inverser deux fois une bascule.
- Le client générique `vmi-plus-ble` attend également la classe de réponse attendue pour ses lectures (`_request`). Ses écritures simples attendent seulement l'acceptation GATT.
- Vmi2 distingue désormais l'acceptation de l'écriture GATT de la réponse du protocole VMI. Les lectures `0x03`, `0x06` et `0x07` attendent respectivement une trame `state`, `room` (type `0x02`, télécommande) et `probes` (type `0x03`), avec un timeout de 5 secondes. Une seule réponse typée peut être attendue à la fois. Le mapping a été vérifié dans `protocol.py` de Purevent et dans `const.py` de `vmi-plus-ble`.
- Les commandes manuelles `0x18`, `0x19` et `0x1A` attendent une trame d'état. En l'absence de réponse, Vmi2 tente une relecture d'état sans renvoyer la commande. Le téléchargement historique attend la fin d'une lecture déjà en cours avant d'envoyer ses registres ; les requêtes de lecture sont suspendues pendant le transfert.
- La file d'écriture conserve son délai de 350 ms entre écritures, mais ce délai n'est plus utilisé comme substitut à une réponse VMI. La capture utilisateur montre des réponses aux lectures `0x03`, `0x06` et `0x07` environ 178 ms, 276 ms et 207 ms après leur écriture.
- La référence Purevent attend aussi une trame `0x23` après la mise à l'heure (`0x1A`). La capture utilisateur contient exactement une trame `a5b623060025`, valide sur six octets, environ 429 ms après cette écriture. Vmi2 décode maintenant cet ACK et ne considère la mise à l'heure confirmée qu'après sa réception. Cette observation ne permet pas de supposer que tous les registres de commande répondent par `0x23` : les commandes de réglage restent confirmées par une trame d'état. Lors du lancement de l'historique, la mise à l'heure reste une étape de meilleure effort : l'absence d'ACK est journalisée mais ne bloque pas les registres de synchronisation.
- Limite intrinsèque : le protocole observé ne fournit pas d'identifiant de transaction. Une trame tardive du bon type peut donc être confondue avec la réponse d'une requête ultérieure du même type. La sérialisation réduit ce risque mais ne peut pas le supprimer. Après timeout, une réponse reçue hors attente est ignorée ; une validation plus forte nécessiterait un mécanisme de séquence firmware ou une stratégie de reconnexion après timeout.
- Tests ajoutés pour le routage des réponses valides, le rejet d'un type inattendu, l'interdiction d'attentes simultanées, le timeout et l'annulation à la perte de session. La CI GitHub Actions #964 valide cette intégration : 534 tests réussis, aucun échec, syntaxe JavaScript, ESLint et types JSDoc réussis.
**Longueurs minimales des sondes — pas de relâchement automatique :**
- Le parseur Purevent public déclare des minima de 14 octets pour `0x02` et 12 pour `0x03`, alors que Vmi2 exige les longueurs utiles observées de 128 et 31 octets.
- Ces minima externes ne prouvent pas que des trames Purevent plus courtes sont émises dans les scénarios réels. En outre, Vmi2 lit davantage de champs de sondes, notamment l'humidité du second emplacement à l'offset 13, que le décodeur Purevent minimal.
- Décision : conserver les seuils actuels tant qu'aucune trame courte valide n'a été observée ou spécifiée. Une éventuelle évolution devra décoder seulement les champs réellement présents et ne jamais lire l'octet de somme comme une mesure.


### 3.6 Filtrage des mesures, sauts et valeurs de remplacement

**Référence Purevent publique :** `clemvillon/ha-vmi-purevent`, fichiers `protocol.py`, `device.py` et `const.py` :
- Les bornes physiques publiées sont de -30 à 70 °C et de 0 à 100 % HR.
- Le filtre `FiltreDeSaut` est indépendant pour chaque mesure. Il utilise un saut maximal de 10 °C pour les températures et de 30 points pour les humidités relatives.
- Un saut qui dépasse le seuil n'est pas accepté sur le premier échantillon : il devient un candidat. Le relevé suivant doit le confirmer (proche du candidat) ; s'il revient près de la valeur stable, le candidat est abandonné.
- Au démarrage ou après reconnexion, la première mesure attend elle aussi une confirmation.
- Une valeur hors plage conserve la dernière valeur stable ; après trois rejets consécutifs, la mesure devient inconnue.
- Les filtres sont remis à zéro à chaque nouvelle connexion. Les constantes sont `SAUT_MAX_TEMPERATURE_C=10`, `SAUT_MAX_HUMIDITE=30` et `REJETS_MAX=3`.

**Constats dans Vmi2 avant cette évolution :**
- Le runtime copiait immédiatement les températures et humidités décodées dans l'état live. Les valeurs plausibles mais isolées pouvaient donc être affichées et alimenter les calculs sans confirmation temporelle.
- La plage de température du contrôle qualité était limitée à 60 °C, alors que la référence Purevent publique admet jusqu'à 70 °C.
- Le détecteur de pics historiques existait déjà, mais il produisait un signal de contrôle qualité sans écarter systématiquement les pics du diagnostic hygrométrique principal.
- Les emplacements de sondes marqués `0x08` étaient déjà traités séparément et restent immédiatement indisponibles : ils ne passent pas dans le filtre de saut.

**Constats dans la sauvegarde JSON du 20/11/2026 :**
- Sept relevés correspondent exactement au motif de remplacement déjà identifié par Vmi2 : salon, sonde résistances et air entrant tous à 20 °C / 50 % HR. C'est un motif suspect de valeur de remplacement ; il ne prouve pas à lui seul une panne ou un défaut physique.
- Le détecteur actuel (fenêtre maximale de 30 minutes) repère quatre candidats de pics : deux sur l'humidité de l'air entrant (`he`, 97 → 50 → 97 et 89 → 50 → 89) et deux sur l'humidité de la sonde résistances (`h1`, 83 → 51 → 87 et 96 → 50 → 96).
- Les deux candidats `he` coïncident avec des relevés complets au motif 20/50 ; le candidat `h1` à 50 % du 12/11 coïncide lui aussi avec ce motif. Le candidat `h1` du 07/11 (51 %) est distinct et reste un événement à examiner, pas une preuve de panne.
- Les valeurs brutes de la sauvegarde ne sont ni réécrites ni supprimées par ce diagnostic.

**Évolutions apportées sur la branche :**
- Nouveau module `measurement-filter.js` : six filtres indépendants pour les températures et humidités live du salon, de la sonde résistances et de l'air entrant. Les seuils et la confirmation sur deux lectures reprennent la référence Purevent publique.
- Le filtre ne s'applique qu'aux notifications BLE live. Il ne modifie pas les lignes CSV historiques importées ni le flux de synchronisation.
- Le runtime conserve les octets décodés dans des champs `*_raw` et utilise la valeur filtrée pour l'affichage, les calculs psychrométriques et les snapshots live. Les snapshots conservent également les champs `stRaw`, `shRaw`, `t1Raw`, `h1Raw`, `teRaw` et `heRaw`.
- Une reconnexion réinitialise tous les filtres ; un emplacement de sonde vide réinitialise immédiatement le filtre de cet emplacement.
- Les relevés au motif 20/50 sont exclus des calculs hygrométriques, des tendances, des comparaisons de vitesses, des analyses saisonnières, de l'analyse de consigne thermique et du bilan hebdomadaire. Ils restent présents dans les données brutes et sont comptés dans la qualité d'entrée.
- Le diagnostic hygrométrique principal écarte aussi les horodatages signalés comme pics isolés sur les quatre mesures qu'il utilise (`st`, `sh`, `te`, `he`). Les compteurs `placeholderSensorRecordCount` et `transientSpikeRecordCount` rendent ces exclusions visibles.
- La borne haute de température de plausibilité est alignée sur la référence Purevent à 70 °C.

**Limites et prudence :**
- Le filtre live retarde l'acceptation initiale d'une mesure jusqu'à sa confirmation suivante ; c'est volontaire et conforme à la référence, mais cela peut laisser une valeur indisponible pendant un cycle de lecture.
- Les seuils Purevent sont une base documentée, pas une calibration métrologique des sondes de cette installation. Ils devront être réévalués si des mesures fiables montrent des variations légitimes supérieures.
- Le filtre est logiciel et local à l'application : aucune commande de réglage n'est envoyée à la VMI. Aucun test sur la VMI connectée n'a été réalisé dans cette étape.
- Les candidats de pics historiques restent des signaux heuristiques. Un saut durable peut être une vraie évolution de l'environnement ; seule une anomalie isolée suivie d'un retour est signalée.

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
- Type `0x23` : accusé de mise à l'heure `0x1A` vérifié sur la capture Purevent ; ne pas extrapoler cet ACK aux autres registres sans capture ou spécification.
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


### 3.4 Robustesse après remise à zéro du compteur et cache hors ligne

**Correction de la référence du compteur :**
- `fixClock` comparait le premier compteur entrant au maximum `d` de tout l'historique. Après une remise à zéro réelle, l'ancien maximum reste présent dans les archives : il pouvait donc provoquer une détection de recul à chaque synchronisation ultérieure, même lorsque le compteur progressait normalement depuis la nouvelle référence.
- La fonction donne désormais la priorité à `counterPreviousDays`, référence issue des métadonnées persistées. Le maximum historique reste un repli pour les installations anciennes qui ne possèdent pas encore cette référence.
- L'application transmet la référence persistée même si le transfert courant est partiel ; elle ne met à jour la référence qu'après une synchronisation certifiée.
- Un test couvre le scénario : ancien historique à `d=194`, compteur remis à zéro puis référence courante `d=4`, nouvelle synchronisation à `d=5`. Le cas ne doit plus être interprété comme un nouveau recul.

**Cache du service worker :**
- Le service worker applique une stratégie réseau d'abord, cache ensuite ; hors connexion, il restitue les ressources précédemment mises en cache et `index.html` pour la navigation.
- Les fichiers applicatifs de cette PR changent alors que le nom du cache était resté `v14-cache-55`. Sans changement du script du service worker, un appareil déjà installé pouvait conserver son ancien cache jusqu'à ce qu'il recharge individuellement les ressources en étant connecté.
- Le cache a depuis été incrémenté jusqu'à `v14-cache-64`. Les modules `js/modules/bluetooth-freshness.js` et `js/modules/measurement-filter.js` sont explicitement ajoutés à l'App Shell afin qu'il soit également disponible hors ligne. L'installation du nouveau service worker pré-télécharge à nouveau l'App Shell, puis l'activation supprime l'ancien cache `vmi-test-`. Si le pré-téléchargement échoue, le nouveau service worker ne s'active pas et l'ancien cache actif n'est pas supprimé.

**Identité et fusion des relevés :**
- Le rapprochement de la borne BLE repose sur `rk|d` ; la fusion de l'historique local et des sauvegardes repose sur l'horodatage corrigé `t`.
- Aucun doublon de `t` ni de couple `rk|d` n'a été trouvé dans la sauvegarde JSON fournie. Le risque de deux relevés distincts fusionnés à tort parce qu'ils partageraient le même `t` reste donc théorique dans les données disponibles ; il est conservé comme point de vigilance, sans modifier la clé de fusion sans preuve.


### 3.7 Validation de l'évolution du filtrage

- Le premier passage CI après ajout des compteurs de qualité a échoué sur deux tests qui comparaient strictement l'ancien objet `inputQuality`. Les deux attentes ont été actualisées pour inclure `placeholderSensorRecordCount` et `transientSpikeRecordCount` ; il ne s'agissait pas d'une erreur de calcul.
- GitHub Actions #987, commit `b55afcea201dcba030ac1c6c30c98f9269275f0d` : **549 tests réussis, 0 échec**. Le contrôle inclut aussi l'exclusion des relevés de remplacement dans l'analyse de consigne thermique. Syntaxe JavaScript, ESLint et vérification des types JSDoc réussis.
- Les tests couvrent le démarrage du filtre, la confirmation d'un saut, le retour à la valeur stable, les valeurs hors plage, les trois rejets consécutifs, l'indépendance des capteurs, la remise à zéro, la conservation des valeurs brutes et l'exclusion des relevés de remplacement/pics isolés du diagnostic.
- Cette validation est logicielle. Elle ne constitue pas un essai en liaison Bluetooth avec la VMI.



### 3.8 Cohérence psychrométrique et ambiguïtés temporelles

**Formules actuellement utilisées — vérifiées dans `js/modules/psychrometry.js` :**
- Pression de vapeur saturante : `6.112 × exp(17.62 × T / (243.12 + T))`, en hPa, approximation de Magnus (coefficients Sonntag).
- Pression réelle de vapeur : pression saturante × HR / 100.
- Densité de vapeur d'eau / humidité absolue : `216.7 × e / (T + 273.15)`, en g/m³, relation issue de l'équation des gaz parfaits.
- Point de rosée : inversion algébrique de la même approximation de Magnus. Les quatre calculs restent cohérents entre eux dans le domaine d'usage courant.
- L'humidité absolue (densité de vapeur) ne nécessite pas de pression atmosphérique dans cette approximation idéale. En revanche, le rapport de mélange en kg/kg d'air sec et certaines propriétés psychrométriques ASHRAE nécessitent la pression totale.

**Limites de précision identifiées — aucune extrapolation en diagnostic :**
- Les coefficients actuels sont ceux de Magnus au-dessus de l'eau liquide ; la référence consultée donne un domaine usuel d'environ −45 à +60 °C. Le code accepte actuellement −80 à +80 °C et la plausibilité des capteurs autorise jusqu'à 70 °C : les limites logicielles sont donc plus larges que le domaine documenté de cette approximation.
- Sous 0 °C, la pression de saturation sur glace diffère de celle sur eau. Le code ne sépare pas encore point de rosée et point de givre. Ne pas interpréter une valeur sous zéro comme une précision métrologique.
- Décision : ne pas modifier les coefficients ni introduire une branche glace/eau sans avoir fixé la convention de mesure HR des sondes Purevent et ajouté des vecteurs de référence indépendants. Le point est ouvert et explicitement documenté.
- Le point de rosée de l'air n'est pas la température d'une paroi. Sans température de surface ou pont thermique mesuré/modélisé, l'application ne doit pas annoncer un risque de condensation. La limite est déjà explicitement renvoyée par le diagnostic.
- Le différentiel d'humidité absolue salon − air entrant décrit un potentiel hygrométrique, pas le débit réellement renouvelé ni une preuve de baisse de l'humidité intérieure. Le code conserve ces précautions dans ses observations.

**Anomalie corrigée — horodatages contradictoires :**
- Avant correction, `prepareHygrometricRows()` conservait la dernière ligne valide rencontrée pour un horodatage dupliqué, même si une autre ligne valide au même instant portait des valeurs hygrométriques différentes. L'ordre d'import pouvait donc décider arbitrairement du diagnostic.
- Désormais, les lignes invalides/incomplètes restent ignorées sans éliminer une ligne valide concurrente. Les doublons valides strictement identiques sont ramenés à une seule observation. Si les quatre mesures utilisées (`st`, `sh`, `te`, `he`) se contredisent au même instant, tout le groupe temporel est exclu.
- Le diagnostic expose `conflictingTimestampCount` en plus de `duplicateTimestampCount`. Les relevés bruts ne sont ni réécrits ni supprimés.
- Tests ajoutés : doublon valide contradictoire, doublon valide identique, et doublon invalide face à une ligne valide.
- Le service worker est passé à `vmi-test-v14-cache-65` afin de recharger le module d'analyse modifié.

**Références externes consultées :**
- ASHRAE Handbook — Psychrometrics, définitions de la densité de vapeur (absolute humidity), du rapport de mélange et du point de rosée : https://handbook.ashrae.org/Handbooks/F25/SI/F25_Ch01/F25_Ch01_si.aspx
- Formule de Magnus / coefficients Sonntag au-dessus de l'eau et coefficients distincts sur glace : https://link.springer.com/chapter/10.1007/978-3-032-03884-5_3
- Formules de vapeur d'eau et de densité absolue documentées dans une référence scientifique : https://digitalarchive.library.bogazici.edu.tr/bitstreams/d677e348-5d14-4b64-979d-de3815e49dfb/download

**État de cette étape :**
- La sélection de données ambiguës est corrigée et couverte par des tests.
- Les formules usuelles ont été comparées à des références psychrométriques indépendantes ; aucune modification de formule n'est justifiée sans convention capteur sous zéro.
- Aucun risque de condensation n'est calculé ; aucun essai de commande ou de réglage VMI n'a été effectué.


**Validation de la correction temporelle :**
- GitHub Actions #996, commit testé `737c2ff00682d2523a09cba9afd542b647c45f78` : **551 tests réussis, 0 échec**.
- Syntaxe JavaScript, ESLint et vérification des types JSDoc réussis.
- Le commit suivant `7a3dc2f2ffa924d357a8a0d065333324617dbac6` ne modifie que le journal d'audit ; aucun code n'a changé après le commit testé.


**Confrontation avec la sauvegarde utilisateur du 20/11/2026 (848 relevés) :**
- Température salon : 14 à 29,1 °C ; sonde résistances : 3,4 à 20 °C ; air entrant : 1,3 à 20 °C. Aucun des 848 relevés ne contient une température mesurée négative.
- Les humidités relatives vont de 36 à 74 % au salon, de 42 à 99 % sur la sonde résistances et de 43 à 100 % sur l'air entrant.
- Avec les coefficients actuels, le point de rosée calculé de l'air entrant passe sous 0 °C sur 19 relevés (minimum calculé : environ −2,54 °C), alors que la température mesurée de l'air entrant reste au-dessus de 0 °C. Cela concerne la convention de point de rosée/givre, pas une mesure d'air sous zéro.
- Les valeurs de température effectivement présentes dans cette sauvegarde sont dans la zone courante de l'approximation Magnus eau liquide. Le problème de domaine logiciel plus large reste une limite générale à traiter avant d'utiliser ces fonctions sur des plages extrêmes.
- Aucun signal de la sauvegarde ne justifie actuellement une branche glace/eau sur les températures mesurées. Conserver le point comme amélioration future si l'installation rencontre des températures d'air négatives ou si une précision de point de givre est requise.


### 3.9 Longueurs variables des notifications capteurs

**Comparaison des sources :**
- La référence Purevent actuelle `clemvillon/ha-vmi-purevent` déclare `TELECOMMANDE_LONGUEUR = 14` (type `0x02`) et `SONDES_LONGUEUR = 12` (type `0x03`), puis lit respectivement les offsets 11/13 et 6/8/11.
- La documentation générique `srThibaultP/ha-vmi-plus` décrit jusqu'à 10 capteurs sans fil de 10 octets chacun pour `0x02`, et jusqu'à 5 sondes filaires de 5 octets pour `0x03`. Elle est principalement vérifiée sur Urban ; elle ne remplace pas les observations Purevent.
- `srThibaultP/vmi-plus-ble` utilise un registre de classes de réponses typées pour ses lectures (`STATE -> Status`, `PROBES -> Probes`, `SENSORS -> Sensors`) ; cela confirme le principe de séquencement par type, mais sa nomenclature générique ne doit pas être confondue avec la table Purevent.

**Écart trouvé dans Vmi2 :**
- Le décodeur imposait les longueurs observées dans la capture (128 octets pour `0x02`, 31 pour `0x03`) comme longueurs minimales.
- Ces valeurs correspondent aux deux notifications capturées, pas à des minima démontrés par le protocole. Cela pouvait rejeter une notification valide plus courte d'un firmware ou d'une configuration avec moins de capteurs.
- Correction : Vmi2 exige maintenant 15 octets pour ces deux classes. C'est le minimum nécessaire pour lire les champs actuellement utilisés jusqu'à l'offset 13 et conserver l'octet de somme après ces données. Les octets de remplissage au-delà de la longueur déclarée ne sont jamais utilisés comme mesures.
- Les trames d'état `0x01` (61), données simples `0x04` (11), ACK `0x23` (6) et historique `0x30` (116) conservent leurs contraintes existantes.
- Tests ajoutés pour les trames courtes `0x02` et `0x03`, avec somme valide, et tests de troncature adaptés.

**Précaution :**
- La référence Purevent annonce 14 et 12 comme longueurs utiles minimales, mais ces seuils sont inférieurs aux offsets complets que Vmi2 exploite (notamment l'humidité du second slot à l'offset 13). Vmi2 retient donc 15 pour garantir que tous les champs qu'il consomme précèdent bien l'octet de somme.
- Les captures utilisateur fournies continuent de confirmer les formats 128 et 31. Aucun test n'a été effectué sur la VMI physique avec des notifications raccourcies.

**Validation de cette correction :**
- Cache service worker : `vmi-test-v14-cache-66`.

- GitHub Actions #1002, commit `864d2f60dced69767fba8355805254a378e9382f` : **553 tests réussis, 0 échec** ; syntaxe JavaScript, ESLint et types JSDoc réussis. Le commit de documentation suivant ne modifie pas le code.


### 3.10 Sémantique du mode vacances (registre 0x1A)

**Référence Purevent actuelle :**
- Le registre `0x1A` est `REG_VACANCES` et sa valeur est un nombre de jours ; `0` arrête le mode.
- L'octet 43 de la trame `0x01` est `ETAT_VACANCES`, défini comme le nombre de jours restants. Le code Purevent lit cet octet comme un entier, pas comme un booléen.
- La référence Purevent fixe un plafond prudent de 15 jours pour ses propres commandes, en précisant que des durées plus longues configurées ailleurs peuvent être lues telles quelles.

**Écart trouvé dans Vmi2 :**
- Le décodeur exposait directement l'octet 43 dans `holiday`, et le runtime l'utilisait comme un booléen. La comparaison de confirmation attendait strictement 0 ou 1.
- Une activation avec plusieurs jours pouvait donc être affichée comme active grâce à la vérité numérique, mais être déclarée non confirmée car la valeur reçue était par exemple 7 ou 15.
- La commande « Activer » envoyait seulement la valeur 1, donc une journée, sans que l'interface ne le dise.

**Correction apportée :**
- Le décodeur expose maintenant `vacationDays` (valeur brute 0–255) et `holiday` (booléen dérivé de `vacationDays > 0`).
- Le runtime conserve les deux informations : `cur.hol` reste un booléen compatible avec les historiques et les vérifications de commande ; `cur.holidayDays` conserve le nombre de jours restants.
- L'état affiché indique le nombre de jours restants.
- Les commandes proposent explicitement 1, 7 ou 15 jours, ainsi que l'arrêt (0). Le seuil de 15 suit le plafond prudent du dépôt Purevent, sans prétendre que le firmware interdit une durée supérieure.
- Aucun ordre n'a été envoyé à la VMI. Les tests vérifient notamment une trame à 7 jours et une trame à 0 jour.

**Cache service worker :** `vmi-test-v14-cache-67`.

- GitHub Actions #1011, commit `f1dbd01442358b41d4eb037c6a11acf9a8f7410f` : **554 tests réussis, 0 échec** ; syntaxe JavaScript, ESLint et types JSDoc réussis.


### 3.11 Décodage étendu de la trame d'état Purevent (0x01)

**Source principale :** `clemvillon/ha-vmi-purevent/custom_components/vmi_plus/protocol.py`, qui indique que les registres et offsets ci-dessous ont été vérifiés sur une Purevent firmware 6.4.002. La documentation source précise que le mapping de certains champs a été confirmé par une capture du 04/10/2026 propre à l'auteur du dépôt ; ce n'est pas la capture HCI de l'utilisateur.

**Champs supplémentaires documentés dans l'état de 61 octets :**
- Offset 33 : surventilation, logique inversée ; valeur 0 = active.
- Offset 35 : consigne de préchauffage en °C ; 0 = aucune consigne.
- Offset 38 : limite de température estivale en °C.
- Offset 45 : débit fixe ; 1 = actif.
- Offsets 47–48 : renouvellement d'air little-endian, en volumes par heure multipliés par 1000.
- Offset 53 : préchauffage en marche ; 1 = actif.
- Le débit théorique affiché par la référence Purevent est calculé par `round(renouvellement × volume / 1000)`.

**Écart dans Vmi2 et correction :**
- Vmi2 décodait déjà volume, jours, filtre, vitesse, boost et vacances, mais ignorait les champs ci-dessus.
- Le décodeur expose maintenant les valeurs brutes et les booléens interprétés, le taux de renouvellement en vol/h et le débit théorique calculé.
- Le runtime met à jour les indicateurs de l'interface sans effectuer de requête Bluetooth supplémentaire.
- Les tests vérifient la logique inversée de la surventilation, le débit fixe, les deux états distincts du préchauffage, la consigne, la limite estivale et le calcul du débit.

**Commandes volontairement non activées dans cette étape :**
- Le registre `0x0B` est une bascule et non une commande idempotente. La référence Purevent relit l'état avant de l'envoyer et ne l'envoie que si l'état voulu diffère ; Vmi2 ne doit pas le proposer comme un simple bouton « basculer » sans cette garde.
- Le registre `0x1C` règle la consigne de préchauffage et peut démarrer le préchauffage. Le registre `0x2F` commande sa marche/son arrêt ; la référence prévoit une séquence d'arrêt vérifiée et peut compléter par une consigne à zéro. Ces actions ne sont pas ajoutées à l'interface tant que leur orchestration et leur confirmation ne sont pas testées.
- Les registres `0x17` (limite été) et `0x1B` (débit fixe) sont identifiés, mais leurs commandes seront ajoutées séparément avec contrôles de plage et confirmation d'état.

**Précaution :**
- Le débit affiché est une valeur théorique dérivée du volume et du renouvellement annoncé, pas une mesure directe au débitmètre.
- La sémantique des offsets est celle de la référence Purevent 6.4.002. Les trames HCI de l'utilisateur ne contiennent pas encore une commande de réglage ou un état explicitement documenté de tous ces modes ; aucune commande physique n'a été envoyée.

**Cache service worker :** `vmi-test-v14-cache-68`.

- GitHub Actions #1020, commit `b7670c3e03d632d24e2a84efba23f2a67cdc8f5c` : **554 tests réussis, 0 échec** ; syntaxe JavaScript, ESLint et types JSDoc réussis.


### 3.12 Orchestration des commandes avancées Purevent

**Référence protocolaire vérifiée dans `clemvillon/ha-vmi-purevent` :**
- `0x0B` est une bascule de surventilation : l'état doit être relu avant l'envoi, et l'ordre ne doit jamais être répété si la confirmation manque.
- `0x17` règle la limite estivale (22–37 °C).
- `0x1B` active/désactive le débit fixe.
- `0x1C` règle la consigne de préchauffage (12–18 °C) et démarre le chauffage ; la valeur 0 supprime la consigne.
- `0x2F` commande la marche du préchauffage. Pour l'arrêt complet, Purevent envoie `0x2F=0`, puis `0x1C=0` si la marche ou la consigne ne sont pas toutes deux confirmées à zéro.

**Implémentation Vmi2 :**
- Nouveau module pur `bluetooth-advanced-commands.js`, séparé du transport BLE et testable sans matériel.
- Chaque commande commence par une lecture d'état fraîche. Si l'état est déjà celui demandé, aucune écriture n'est envoyée.
- Après une écriture, Vmi2 utilise l'état reçu ; si la réponse ne confirme pas le réglage, elle effectue une lecture explicite. Une commande non confirmée n'est jamais renvoyée.
- La surventilation n'envoie qu'une bascule `0x0B=0` après comparaison de l'état lu.
- L'arrêt du préchauffage utilise au plus deux écritures, `0x2F=0` puis, si nécessaire, `0x1C=0`. Les deux conditions finales (marche arrêtée et consigne nulle) sont vérifiées.
- L'interface présente les plages documentées et avertit qu'une consigne de préchauffage démarre le chauffage ; une confirmation explicite est demandée pour le démarrage et le réglage de consigne.
- Le service worker passe à `vmi-test-v14-cache-69` et inclut le nouveau module.

**Limite conservée :** les trames ne contiennent pas d'identifiant de transaction. La sérialisation des requêtes et la lecture préalable réduisent le risque d'associer une notification tardive, sans l'éliminer mathématiquement.

**Tests logiciels :** les tests dédiés couvrent l'état déjà conforme, la bascule unique, l'absence de renvoi après non-confirmation, les plages numériques, l'activation/désactivation du débit fixe, la séquence d'arrêt du préchauffage, le repli après échec de relecture et l'absence d'écriture si la liaison est coupée. Ils utilisent des callbacks simulés ; aucun ordre n'est envoyé à une VMI physique.
- GitHub Actions #1035, commit testé `459e64a0243d401bb49e41809a3308b31deb737d` : **566 tests réussis, 0 échec** ; syntaxe JavaScript, ESLint et JSDoc réussis.


### 3.13 Référence du compteur après synchronisation historique

**Anomalie trouvée dans `finishDownload()` :**
- Le code cherchait le relevé de compteur avec `download.rows.find(...)`. Or les lignes sont ajoutées dans l'ordre des séquences BLE : `find()` renvoyait donc le premier nouveau relevé, et non le plus récent.
- La référence persistée après synchronisation complète pouvait rester en retard de plusieurs relevés. Cela faussait le point de départ du contrôle d'une remise à zéro ultérieure.
- Il ne faut pas remplacer cette sélection par le maximum numérique : le compteur `d` peut réellement repartir à zéro. La référence correcte est le dernier relevé exploitable dans l'ordre du flux.

**Correction apportée :**
- Nouveau helper pur `findNewestCounterRecord()` dans `js/modules/sync.js`, qui parcourt les lignes depuis la fin et retient le dernier compteur entier, fini et non négatif.
- `finishDownload()` utilise désormais ce helper avant l'évaluation et la persistance de la référence.
- Tests : ordre croissant, remise à zéro (190, 191, 2, 3), compteurs invalides et historique vide.
- GitHub Actions #1037, commit testé `785b81b17d0d674545c65b3abc2a6738abf7b378` : **570 tests réussis, 0 échec** ; syntaxe JavaScript, ESLint et JSDoc réussis.

**Points de synchronisation qui restent à confirmer :**
- Le compteur global annoncé par `0x04/0x02` ne doit pas être traité comme nombre de lignes reçues dans le transfert ; la capture ne montre qu'un flux incrémental.
- La réponse `0x04` arrive après la demande de compteur `0x20`, mais sa sémantique et son caractère obligatoire ne sont pas documentés dans le dépôt Purevent public. Ne pas en faire une condition bloquante sans nouvelle preuve.
- La fin de transfert reste certifiée uniquement à la rencontre d'une ligne déjà connue et après réception de tous ses fragments observés ; timeout, lacune ou ligne rejetée laissent les relevés partiels non certifiés.


### 3.14 Fin de synchronisation incrémentale et borne de coupure

**Constats vérifiés dans la capture HCI fournie :**
- Les notifications de type 0x30 portent un index de séquence aux octets 9–10 et un index de fragment à l'octet 12.
- Les blocs de métadonnées observés occupent les séquences 0 à 24, avec un fragment chacun.
- Les lignes CSV datées observées occupent les séquences 25 à 398, avec cinq fragments (indices 0, 10, 20, 30 et 40). Le premier fragment contient déjà la date complète ; les fragments transportent jusqu'à 85 caractères utiles dans les trames examinées.
- La séquence 399 ne contient que le fragment 0 dans le fichier HCI. Sa ligne commence par 01/05/2018 01:34:36.
- Cette ligne n'est présente ni dans le CSV du 10/11/2026 (dont le relevé le plus ancien est du 12/04/2018), ni dans la sauvegarde JSON du 20/11/2026 (dont la date brute la plus ancienne est du 19/05/2018). La séquence 399 n'est donc pas une borne déjà connue dans ces deux sources.
- La capture s'arrête au milieu de cette ligne. Elle ne démontre ni un arrêt normal du firmware, ni un arrêt incrémental, ni la réception des cinq fragments de la séquence 399.

**Écart de synchronisation identifié :**
- Les lignes observées ne se terminent pas par un séparateur CSV dans leur dernier fragment ; le saut de ligne arrive au début du fragment 0 de la séquence suivante.
- Le parseur reconnaissait donc une ligne déjà connue au moment où le flux avait déjà avancé sur la séquence suivante. L'ancien contrôle vérifiait alors la complétude de cette nouvelle séquence et attendait ses cinq fragments, ce qui pouvait télécharger une ligne ancienne supplémentaire ou retarder la fin jusqu'au timeout si le flux s'interrompait après son premier fragment.
- Le runtime mémorise désormais l'état de complétude de la séquence précédente avant d'accepter le fragment suivant. Si ce fragment permet de terminer et reconnaître la ligne précédente déjà connue, la synchronisation s'arrête immédiatement et le fragment partiel de la ligne plus ancienne est abandonné.
- Si la ligne précédente n'avait pas ses cinq fragments, cette voie d'arrêt n'est pas utilisée. Une lacune déjà détectée continue également à empêcher la certification du transfert.

**Tests :**
- Test runtime avec cinq fragments de ligne et saut de ligne placé au début de la séquence suivante.
- Vérification que la borne connue arrête le flux dès la reconnaissance de la ligne précédente complète, sans attendre les cinq fragments de la ligne plus ancienne.
- Aucun ordre BLE envoyé à la VMI ; validation logicielle uniquement.


### 3.15 Synchronisation initiale sans borne déjà connue

**Comportement établi dans le code Vmi2 :**
- Au démarrage, la borne de coupure est construite à partir des relevés persistés qui ne sont pas marqués syncPartial. Si aucun relevé de référence n'existe, l'ensemble des signatures est vide et aucune ligne reçue ne peut déclencher reachedCut.
- Le compteur 0x04/0x02 est affiché comme total annoncé, mais n'est pas utilisé pour certifier la fin. Sa sémantique précise n'est pas décrite dans la référence Purevent publique et la capture fournie s'arrête avant la fin du flux.
- Aucun marqueur de fin Purevent vérifié n'a été observé. Le type 0x21 StopCSV provient de références génériques et n'a pas été validé sur cette Purevent ; il ne doit pas être envoyé ni utilisé comme preuve.
- Sans borne connue, le timeout de 20 secondes clôt le transfert comme incomplet. Les lignes reçues sont conservées avec syncPartial=true et ne deviennent pas une borne de synchronisation ultérieure.

**Conséquence fonctionnelle :**
- Une première synchronisation Bluetooth depuis une base vide ne peut actuellement pas être certifiée complète par Vmi2. Les données reçues restent conservées, mais une nouvelle tentative ne dispose toujours pas d'une borne complète.
- Ce comportement est volontairement conservateur : il évite de présenter comme complet un historique tronqué. Il révèle toutefois une limite de bootstrap qui doit être résolue avant de considérer la synchronisation initiale comme fiable.

**Preuve nécessaire avant correction :**
- Capturer une synchronisation complète jusqu'à sa terminaison naturelle et rapprocher le nombre de lignes CSV reçues, le dernier index de séquence, le compteur 0x04/0x02 et les éventuels messages terminaux.
- Vérifier si 0x04/0x02 représente le nombre total de lignes stockées, le nombre de lignes transférables ou une autre grandeur. Les valeurs 800 (CSV), 824 (capture HCI) et 848 (sauvegarde JSON) ne suffisent pas à établir seules cette sémantique, car les exports ne sont pas strictement identiques.
- Tant que cette preuve manque, ne pas transformer le compteur annoncé en condition de fin et ne pas envoyer StopCSV.

### 3.16 Reprise progressive du bootstrap historique

**Défaut confirmé dans le code précédent :**
- Une synchronisation depuis une base vide ne disposait d'aucune borne complète ; les lignes reçues étaient donc conservées avec `syncPartial=true`.
- À la tentative suivante, `startDownload()` ne construisait ses signatures qu'à partir des relevés complets. Les lignes partielles précédemment sauvegardées n'étaient pas reconnues comme doublons pendant le flux.
- Comme le parseur ne pouvait pas s'arrêter sur ces lignes, il pouvait les réimporter à chaque tentative. La fusion par horodatage limitait les doublons physiques, mais la synchronisation ne disposait d'aucun mécanisme explicite pour dépasser le préfixe déjà reçu.

**Correction apportée dans Vmi2 :**
- Séparer trois ensembles : les signatures de borne complète, les signatures de toutes les lignes déjà persistées, et les signatures nouvelles déjà rencontrées dans la session.
- En mode bootstrap (aucune borne complète), ignorer toute ligne déjà persistée et continuer à lire le flux ; chaque ligne inconnue et valide est ajoutée, même si elle apparaît après les anciennes lignes partielles.
- Une même ligne inconnue retransmise dans la session est ajoutée une seule fois.
- Dès qu'une borne complète existe, les lignes partielles connues sont simplement ignorées et seule la rencontre de la borne complète arrête le flux.
- Les nouvelles lignes d'un bootstrap restent annotées `syncPartial=true`. Le délai d'inactivité de 20 secondes, le compteur annoncé 824 et les octets de fin non interprétés ne deviennent pas des preuves de complétude.

**Éléments de preuve et limites :**
- Le CSV fourni est ordonné du plus récent au plus ancien. Dans la capture HCI, la séquence 398 porte 01/05/2018 02:34:35 et la séquence 399 commence par une ligne plus ancienne (01/05/2018 01:34:36). Cela soutient l'hypothèse d'un flux décroissant pour cette capture, sans prouver que tous les firmwares/configurations se comportent toujours ainsi.
- La logique de bootstrap ne dépend pas d'un ordre précis pour dédupliquer : elle collecte toutes les signatures inconnues rencontrées et ne coupe pas le flux sur une ligne partielle connue.
- La sémantique du compteur 824 reste non certifiée. Les nombres 800 (CSV), 824 (notification HCI) et 848 (sauvegarde JSON) proviennent de snapshots différents ; ils ne permettent pas de fixer une borne de fin.
- Sans marqueur terminal vérifié, un bootstrap peut enrichir progressivement l'historique, mais il reste explicitement non certifié complet. Aucun relevé partiel n'est promu automatiquement en borne complète.

**Tests logiciels :**
- Signatures de test issues du CSV fourni : lignes du 01/05/2018 avec compteurs 178 et du 12/04/2018 avec compteur 159.
- Vérification du saut des lignes partielles déjà connues, de la collecte des lignes inconnues plus anciennes, de la déduplication au sein d'une session et de l'arrêt uniquement sur une borne complète.
- Tests simulés uniquement ; aucun ordre BLE ni essai matériel.
