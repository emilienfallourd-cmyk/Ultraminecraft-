# UltraMinecraft

Un clone de Minecraft en HTML + Three.js (WebGL 2), avec un rendu réaliste : ombres dynamiques, ciel physique, nuages volumétriques, eau avec réflexions en lancer de rayons dans l'espace écran (SSR), rayons de lumière volumétriques, bloom et exposition automatique.

## Lancer le jeu

### Le plus simple : un seul fichier

Téléchargez `dist/UltraMinecraft.html` et ouvrez-le par double-clic dans Chrome, Edge ou Firefox. Tout le jeu est dans ce fichier ; une connexion Internet sert seulement à charger la police pixel.

Pour régénérer ce fichier après une modification du code :

```bash
npm i --no-save esbuild
node tools/build-single.mjs
```

### Depuis les sources

Les sources utilisent des modules ES : elles doivent être servies par un serveur HTTP (ouvrir `index.html` directement depuis le disque ne fonctionne pas).

```bash
npx http-server -p 8080 .
# ou : python -m http.server 8080
# puis ouvrir http://localhost:8080
```

Aucune étape de compilation : Three.js est inclus dans `lib/`.

## Contenu

- **Trois dimensions** : la Surface, le Nether et l'End, avec portails du Nether et de l'End.
- **Génération du monde** : biomes (plaines, forêts, taïga, désert, savane, jungle, marais, montagnes enneigées, océans…), grottes, minerais, rivières, arbres, végétation.
- **Structures** : villages (maisons, bibliothèques, forges, église, enclos, marché, champs, tours), avant-postes de pillards, temples de la jungle, mines abandonnées, monuments océaniques, ruines sous-marines, cabanes de sorcière, forts de l'End, cités antiques, donjons, puits, igloos, pyramides, portails en ruine, épaves, forteresses et bastions du Nether, piliers de l'End et cités de l'End.
- **Blocs** : plusieurs centaines de blocs aux textures procédurales, avec cartes de normales, de rugosité et d'émission.
- **Eau et lave** : écoulement comme dans Minecraft (sources, niveaux, écoulement vers le bas), rendu avec réfraction, absorption, caustiques, écume et réflexions.
- **Lumière** : lumière du ciel et des blocs propagée comme dans Minecraft, éclairage lissé et occlusion ambiante.
- **Créatures** : plus de 60 créatures modélisées (passives, neutres, hostiles, aquatiques, volantes), avec recherche de chemin.
- **Boss** : Dragon de l'Ender, Wither et Warden.
- **Jeu** : physique de Minecraft, minage et pose de blocs, inventaire, artisanat, fours, coffres, nourriture, expérience, effets, explosions, météo, cycle jour-nuit.
- **Modes** : Survie, Créatif, Extrême et Spectateur.
- **Sauvegarde** automatique dans le navigateur (IndexedDB).
- **Sons** : bruitages synthétisés (pas selon le matériau, casse, voix des créatures, explosions, tonnerre), son 3D, réverbération dans les grottes, ambiances (pluie, vent, eau, oiseaux, grillons).
- **Musique** : musique d'ambiance composée à la volée (commande `/musique`), juke-box avec 8 disques aux morceaux originaux (Chat, Aube, Taverne, Caverne, Braises, Fête, Océan, Berceuse), blocs musicaux à 25 notes dont l'instrument dépend du bloc placé dessous.
- **Redstone** : poudre de redstone (puissance de 0 à 15, monte et descend les marches), torches de redstone (inverseurs, grillent si elles clignotent trop vite), leviers, boutons en pierre et en bois, plaques de pression, répéteurs (retard de 1 à 4), observateurs, capteurs de lumière du jour (inversables), lampes, pistons et pistons collants (jusqu'à 12 blocs). Le courant active aussi les portes, la TNT, les blocs musicaux et les cloches.
- **Forêt d'automne** : biome aux érables rouges et orangés, bouleaux dorés, sol couvert de feuilles mortes, citrouilles et champignons, feuilles qui tombent (`/locate automne`).
- **Mobile** : joystick flottant (apparaît sous le pouce), bouton de course, taille des commandes réglable.
- **Manette** : prise en charge des manettes Xbox, PlayStation et compatibles (API Gamepad), vibrations, curseur virtuel pour les menus et l'inventaire.
- **Modes graphiques** : Mobile éco, Mobile, Mobile+, Rapide, Équilibré, Manette / TV, Réaliste et Ultra (RT), avec résolution dynamique, limite d'images et taille de l'interface. Le mode mobile adapté à l'appareil est choisi automatiquement au premier lancement.

## Commandes

| Touche | Action |
| --- | --- |
| ZQSD (AZERTY) / WASD (QWERTY) | Se déplacer |
| Espace | Sauter (double appui en créatif : voler) |
| Maj | S'accroupir |
| Ctrl (ou double appui sur avancer) | Courir |
| Clic gauche | Casser / attaquer |
| Clic droit | Poser / utiliser |
| 1–9, molette | Choisir un objet |
| E | Inventaire |
| Q | Jeter un objet |
| T ou / | Discussion et commandes |
| F3 | Informations de débogage |
| F5 | Changer de vue |
| Échap | Pause |

### Manette

| Bouton | En jeu | Dans les menus |
| --- | --- | --- |
| Stick gauche | Se déplacer | Déplacer le curseur |
| Stick droit | Regarder | Faire défiler |
| A | Sauter (double appui : voler) | Cliquer |
| B | S'accroupir | Retour |
| X | Jeter l'objet | Clic droit |
| Y | Inventaire | Fermer l'inventaire |
| RT / LT | Casser / poser | — |
| LB / RB, croix ← → | Barre d'objets | Onglets / régler un curseur |
| Croix ↑ / ↓ | Changer de vue / main secondaire | Élément voisin |
| L3 / R3 | Courir / choisir le bloc visé | — |
| Menu | Pause | — |

Commandes utiles : `/gamemode 1`, `/give diamond_sword`, `/summon zombie`, `/boss dragon|wither|warden`, `/dimension nether|end|overworld`, `/time set nuit`, `/weather rain`, `/locate village|outpost|temple|mineshaft|monument|automne`, `/locate biome cerisaie`, `/musique [stop]`, `/help`.

## Organisation du code

- `src/world/` : tronçons, lumière, maillage, génération (`gen/`), fluides, logique des blocs.
- `src/gfx/` : pipeline de rendu, shaders, textures, ciel et environnement, particules, main.
- `src/entity/` : physique, joueur, créatures, IA, boss.
- `src/items/` : objets et recettes.
- `src/ui/` : interface, menus, ATH, commandes.
- `tools/` : construction du fichier unique (`build-single.mjs`) et pages de test du rendu, de l'atlas de textures et des icônes.

Projet de fans, non affilié à Mojang ni à Microsoft.
