# Contribuer à Vmi2

Ce dépôt est une application de supervision et d'analyse d'une VMI Purevent. La priorité est de préserver le comportement matériel et l'intégrité des données.

## Avant toute modification

- Travailler sur une branche dédiée et proposer une Pull Request vers `main`.
- Lire le [README](README.md), le [CHANGELOG](CHANGELOG.md) et l'[index documentaire](docs/README.md).
- Décrire le problème observé, le comportement attendu et le périmètre exact du changement.
- Ne pas mélanger une refonte, un nettoyage général et une correction fonctionnelle dans la même PR.

## Règles de sécurité fonctionnelle

Toute modification des éléments suivants doit être isolée, justifiée et accompagnée de tests ciblés :
- Bluetooth : UUID, trames, CRC, séquence et temporisation des commandes, gestion des sessions et reconnexion.
- Commandes de vitesse, Boost et mode vacances.
- IndexedDB : schéma, migrations, import/export et sauvegardes.
- Calculs psychrométriques, thermiques, énergétiques et diagnostics.
- Service worker, cache applicatif et ressources nécessaires au démarrage.

Les tests automatisés ne prouvent pas le fonctionnement sur une VMI réelle. Pour une évolution touchant le Bluetooth ou les commandes, préciser les vérifications matérielles nécessaires. Ne jamais présenter une validation logicielle comme une validation matérielle.

## Style JavaScript

- Utiliser les modules ES natifs et conserver le style du fichier voisin.
- Indenter avec 2 espaces ; ne pas mélanger tabulations et espaces.
- Utiliser des points-virgules et des guillemets simples.
- Préférer `const` ; utiliser `let` seulement si la réaffectation est nécessaire.
- Employer des noms explicites et limiter les fonctions à une responsabilité claire.
- Éviter les variables globales, les effets de bord cachés et les dépendances ajoutées sans nécessité.
- Commenter les décisions non évidentes, les unités et les hypothèses scientifiques ; ne pas commenter le code de façon redondante.
- Ne pas reformater massivement les fichiers dans une PR fonctionnelle.

La configuration ESLint à la racine définit les contrôles automatiques minimaux. Elle complète ces règles sans remplacer la revue de code.

## Tests et Pull Request

Avant de demander une revue :

```bash
npm test
npm run lint
npx tsc --noEmit -p jsconfig.json
```

Dans la description de la PR, indiquer :
1. le problème et la solution ;
2. les fichiers et fonctions concernés ;
3. les risques éventuels pour BLE, commandes, données ou calculs ;
4. les tests exécutés et leurs résultats ;
5. les essais matériels restant à effectuer, le cas échéant.

Garder les changements limités et réversibles. Ne pas fusionner une PR dont les contrôles échouent ou dont les effets sur le fonctionnement réel ne sont pas compris.
