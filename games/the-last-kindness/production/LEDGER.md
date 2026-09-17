# Registre de production — 17 septembre 2026

**Statut global : point de contrôle inachevé. Porte de qualité FMV non franchie. Aucun chapitre approuvé.**

Une ligne planifiée n’est pas du contenu livré. Les 53 heures du document de campagne constituent un budget de conception, sans mesure de durée. Aucun temps de jeu humain validé n’est disponible.

| Élément | Conçu | Écrit | Implémenté / intégré | Testé | Approuvé |
| --- | --- | --- | --- | --- | --- |
| Chapitres 1–2 | Trame uniquement | Non | Non | Non | Non |
| Chapitre 3 complet | Trame uniquement | Partiel | Passage ci-dessous seulement | Pas de chapitre complet | Non |
| Saint-Orme : sauvetage et hydraulique | Oui, passage borné | Oui, français | Cinq lieux ; deux voies ; inventaire ; états visuels ; registre | Logique native et deux parcours web ; éditeur incomplet | En cours d’essai utilisateur |
| Chapitres 4–13 | Trames différenciées | Non | Non | Non | Non |
| Chapitre 14 et fin imposée | Contrat dramatique ; esquisse du départ | Esquisse uniquement | Non | Non | Non |
| 12 fonds fixes + 2 objets | Bible initiale | Prompts conservés | 14 images distinctes ; 15 références de rôle MAGE2 | Inspection visuelle et hachages | Non ; retours intégrés ci-dessous |
| Conversations interprétées / FMV | Quatre ensembles de couverture prévus | Direction initiale | Aucune vidéo | Non | Non |
| Voix / synchronisation | Notes de casting et prononciation | Textes du passage | Aucun enregistrement | Non | Non |
| Musique / ambiances / bruitages | Intentions initiales | Non | Aucun fichier audio | Non | Non |
| Mixeurs distincts / journal global / aide aux hotspots | Besoins identifiés | Sans objet | Pas d’extension moteur | Non | Non |
| Export et archive | Format officiel | Instructions incluses | Projet natif et export MAGE2 | Voir DELIVERY.md et preuves | Point de contrôle uniquement |

Fichiers faisant foi : `content.mjs`, `native-authoring.mjs`, les sept fichiers du projet éditable et `evidence/media-manifest.json`. Les 147 nœuds exportés incluent des reprises de conversations compilées ; leur nombre n’indique ni une durée ni 147 échanges uniques.

## Retours utilisateur traités pendant le premier essai

| Retour | Correction | Vérification | État |
| --- | --- | --- | --- |
| Goupille mal intégrée au décor | Trois retouches ImageGen, états de scène natifs ; suppression de l’icône posée sur l’axe | Test de sauvegarde/revisite et captures du lecteur réel | Corrigé techniquement, nouvel avis utilisateur attendu |
| Sortie des archives décalée sur la table | Zone déplacée dans l’ouverture visible, coordonnées normalisées x=.12, y=.035, largeur=.14, hauteur=.50 | Clic réel dans la porte à x=.19/y=.30 de l’image | Corrigé techniquement, nouvel avis utilisateur attendu |
| Essais réguliers demandés | Lien local maintenu, corrections au même point de contrôle | L’utilisateur a déjà transmis deux annotations | Poursuivre par petits lots reviewables |

Correction découverte durant la vérification : les libellés des brancards et lits vides partageaient une clé. Les clés sont maintenant propres à chaque état de scène, avec test de régression. Le nom de l’étai a également été corrigé.

## Ordre de dépendance pour la suite

1. Retours sur ce passage : lisibilité des cibles, logique des deux voies, intérêt des personnages.
2. Résoudre le démarrage/commande du test natif et l’incident de nettoyage du banc Hyper-V, puis refaire une acceptation complète de l’éditeur isolé. Aucun repli de test sur le PC physique.
3. Prouver une chaîne locale de performances animées et de voix expressives, avec droits vérifiés sur les modèles exacts. Les erreurs d’outillage ComfyUI et le budget mémoire restent non résolus ; aucune sortie LTX n’est livrée.
4. Ajouter le son, le mixage séparé, les sous-titres synchronisés et la parité des états lors d’un saut de vidéo. Faire essayer cette section avant de produire la campagne en volume.
5. Développer puis jouer les chapitres complets, mesurer le rythme et la durée réelle. La campagne ne peut être déclarée terminée à partir du registre ou des tests automatisés.
