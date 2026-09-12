# Génération adaptée aux activités

Les contrats envoyés au modèle sont propres à chaque activité. Le format JSON interne des anciennes versions reste lisible ; aucun changement Prisma n'est nécessaire. Les productions déjà enregistrées restent consultables et leur cache est conservé.

| Activité | Contrat demandé | Plafond de génération (`max_output_tokens`) |
| --- | --- | ---: |
| explain | 1–3 blocs courts et citations | 2400 |
| summary | 1–2 blocs courts et citations | 1800 |
| essential | 1–3 repères courts et citations | 2000 |
| visual | représentation, alternative textuelle et citations | 4000 |
| quiz, gap, order | questions du type choisi, réponses, explications et citations | 5000 |
| mix | questions des types pertinents, réponses, explications et citations | 6500 |
| homework | reformulation, question de compréhension, deux indices, correction protégée et citations | 5500 |

Les blocs simples sont limités à 450 caractères avec une ou deux citations exactes de 500 caractères maximum. Le schéma `explain` ne demande aucune question, correction, donnée de devoir ou donnée visuelle. Les champs étrangers au contrat sont ignorés puis supprimés avant validation, audit et enregistrement. Les réponses attendues et corrections restent dans les versions côté serveur ; les vues d'activité conservent leurs restrictions avant tentative.

La correction d'un devoir exige désormais une tentative, même si une ancienne session porte `correctionRequested=true`. Le bouton de révélation avant tentative est remplacé par une invitation à essayer ; l'action serveur refuse également une demande directe prématurée. Le test navigateur vérifie l'absence des réponses et corrections dans le HTML avant tentative, puis leur présence après réponse.

## Budget et appels

Un signal unique couvre les deux appels HTTP et la lecture de leurs corps. Le délai reste configurable, avec 120 000 ms par défaut ; l'audit ne reçoit pas un nouveau délai. Aucune relance automatique. Une requête échouée ou interrompue n'est pas publiée.

Pour les productions non évaluatives et leur audit, `reasoning.effort=low` et `text.verbosity=low` sont envoyés uniquement à la liste explicite `gpt-5`, `gpt-5-mini`, `gpt-5-nano` et leurs versions `2025-08-07`. Les autres modèles conservent leurs paramètres. Le modèle configuré n'est jamais remplacé.

