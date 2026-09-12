# Citations exactes à partir des preuves du cours

Les modes `explain`, `summary` et `essential` utilisent un catalogue en mémoire,
recalculé à partir du snapshot chargé par `ownedCourse(userId, courseId)`.
Les passages incertains et les pages `needs-vision` sont exclus. Aucune nouvelle
lecture de fichier, extraction, table, migration ou autorisation OCR n'est nécessaire.

## Segmentation et propriété

`lib/courses/evidence.ts` repère ponctuation, retours de ligne, listes et marqueurs
explicites `Question :`, `Réponse :`, `Définition :`, `Date :` et `Cours :`.
Chaque segment conserve son passage, ses offsets UTF-16 `start` et `end`, son texte
original et une catégorie locale (`course`, `answer`, `question`, `mixed`).
L'identifiant est un condensat déterministe de la version de segmentation, de l'ID
du passage, de son texte et de ses offsets. Aucun condensat n'est une autorisation :
seule l'appartenance au catalogue reconstruit pour la requête authentifiée l'est.

Le catalogue est limité à 96 segments de 400 caractères, à partir d'au plus
60 000 caractères. Les réponses, définitions et repères chiffrés sont prioritaires.
Les doublons textuels sont retirés. Les questions et leurs continuations restent
exclues jusqu'à un marqueur explicite de réponse ou de cours. Une coupure due à la
limite de longueur produit un fragment mixte, inutilisable comme preuve factuelle.
Les sources et leurs offsets restent inchangés, notamment pour les anciennes versions.

## Contrat du provider

Le premier appel reçoit seulement les segments autorisés (ID, texte, catégorie).
Il retourne des blocs avec `segmentIds`, sans citation recopiée, ID de passage ou
offset. Le serveur refuse tout identifiant inconnu, y compris celui d'un autre
compte ou cours, et reconstruit `quote = passage.text.slice(start, end)`.
La validation des nombres et la validation bloc par bloc restent actives.
Deux citations du même passage restent enregistrées séparément.

Pour `explain`, deux blocs au minimum sont demandés dans le schéma lorsqu'au moins
deux segments factuels distincts existent ; le plafond reste trois. Les instructions
privilégient les idées distinctes et interdisent les réponses inventées. Les doublons
textuels sont écartés localement ; l'audit vérifie aussi les répétitions sémantiques.
Un seul bloc peut subsister après les rejets : le code `LOW_EVIDENCE_COVERAGE` trace
alors seulement le nombre de preuves et de blocs, sans leur contenu ni identifiant.

Le deuxième appel d'audit est conservé, sous le même budget de 120 secondes.
Il reçoit uniquement les éléments déjà validés et leurs citations exactes, jamais
les passages complets non utilisés. Les quiz et devoirs conservent leur contrat
et leurs refus stricts. Aucun troisième appel ni tentative automatique de réparation.

La version de cache `evidence-1` permet d'utiliser la nouvelle méthode lors d'une
demande explicite sur un cours déjà enregistré. Elle ne modifie ni ne régénère
les anciennes productions. Les appels suivants réutilisent la nouvelle version.

## Navigation et vérification

Le parcours existant émet `done`, revalide la page de cours et redirige vers le
résultat. Les contrôles navigateur utilisent un serveur de production local, un
provider mock, des documents synthétiques et PostgreSQL jetable. Le test mesure
le délai entre la réception locale de la trace `done` et la visibilité des deux
blocs, avec un seuil de 5 secondes ; il vérifie le nombre de requêtes et l'absence
de débordement à 390 et 320 px. Cette mesure inclut le transport local et React,
mais n'est pas une mesure de latence en production. Aucun identifiant métier ni
contenu n'est ajouté aux traces de mesure et aucun système de télémétrie n'est créé.

Tests dédiés : `evidence-segmentation.test.mjs`, `evidence-database.test.mjs`,
`grounded-generation.test.mjs`, `course-learning.test.mjs` et
`e2e/learning-submit-browser.mjs`. Les tests PostgreSQL exigent une URL explicite
validée par `tests/helpers/lot2-environment.mjs` ; les appels OpenAI sont interceptés.

## Limites

La classification locale n'est pas une compréhension sémantique du document. Les
pages dont les marqueurs ou la structure ont été perdus peuvent fournir moins de
preuves. La présence de plusieurs segments ne prouve pas autant d'idées distinctes :
l'audit reste nécessaire et peut ne conserver qu'un seul bloc. Aucun assouplissement
des contrôles ne garantit deux ou trois blocs lorsque les preuves sont insuffisantes.
Les conversions d'unités ne sont pas déduites localement ; la validation numérique
existante et l'audit sont conservés. Les pages-images restent proposées séparément,
avec consentement explicite, sans bloquer les passages déjà lisibles.

## Vérifications de livraison

Le 12 septembre 2026 : 138 tests du dépôt réussis, aucun ignoré, avec PostgreSQL
jetable ; 10 tests navigateur réussis. Dernière mesure locale après `done` : 41 ms,
un POST et aucun GET additionnel de la page de résultat. Typecheck, Prisma validate,
génération du client Prisma, build et vérification des espaces Git réussis. Les
bundles client ne contiennent aucun des marqueurs serveur sensibles recherchés.
Les sept migrations existantes ont été appliquées uniquement à la base jetable.

Fichiers du lot :

- `lib/courses/evidence.ts`
- `lib/courses/activity-contract.ts`
- `lib/courses/learning-service.ts`
- `lib/courses/learning-trace.ts`
- `lib/providers/llm/course-provider.ts`
- `app/courses/[id]/content/[versionId]/page.tsx`
- `tests/evidence-segmentation.test.mjs`
- `tests/evidence-database.test.mjs`
- `tests/grounded-generation.test.mjs`
- `tests/course-learning.test.mjs`
- `tests/e2e/learning-submit-browser.mjs`
- `docs/course-evidence.md`
