# The Last Kindness — point de contrôle Saint-Orme

Ce paquet contient un passage jouable inachevé, préparé pour les essais réguliers demandés. **Il ne constitue pas le jeu commercial, la campagne de 50 heures, ni la section FMV de qualité finale exigée dans le brief.** Le brief intégral reste dans `production/USER-BRIEF.md`.

## Ce qui est présent

Cinq lieux reliés : cloître, infirmerie, archives, local des vannes et moulin. Douze états de scène, quatorze images PNG originales distinctes, deux objets ramassables/utilisables, deux solutions hydrauliques avec conséquences différentes, dialogues français, refus contextuels, registre et indices à trois niveaux. Les décors changent après réparation, évacuation et dérivation. La goupille installée est désormais intégrée à l’image et la sortie des archives est alignée sur la porte, à la suite de l’essai utilisateur.

Les 56 arbres et 147 nœuds exportés incluent des copies nécessaires aux liens de conversation du schéma natif. Ils ne sont pas un indicateur de volume narratif original ni de durée. Le second rôle d’asset du cloître sert au titre, comme l’exige MAGE2 ; il ne représente pas une image supplémentaire.

## Lancer et éditer

Extraire toute l’archive. Dans MAGE2 Editor, ouvrir le dossier `editable-project`. Le projet utilise sept fichiers JSON et des chemins `media/...` relatifs. L’éditeur lui-même n’est pas inclus.

Pour jouer à l’export, servir `official-web-export` par HTTP local. Exemple avec Python installé, depuis le dossier extrait :

```powershell
python -m http.server 4189 --bind 127.0.0.1 --directory official-web-export
```

Ouvrir ensuite `http://127.0.0.1:4189/` dans le navigateur. Le double-clic sur `index.html` en `file://` ne convient pas au chargement du contenu. Aucun service de génération, modèle, clé API ou téléchargement de média n’est requis pour jouer. L’export contient le lecteur officiel MAGE2.

Menu permet sauvegarde et chargement. Les sauvegardes sont liées au navigateur et à l’origine HTTP : conserver le même port pour les retrouver. Pendant un dialogue, utiliser Continuer. Pour placer un objet, ouvrir le sac, sélectionner l’objet puis cliquer sa cible. Tab/Entrée permettent de parcourir et activer les interactions. Les textes de l’histoire sont français ; les menus suivent initialement la langue du navigateur et disposent de réglages.

## Vérification réellement effectuée

Base moteur : `patriceac/mage2`, commit `0532ea6d41f1df852caee6a0d0ddb601f3381e0b`, schéma 16, moteur 0.1.0. Aucun changement moteur n’a été nécessaire pour la logique livrée. La branche de production est locale ; rien n’a été poussé ni publié.

- **26 tests passés** : 25 vérifications de contenu avec les vrais modules de schéma et de lecteur, puis export avec la fonction officielle `exportProjectBundle` et les ressources du paquet release. Le test fournit uniquement le contexte Electron requis ; il ne remplace pas une preuve du fonctionnement de l’application Windows. Rapport : `evidence/integration-tests.json`.
- **Validation** : références, liens, variables, catégories et contenu natif valides. Le contrôle moteur de préparation à l’export ne présente plus de blocage ; l’icône d’application dédiée manque encore. Une validation de structure n’atteste pas la qualité FMV ni la complétude.
- **Lecteur web officiel** : parcours de la réparation et de la dérivation par de vrais clics/choix ; aucun saut de scène ou variable forcée. Objet ramassé qui disparaît, mauvais objet refusé, évacuation, effets visuels et conversations de bilan vérifiés. Le parcours de réparation est reproductible avec `sources/scripts/verification/last-kindness-web-repair.js` via Playwright CLI, après une nouvelle partie.
- **Sauvegardes web** : sauvegarde/chargement entre les deux sonneries ; sauvegarde/rechargement après goupille et fermeture de l’admission ; reprise des conséquences après rechargement. Les tests natifs de logique couvrent aussi une conversation interrompue et les ordres alternatifs.
- **Inspection visuelle** : captures du titre, des archives, des deux issues, du bilan, des indices et de la goupille corrigée, conservées dans `evidence/screenshots`. La correction de la porte a aussi été éprouvée par un clic dans l’ouverture, indépendant du rectangle du hotspot.
- **Éditeur Windows isolé : non validé de bout en bout.** Premier essai : commande trop précoce avant que le renderer soit prêt. Second essai : ouverture du projet confirmée, mais activation clavier du premier hotspot non suivie d’une navigation ; expiration du pilote. Le banc a ensuite signalé `HarnessCleanup`, `VmFinalState` non confirmé Off et enfants VHDX non supprimés. Les résultats exacts sont conservés dans `evidence/native`. Pas de nouvel essai ni de repli sur l’hôte après cet incident d’infrastructure.

