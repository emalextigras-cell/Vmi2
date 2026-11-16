# Comprendre le fonctionnement de la VMI Purevent Vision'R

## Périmètre et niveau de preuve

Cette note recoupe le code VMI-TEST, la version 13 monolithique fournie, le CSV VMI+ du 10 novembre 2026, les deux sauvegardes JSON du 13 novembre et la capture Bluetooth BTSnoop fournie.

Les faits observés dans un export ou une capture ne constituent pas automatiquement une spécification constructeur. Les interprétations non confirmées sont signalées comme telles.

## 1. Matériel et installation

Le devis d'installation identifie le caisson comme VMI Purevent Vision'R. Il mentionne :
- volume du logement configuré dans l'export : 337 m³ ;
- débit maximal annoncé au devis : 350 m³/h ;
- puissance maximale moteur annoncée : 169 W ;
- puissance maximale de chauffage électrique annoncée : 1 800 W ;
- alimentation 230 V / 50 Hz ;
- prise d'air en toiture et deux bouches d'insufflation.

Ces valeurs sont des références documentaires, pas des mesures électriques ou aérauliques de l'installation. Le débit réellement distribué dans les pièces n'est pas mesuré par le seul champ Debit.

## 2. Ce que l'application lit

### Mesures et sondes

Le code de l'application traite les données comme suit :

| Donnée interne | Source dans le CSV VMI+ | Libellé utilisé dans l'application |
|---|---|---|
| `st`, `sh` | bloc `Asst`, données 1 et 2 (colonnes 117 et 118 de cet export) | température et humidité du salon |
| `t1`, `h1` | bloc `P0_SortieResitance` | sonde résistances |
| `te`, `he` | bloc `P1_EntreeAir` | air entrant |
| `tExt` | `Tempext` | température extérieure |
| `rpm` | `Tachy (rpm)` | régime ventilateur |
| `debit` | `Debit` | débit en m³/h |
| `vmiModeRaw` | `Mode` | niveau manuel annoté 1/2/3 |
| `vmiSpeedRaw` | `Vitesse` | code brut VMI+ conservé séparément |

Cette correspondance est celle du parseur et des libellés de l'application. L'identité physique exacte de chaque capteur et son étalonnage restent à confirmer sur l'installation.

Les champs `Hum abs (%)` de l'export VMI+ sont conservés comme valeurs brutes : leur unité n'est pas confirmée. L'application recalcule sa propre humidité absolue en g/m³ à partir de la température et de l'humidité relative.

### Indicateurs hygrométriques

Le moteur calcule :
- l'humidité absolue du salon à partir de `st/sh` ;
- l'humidité absolue de l'air entrant à partir de `te/he` ;
- l'écart salon moins air entrant ;
- le point de rosée des deux mesures.

Un écart positif salon − air entrant signifie que l'air entrant contient moins de vapeur d'eau par m³ au moment du relevé. C'est un potentiel d'assèchement, pas une preuve que la VMI a effectivement asséché le logement. Il faut aussi tenir compte des apports d'humidité, de l'occupation, de la météo et des délais de réponse du bâtiment.

## 3. Ce que montrent les données fournies

### Historique et horloge

La sauvegarde JSON la plus récente contient 1 040 relevés du 11 octobre au 13 novembre 2026. Elle porte 448 relevés avec le marqueur `fixed: true` : leur horodatage avait été reconstruit à partir du compteur de jours de fonctionnement, car la date d'origine enregistrée par la VMI était erronée (dates de 2018 conservées dans le champ texte `rk`).

L'intervalle médian entre relevés est d'environ 60 minutes. Quatre intervalles dépassent deux heures ; le plus long est d'environ 156 minutes. Les analyses temporelles doivent donc exclure les grands trous au lieu de supposer une mesure continue.

### Hygrométrie observée

