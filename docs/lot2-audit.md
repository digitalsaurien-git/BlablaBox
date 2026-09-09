# Audit du Lot 2 — bibliothèque de cours

Audit exécuté le 9 septembre 2026 sur la branche
`codex/course-library-foundation`, à partir du commit
`096bc47ed9dc888285387ffe95516b7354597cd6`.

## Périmètre vérifié

- migration complète depuis une base PostgreSQL vide ;
- upgrade depuis les cinq migrations antérieures, avec deux comptes, leurs
  projets et un projet historique sans propriétaire ;
- contraintes composites, index et refus SQL des relations intercomptes ;
- versions d'ordre, tri naturel et écritures concurrentes ;
- réception bornée, validation PDF/ODT, déduplication et stockage atomique ;
- parcours HTTP réel à deux comptes, téléchargements et régressions du Lot 1 ;
- affichage et navigation clavier à 320, 375 et 768 pixels ;
- tests, typecheck, validation/génération Prisma, build et scan du bundle client.

## Résultats

Les six migrations s'appliquent depuis une base vide et Prisma considère le
schéma à jour. L'upgrade applique d'abord les cinq migrations précédentes, puis
le Lot 2 ; les trois projets synthétiques restent identiques. Les 19 clés
étrangères sont validées et les index attendus existent. Neuf tentatives SQL de
relations incohérentes entre comptes sont refusées par PostgreSQL.

Le scénario HTTP crée quatre parties, trie `4.1`, `4.2`, `4.10`, ne crée aucun
chapitre implicite et conserve l'identifiant d'une partie « Document attendu »
lors du rattachement. Son état maximal contient six `SourceAsset`, huit
`SourceImport`, quatre `SourcePlacement` et exactement six fichiers physiques.
Onze écritures intercomptes sont refusées ; les consultations et téléchargements
étrangers répondent `404`, et les frontières anonymes répondent `307` ou `401`.

Deux imports simultanés du même contenu et du même compte créent un original,
deux traces et un fichier. Une réponse de commit perdue conserve l'original puis
le reconnaît comme doublon. Les rollbacks avant et après publication, les
collisions de nom interne et l'indisponibilité pendant la réconciliation sont
testés. La procédure opérateur et ses limites sont dans
`docs/course-source-storage.md`.

La suite finale exécute 91 tests : 91 réussis, aucun échec, aucun ignoré. Le
typecheck, `prisma validate`, `prisma generate`, le build de production et
`git diff --check` réussissent. Le scan de `.next/static` ne retrouve aucune des
valeurs sensibles recherchées.

Les fixtures PDF, ODT et MP3 sont entièrement synthétiques. Aucune base réelle,
aucun document pédagogique réel, aucun provider payant et aucun déploiement ne
sont utilisés par cet audit.