Le paquet Windows inspecté était `output/packaging/editor-win/dist/win-unpacked/MAGE2 Editor.exe`. SHA-256 de l’exécutable : `814a189c3a1ef9e9bd5aa178761d010e5645eb32e2283491ae95b8a8b8fa9f8e`. SHA-256 de `resources/app.asar` : `c27caa9c1a616ee9579c4f0066323207f7d74c567db8fdd5400d18069a089cc5`. Les derniers changements d’image et de contenu n’ont pas fait l’objet d’un nouvel essai Windows réussi.

La vérification de l’archive et de l’extraction est décrite séparément dans `evidence/ARCHIVE-CHECK.md`. Les tests automatisés et les parcours guidés par l’auteur ne mesurent pas la difficulté pour un nouveau joueur.

## Ce qui manque encore

Aucune vidéo de performance, aucune voix, musique, ambiance ou effet sonore. Aucune synchronisation audio/vidéo évaluée. Le reste du chapitre 3, les autres chapitres et la fin ne sont pas jouables ; leurs intentions sont conservées dans le document de campagne. Le journal global, l’aide facultative aux hotspots dans l’export normal et les canaux de volume séparés restent des besoins de production. L’éditeur natif et les configurations mobiles n’ont pas passé d’acceptation complète pour ce projet.

Durée livrée : **non mesurée**. Les 53 heures principales, 8–12 heures facultatives et 6–10 heures de rejouabilité sont uniquement des budgets de conception. Il n’existe pas de campagne complète ni de preuve de 50 heures. Aucun minimum matériel ou résultat de performance FMV n’est revendiqué.

## Sources et provenance

Les sources de contenu, le compilateur d’authoring vers le schéma natif, les scripts de build et les tests figurent dans `sources`. Les scripts de dialogue et textes visibles sont éditables dans `content.mjs` et dans les JSON du projet. Aucun fichier de sous-titres minuté n’existe puisque les prises audio/vidéo sont absentes.

`production/ASSETS.json` conserve les générations initiales. `PIN-INTEGRATION-EDITS.json` ajoute les deux états avec goupille et remplace la version du fond `sluice-drained`. `evidence/media-manifest.json` donne les fichiers effectivement intégrés, dimensions, poids et SHA-256. Images créées avec l’outil ImageGen intégré ; pas de photographies de stock ni d’imitation demandée d’un acteur réel. Les prompts finaux et références sont conservés. Les chemins originaux servent à la traçabilité ; tous les fichiers nécessaires sont déjà dans l’archive.

Création et production pour Patrice avec Codex ; moteur MAGE2. Le dépôt moteur examiné ne comporte pas de fichier LICENSE de premier niveau : ce paquet de travail local ne prétend donc pas concéder de nouveaux droits de redistribution du moteur. Les poids LTX envisagés ne sont ni utilisés dans les médias livrés ni inclus. Voir la bible pour le relevé de licence et les limites de la chaîne envisagée.

Pour reconstruire dans le dépôt MAGE2 à la révision indiquée, placer `sources/games/the-last-kindness` sous `games`, les scripts sous `scripts`, puis copier les quatorze PNG de `editable-project/media` vers `output/the-last-kindness/source-media`. Exécuter `npm run build:packages`, `node games/the-last-kindness/build.mjs`, puis les tests. Pour réexporter avec l’application, ouvrir le projet et utiliser Export web. L’intégration automatisée suppose que les ressources du paquet MAGE2 release existent au chemin attendu dans le test.

Les deux copies opérationnelles de médias — projet éditable et export autonome — sont intentionnelles. Aucun modèle, cache de navigateur, dépendance `node_modules` ou application Electron complète n’est inclus. Aucun correctif moteur séparé n’est fourni puisqu’aucun fichier moteur n’a été modifié.