Sur les 1 040 relevés de la sauvegarde la plus récente, calculs refaits avec la formule psychrométrique de l'application :
- température salon médiane : 19,4 °C ;
- humidité relative salon médiane : 58 % ;
- humidité absolue salon médiane : 9,22 g/m³ ;
- température air entrant médiane : 11,9 °C ;
- humidité relative air entrant médiane : 89 % ;
- humidité absolue air entrant médiane : 8,64 g/m³ ;
- écart médian salon − air entrant : +0,60 g/m³.

Sur les relevés complets, l'air entrant est plus sec de plus de 1 g/m³ dans 431 cas, proche à ±1 g/m³ dans 481 cas et plus humide de plus de 1 g/m³ dans 128 cas.

Point important : une humidité relative de 89 % dans un air entrant froid ne signifie pas qu'il contient plus d'eau que l'air intérieur à 58 %. La comparaison en humidité absolue est plus pertinente pour évaluer le potentiel d'assèchement.

Les journées du 9 au 11 novembre montrent un écart médian proche de zéro ou légèrement négatif : à ces moments, l'air entrant n'offrait pratiquement pas de potentiel d'assèchement. Le 13 novembre, sur une journée incomplète, l'écart médian est plus favorable (environ +2,9 g/m³). Les conditions extérieures changent donc fortement l'effet hygrométrique potentiel.

### Débit et renouvellement théorique

Dans le CSV, le champ `Vol(m3)` vaut 337 et le champ `Debit` est interprété en m³/h, conformément à la confirmation de l'utilisateur.

Débits les plus fréquents dans le CSV :
- 121 m³/h ;
- 151 m³/h ;
- 74 m³/h ;
- 124 m³/h ;
- 193 m³/h.

Pour un volume de 337 m³, cela représente un renouvellement théorique débit / volume d'environ :
- 121 m³/h : 0,36 volume par heure ;
- 151 m³/h : 0,45 volume par heure ;
- 193 m³/h : 0,57 volume par heure.

Ce rapport ne mesure ni la répartition entre les pièces, ni le débit réellement reçu à chaque bouche.

### Niveaux manuels et code VMI+ brut

Le CSV fourni contient 800 lignes :
- champ `Mode` : 606 lignes en valeur 1 et 194 en valeur 2 ; aucune ligne en valeur 3 ;
- champ `Vitesse` : valeurs brutes de 0 à 5 ;
- champ `Debit` : valeurs de 50 à 193 m³/h dans ce CSV.

Le parseur garde volontairement `Mode` et `Vitesse` séparés. Il ne faut pas transformer les codes bruts `Vitesse` en niveaux manuels 1/2/3 : les valeurs observées ne donnent pas une correspondance univoque. Les périodes des modes 1 et 2 se chevauchent peu ; la comparaison actuelle ne constitue donc pas un essai contrôlé et ne permet pas de désigner une meilleure vitesse. Le troisième niveau manuel n'est pas documenté dans cet export.

### Limites des sauvegardes et doublons CSV

Le parseur de la version 13 fournie conserve les températures, humidités, régime et filtre, mais ne conserve pas les champs `Mode`, `Vitesse` et `Debit` dans ses enregistrements historiques. Les deux sauvegardes JSON fournies ne contiennent pas `vmiModeRaw` ; la plus récente contient `vmiSpeedRaw` et `debit` sur 795 relevés, mais pas le niveau manuel annoté. Elles ne suffisent donc pas, seules, pour comparer proprement les trois niveaux manuels. Le CSV original reste la source utile pour le champ `Mode`.

Le CSV contient cinq groupes d'horodatages répétés (six lignes supplémentaires). Les valeurs hygrométriques de ces doublons sont identiques, mais certains régimes moteur diffèrent. Lors d'une fusion par horodatage, une ligne peut remplacer l'autre : cela ne change pas les comparaisons d'humidité de ces groupes, mais peut affecter une statistique de régime moteur.

## 4. Ce que la capture Bluetooth confirme

