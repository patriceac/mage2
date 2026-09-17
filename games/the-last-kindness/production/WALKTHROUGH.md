# Saint-Orme — solution du passage actuellement jouable

Ce document dévoile les solutions. Il décrit uniquement le passage livré, pas le chapitre 3 complet ni la campagne prévue.

## Prise en main

Cliquer les portes et les objets visibles. Le sac en bas à gauche ouvre l’inventaire : sélectionner un objet, puis sa cible dans le décor. Tab permet de parcourir les interactions ; Entrée active le bouton sélectionné. Le registre posé sur la table de l’infirmerie conserve les faits et donne des indices sur demande. Menu permet de sauvegarder, charger et modifier les réglages. Les libellés de l’interface suivent la langue du navigateur ; les dialogues de ce passage sont français.

## Objectifs communs

1. Entrer dans l’infirmerie et parler à Ondine. Elle veut évacuer ses patients et refuse d’être simplement escortée à l’abri.
2. Au moulin, prendre l’étai de chêne posé devant Maël. Le sélectionner dans l’inventaire, puis cliquer la passerelle brisée du cloître. L’objet est consommé et le décor montre la réparation.
3. Parler à Sabine dans l’infirmerie après cette réparation. Elle prépare les porteurs.
4. Revenir au cloître. Tirer une première fois la corde sous la cloche : les porteurs se mettent en place. Tirer une seconde fois : ils traversent. Une interruption entre les deux signaux est sans danger et peut être sauvegardée. Les lits seront désormais vides.

On peut explorer les archives et préparer une solution hydraulique avant ou après ces objectifs. Il n’y a ni délai imposé ni attente obligatoire.

## Solution A — préserver le moulin

Lire le plan sur la table des archives. Prendre la goupille de bronze. Au local des vannes, la sélectionner puis cliquer le logement de l’axe du grand volant à gauche. La goupille disparaît de l’inventaire ; son extrémité est intégrée au nouveau décor.

Actionner la vanne d’admission avec le volant de gauche. Lorsque les patients sont évacués, ouvrir l’exutoire de droite. Le niveau baisse ; le moulin et son grain sont conservés. Revenir auprès d’Ondine pour le bilan. Une conversation facultative permet ensuite de parler des rêves ; sa réponse ne confond pas rêve et relation acquise.

## Solution B — dévier l’eau et assumer la perte

Lire la réquisition cachetée à droite de la table des archives. Sa date contredit l’autorité invoquée. Parler du déversoir à Maël, reconnaître la perte qu’il subirait et demander son accord. Après l’évacuation, actionner le levier à droite du moulin.

L’eau envahit les sacs. Maël et Ondine réagissent à cette conséquence ; le registre conserve la dette. Cette solution ne demande pas de prendre la goupille. L’accord de Maël n’oblige pas à sacrifier le moulin : une réparation reste possible tant que le déversoir n’a pas été actionné.

## États, refus et reprise

| Action | Prérequis / indice | Effet ou refus | Reprise |
| --- | --- | --- | --- |
| Étayer | Étai au moulin ; Ondine indique le besoin | Consomme l’étai, change le pont ; une goupille ne peut porter un brancard | Réparation persistante, pas de second objet gagné |
| Préparer les porteurs | Passerelle réparée, parler à Sabine | `evacuation_ready` | On peut quitter les lieux sans annuler la préparation |
| Sonner | Porteurs et passerelle prêts | Premier signal : `bell_stage=1`. Second : `evacuated=true` | Sauvegarde native entre les signaux ; répéter après ne réécrit pas l’issue |
| Ajuster la goupille | Pièce des archives | Consomme la pièce, `pin_fitted=true`, décor correspondant | Persiste après retour et chargement ; la pièce n’est plus proposée |
| Fermer l’admission | Goupille installée | `intake_closed=true` ; sans pièce, le volant ne transmet pas l’effort | Peut être fait avant l’évacuation, sans débloquer prématurément l’exutoire |
| Ouvrir l’exutoire | Admission fermée et évacuation achevée | `water_route=repair`, `resolved=true` | Une seconde manipulation ne change pas la voie choisie |
| Obtenir l’accord | Réquisition lue, dialogue avec Maël, dette reconnue | `owner_consent=true` | Aucun objet consommé ; on peut encore choisir de réparer |
| Ouvrir le déversoir | Accord et évacuation | `water_route=divert`, grain perdu, issue persistante | Sans accord ou avec patients présents : refus ; aucun état irréversible appliqué |

Les états sont des variables déclarées du moteur. Les conversations, l’inventaire et les conséquences utilisent ses sauvegardes normales. Aucun échec de manipulation ne détruit un objet nécessaire. La seule perte volontaire est celle du moulin sur la voie B.

## Indices progressifs disponibles dans le registre

| Problème | Niveau 1 | Niveau 2 | Niveau 3 |
| --- | --- | --- | --- |
| Brancards | Soutenir le bois sans arrêter l’eau ; chercher un artisan de l’eau | Étai au moulin, passerelle, puis Sabine | Prendre et placer l’étai ; parler à Sabine ; sonner deux fois |
| Vannes | Le volant manque de liaison ; consulter les écrits au sec | Plan et goupille aux archives ; admission avant exutoire | Prendre et placer la pièce ; fermer à gauche ; évacuer ; ouvrir à droite |
| Autre voie | Ancien passage d’eau au moulin ; respecter le propriétaire | Réquisition et date ; discussion avec Maël | Lire la preuve ; reconnaître la perte ; évacuer ; actionner le déversoir |

Chaque niveau est demandé explicitement. Fermer les indices conserve la partie sans résoudre le puzzle à la place du joueur.