Les [documents OpenAI de GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini) et le [guide GPT-5](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2) décrivent Responses, les sorties structurées et ces paramètres. Le [paramètre max_output_tokens](https://developers.openai.com/api/reference/cli/resources/responses/methods/create) inclut le raisonnement et le texte visible. Les plafonds ci-dessus sont des choix conservateurs pour ces petits contrats, pas des minima mesurés : aucun appel réel n'a été effectué pour les calibrer. Une sortie tronquée est refusée avec `INVALID_STRUCTURE`.

Un parcours réel réussi nécessite **deux appels** : génération puis audit. Un rejet déterministe n'en fait qu'un ; une production en cache n'en fait aucun. L'audit non évaluatif est limité à 1600 jetons, avec une décision booléenne par élément. L'audit évaluatif conserve son plafond antérieur de 6500 jetons et ses paramètres de raisonnement, afin de ne pas affaiblir sa vérification.

L'audit n'est pas redondant : « la graine ne germe pas en 3 jours » contient les mêmes nombres et peut citer exactement « la graine germe en 3 jours ». Les contrôles déterministes seuls acceptent cette contradiction. Le test simulé documente ce cas. Supprimer l'audit pour une explication reformulée ne serait donc pas sûr. L'audit reste lui-même une vérification probabiliste, sans garantie absolue de fidélité.

## Validation et erreurs

Seuls les passages vérifiés issus du cours chargé avec son propriétaire sont admis. Chaque bloc non évaluatif vérifie sa structure, les identifiants de passage, les citations exactes et les nombres. Un bloc invalide est retiré. L'audit contrôle ensuite la fidélité sémantique de chaque élément restant. Un visuel perd aussi les descendants d'un parent retiré, puis ses indices sont remappés. Un élément visuel isolé devient une alternative textuelle. Aucun élément refusé n'est affiché. Si rien n'est exploitable, rien n'est enregistré.

Une omission est signalée par « Certains éléments ont été écartés. Voici ceux que nous avons pu vérifier. ». Les évaluations et devoirs restent soumis au rejet intégral, y compris l'audit des réponses, distracteurs, ordres, relations et indices.

Les codes nettoyés distinguent `INVALID_STRUCTURE`, `UNKNOWN_CITATION`, `QUOTE_MISMATCH`, `UNVERIFIABLE_NUMBER`, `NO_USABLE_BLOCKS`, `AUDIT_REJECTED`, `TIMEOUT` et `SOURCE_UNUSABLE`. Une production rejetée affiche un message de vérification de la génération, sans conseiller de relire un cours déjà exploitable. Une insuffisance réelle de lecture conserve son propre message.

Les traces n'acceptent que l'activité, les phases, les codes de la liste fermée, les nombres d'éléments, durées, compteurs et un identifiant aléatoire sans lien avec les comptes. Les comptes reçus sont additionnés entre appels et conservés dans les colonnes existantes de `ProviderUsage`, même si la validation, l'audit ou la publication échoue. Le statut reste `FAILED` ; aucun contenu généré n'est stocké dans cette ligne. Un compteur absent reste inconnu (`null`), pas une preuve d'absence de facturation. Une réponse jamais reçue ne permet pas de connaître la consommation exacte. L'historique des tentatives remplacées par une nouvelle tentative conserve le comportement existant.

## Vérification sans consommation réelle

Les tests utilisent des réponses HTTP simulées, des documents synthétiques et, pour PostgreSQL, une base locale jetable explicitement fournie. Ils couvrent les contrats, les rejets partiels et stricts, l'audit sémantique, les corps bloqués, le budget commun, les compteurs après échec, l'isolation, la confidentialité des traces et les messages affichés dans le navigateur. Aucune mesure de latence en production ni validation par un provider réel n'est revendiquée.

Résultats de cette livraison : `npm test` 131 réussis, 0 échec, 0 ignoré ; navigateur Chromium/Edge 9 réussis (8 sous-tests et leur test parent), 0 échec, 0 ignoré. `npm run typecheck`, `npx prisma validate`, `npm run db:generate`, `npm run build` et `git diff --check` réussissent. Le contrôle des 41 bundles JavaScript client ne trouve aucun des marqueurs serveur sensibles recherchés, ni les valeurs sensibles locales comparées en mémoire. Les tests Node émettent leur avertissement préexistant sur le type de module, sans échec.

PostgreSQL 18 a été lancé uniquement dans un nouveau conteneur jetable, lié à l'interface locale et stocké en mémoire. Les sept migrations existantes y ont été appliquées pour les tests, sans migration nouvelle ni accès à une base de production. Ce conteneur a ensuite été supprimé ; Docker Desktop et les conteneurs préexistants sont restés actifs.

## Fichiers de la livraison

- `lib/courses/activity-contract.ts` : contrats propres aux activités et filtrage par élément.
- `lib/courses/learning-contract.ts` : validation commune, codes précis et indicateur d'omission facultatif.
- `lib/courses/learning-errors.ts` : erreurs nettoyées et compteurs associés.
- `lib/courses/learning-service.ts` : compteurs après échec et protection de la correction.
- `lib/courses/learning-trace.ts` : métadonnées techniques autorisées.
- `lib/providers/llm/course-provider.ts` : requêtes adaptées, plafonds et audit par élément.
- `app/courses/learning-actions.ts` : classification des erreurs et activité dans les traces.
- `components/learning-ui.tsx` : message de rejet de génération.
- `app/courses/[id]/content/[versionId]/page.tsx` : indication sobre des éléments écartés.
- `app/courses/[id]/session/[sessionId]/page.tsx` : correction uniquement après tentative.
- `tests/grounded-generation.test.mjs` : contrats, filtrage, audit, budget et consommation simulée.
- `tests/course-learning.test.mjs` : régressions des validations et appels simulés.
- `tests/course-learning-database.test.mjs` : tentative requise avant correction.
- `tests/learning-preparation-database.test.mjs` : compteurs conservés après rejet, sans publication.
- `tests/e2e/learning-submit-browser.mjs` : messages, omission et absence de réponses avant tentative.
- `docs/grounded-learning-generation.md` : décisions, limites et vérifications.
