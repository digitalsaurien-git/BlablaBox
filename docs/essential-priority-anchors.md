# Repères prioritaires de « L’essentiel à retenir »

## Diagnostic local

Le test historique utilisait une phrase déclarative précédée de `Cours :`.
La reproduction synthétique d’un PDF aplati commence par des questions et une
consigne, puis contient `espèces Toumai Dates 7 Ma`. Avant correction, le contexte
« question » persistait sur cette réponse faute de balise `Réponse :`. Le test
de reproduction a été exécuté et a échoué avant la modification du segmenteur.
Par ailleurs, les anciens `keyFacts` étaient des recommandations : aucune
contrainte ne garantissait leur présence dans les cartes finales.

## Reconnaissance prudente

Le segmenteur reconnaît des paires explicites de cellules libellées, avec un
seul terme et une seule valeur, et des formes compactes nom propre / mesure.
Il conserve les positions et le texte original pour les citations. Les accents
sont ignorés pour comparer les repères, jamais pour réécrire les preuves.
Les lignes libellées complètes peuvent être des réponses après une question ;
les options interrogatives et les listes de plusieurs noms/dates sans paires
explicites restent exclues. Une simple cooccurrence dans une phrase ne suffit
pas : une association nom/date demande une relation explicite.

Cette lecture reste volontairement bornée. Elle ne reconstruit pas la géométrie
d’un tableau, ne choisit pas entre des colonnes ambiguës et ne lance aucun OCR.
Les repères non reconnus ne sont pas inventés. Aucun nom particulier n’est codé
dans l’algorithme ; l’écriture originale, dont `Toumai`, peut rester affichée.

## Contrat serveur

Avant l’appel, `essentialPlan` construit jusqu’à trois emplacements à partir
des seuls passages vérifiés de l’instantané du cours possédé. Les associations
explicites et notions définies passent avant les autres repères ; la diversité
des catégories puis la pertinence départagent les candidats. Les mêmes repères
sans/avec accents ne créent pas plusieurs emplacements.

Le modèle reçoit les emplacements, leurs identifiants, preuves, termes et
valeurs requis. Il doit retourner exactement une carte par emplacement.
Le serveur vérifie les identifiants, l’unicité, la couverture, les termes, les
nombres et unités, puis reconstruit les citations. L’audit sémantique existant
reste obligatoire. Si un emplacement est omis, mal vérifié ou refusé par l’audit,
la production essential échoue sans publication partielle ni relance automatique.
Les autres parcours conservent leur politique de validation existante.

Il y a au maximum deux appels : génération et audit. Les emplacements restent
éphémères côté serveur ; ils ne sont ni persistés ni envoyés au client. Les
versions du contrat de preuves et du cache changent pour que les anciennes
productions ne masquent pas le nouveau comportement. Aucune donnée existante
n’est réécrite.

## Vérification sans provider réel

- Reproduction désordonnée, accents, ponctuation absente, ambiguïtés, matières,
  diversité, déterminisme, citations, refus des substitutions/omissions.
- PostgreSQL jetable : instantanés inchangés, isolation cours/comptes, cache et
  priorité persistée après génération et audit simulés.
- Navigateur avec PostgreSQL et provider mock : carte prioritaire visible,
  citation originale, écran de 320 px, aucune réponse attendue exposée avant la
  tentative, récupération après erreur et isolation HTTP.
- Suite complète, typecheck, Prisma validate/generate, build, diff et bundles.

Aucune migration de schéma n’est ajoutée. Les migrations existantes ne sont
appliquées qu’à la base jetable des tests. Aucun accès à la production ni appel
OpenAI, OCR ou TTS réel n’est nécessaire.