La capture BTSnoop contient 4 333 enregistrements HCI. Elle confirme deux canaux GATT :
- canal capteurs : service `0003cab5-0000-1000-8000-00805f9b0131`, caractéristique `0003caa2-0000-1000-8000-00805f9b0131`, handle observé `0x000E` ;
- canal commandes : service `0003cbbb-0000-1000-8000-00805f9b0131`, caractéristique `0003cbb1-0000-1000-8000-00805f9b0131`, handle observé `0x0013`.

La capture contient 1 890 notifications sur le canal capteurs, 2 sur le canal commandes et 39 écritures applicatives sur le canal commandes. Les CRC des 39 trames applicatives sortantes sont conformes au calcul du code.

Le décodeur actuel reconnaît :
- type `0x01` : état de la VMI ;
- type `0x02` : mesure de la sonde pièce ;
- type `0x03` : deux sondes ;
- type `0x04` : total d'historique ;
- type `0x30` : fragments d'historique.

La capture ne contient qu'un exemplaire de chacun des types d'état/mesure ci-dessus, contre 1 880 notifications de type historique. Elle ne suffit donc pas à valider toutes les valeurs des capteurs ou tous les états possibles.

### Comportement Bluetooth à connaître

Dans le code, la connexion déclenche automatiquement une synchronisation d'historique. Cette séquence envoie d'abord l'heure du téléphone à la VMI, puis les trames de lancement du transfert. La connexion n'est donc pas strictement passive : l'horloge de la VMI peut être modifiée.

Le code envoie aussi périodiquement les registres `0x03`, `0x06` et `0x07`. La capture confirme ces écritures, mais ne démontre pas à elle seule leur sémantique exacte.

Les boutons de pilotage associent les registres décimaux 24, 25 et 26 à la vitesse, au Boost et au mode vacances. Aucune de ces trois commandes manuelles n'apparaît dans la capture fournie. Leur effet physique n'est donc pas validé par cette capture.

## 5. Ce qui reste inconnu

Ne pas conclure sans nouvelle preuve sur :
- la signification physique de tous les octets et registres Bluetooth ;
- la signification des notifications de type `0x10` reçues sur le canal commandes ;
- la correspondance complète entre `Vitesse` VMI+ et les niveaux manuels ;
- les unités et la signification de `Cons DP`, `PWM`, certains compteurs et états de filtre ;
- le fonctionnement réel du by-pass, de la résistance et du bloc HydroR dans toutes les conditions ;
- la puissance électrique réellement absorbée et la consommation du préchauffage ;
- la précision et l'étalonnage des sondes.

La courbe de puissance du module d'estimation est une référence documentaire interpolée, pas une mesure de cette installation. Le devis annonce par ailleurs 169 W de puissance moteur maximale ; le lien exact entre cette valeur et la courbe logicielle n'est pas établi.

## 6. Priorités pour faire progresser l'application

1. Stabiliser le dictionnaire des données : nom de chaque capteur, position, unité, source et niveau de confiance.
2. Vérifier les changements de niveau manuel avec des périodes assez longues et comparables, en enregistrant explicitement les heures de changement.
3. Renforcer les critères de comparaison : plusieurs jours communs et plusieurs relevés par jour et par niveau, pas seulement un total de quelques points.
4. Rendre visible la fraîcheur et la qualité de chaque mesure ; ne pas confondre absence de données et panne de la VMI.
5. Construire les conseils autour de l'humidité absolue, du débit observé, de la température et des apports d'humidité.
6. Garder vitesse, Boost et vacances en commande manuelle. Aucun pilotage automatique ne doit être ajouté tant que les commandes et leurs confirmations ne sont pas validées sur le matériel.

## Sources techniques du dépôt

- `docs/audit-bluetooth-capture.md`
- `docs/reference-materiel-purevent-vision-r.md`
- `js/modules/bluetooth-decoder.js`
- `js/modules/bluetooth-protocol.js`
- `js/modules/dataio.js`
- `js/modules/psychrometry.js`
- `js/modules/analysis.js`
- `js/app.js`

Cette note est un état des connaissances actuel, pas une certification du firmware ni une validation matérielle.
