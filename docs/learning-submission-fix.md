# Soumission et préparation des cours

Le bouton utilise uniquement `useFormStatus().pending`. Aucun état permanent ne
désactive le bouton dans son événement de clic. Les erreurs métier reviennent
dans Comprendre, Réviser (avec la durée choisie) ou Devoir. Une erreur de transport
affiche une récupération explicite du formulaire, sans répéter la Server Action.

La génération OpenAI et son audit partagent un seul signal d'expiration, ainsi
que leurs lectures de corps HTTP. `LLM_REQUEST_TIMEOUT_MS` reste compris entre
5 000 et 300 000 ms, avec 120 000 ms par défaut. Le délai ne couvre pas l'extraction
locale ni les opérations Prisma. Un échec avant la transaction ne publie aucun
projet, version ou activité. Un abandon côté application ne garantit pas l'absence
de facturation du fournisseur ; aucun test réel payant n'est exécuté ici.

En l'absence de passages vérifiés, la soumission prépare le texte localement et
reprend l'activité. Les extractions déjà présentes sont conservées. Un verrou
transactionnel PostgreSQL par compte et document empêche deux extractions
simultanées, y compris depuis deux processus. Un clic concurrent reçoit un
message récupérable ; il n'est jamais relancé automatiquement. La lecture reste
bornée par son worker (30 secondes), la transaction (40 secondes), la taille et
le nombre de pages existants. Une sortie du worker sans résultat rejette aussi
la promesse, même avec un code de sortie nul.

Les activités utilisent les passages vérifiés. Les pages `needs-vision` ne les
bloquent pas et ne déclenchent aucun appel externe. La reconnaissance visuelle
reste une action distincte : choix de pages et consentement explicite. La page
affiche « Cours prêt » dès qu'un passage vérifié existe ; la validation de chaque
activité peut toujours refuser un exercice insuffisamment étayé. Les compteurs,
méthodes et qualités figurent dans « Détails techniques ».

Les traces JSON `scope=course-learning` contiennent uniquement un UUID aléatoire
de corrélation, événement, phase, durée cumulée et code d'erreur autorisé. Phases :
`action-start`, `generation-start`, `generation-end`, `audit-start`, `audit-end`,
`transaction-start`, `done`, `failed`. Le cache évite les phases provider ; le
provider simulé n'effectue pas d'audit externe. Les erreurs brutes et données des
comptes/documents ne sont jamais passées au logger. Aucun changement de schéma
ni migration nouvelle n'est nécessaire.

## Vérification reproductible

Configurer `LOT2_TEST_DATABASE_URL` et `AUTH_TEST_DATABASE_URL` vers une base
jetable validée par `tests/helpers/lot2-environment.mjs` : PostgreSQL sur
`127.0.0.1`, port dédié supérieur à 1024 différent de 5432, utilisateur
`lot2_audit`, base `lot2_full`. Installer les migrations **existantes uniquement
sur cette base jetable**, puis exécuter :

```text
npm test
npm run typecheck
npx prisma validate
npm run db:generate
npm run build
node --experimental-strip-types --test tests/e2e/learning-submit-browser.mjs
git diff --check
```

Le scénario navigateur utilise Playwright disponible localement (paquet
`playwright`, ou chemin du paquet dans `PLAYWRIGHT_MODULE`).
`PLAYWRIGHT_CHANNEL=msedge` permet d'utiliser Edge installé ; sinon Chromium est
requis. `LEARNING_E2E_PORT` vaut 3317 par défaut. Le script démarre son propre
serveur de build de production sur loopback, impose `LLM_PROVIDER=mock`, ferme
OCR/TTS/recherche/inscriptions et vide les clés LLM/TTS/OCR du processus. Il crée
des documents et comptes synthétiques, puis supprime uniquement ses données,
son stockage temporaire et son processus. Les autres services restent actifs.

Les tests couvrent les quatre points d'expiration (fetch/corps de génération et
d'audit), l'absence de relance, l'absence de publication après audit interrompu,
la concurrence et l'isolation PostgreSQL, puis six scénarios de navigateur réel
sur écran mobile : soumission avec réponse retardée, état du cours, erreurs des
trois parcours, coupure réseau, consentement et isolation/confidentialité.

## Résultats de validation de la branche

- `npm test` : 118 tests réussis, aucun échec ou test ignoré, dont les cinq tests
  PostgreSQL sur une instance 18-alpine jetable et les tests du worker sans résultat.
- Navigateur Edge sans interface, viewport 390 × 844 : six scénarios réussis
  (sept tests comptés par Node avec le test parent), aucun échec ou test ignoré.
- TypeScript, validation Prisma, génération Prisma, build Next.js et
  `git diff --check` : réussis.
- Bundles client : aucun des identifiants serveur contrôlés (`DATABASE_URL`,
  `LLM_API_KEY`, `LLM_REQUEST_TIMEOUT_MS`, `SOURCE_STORAGE_ROOT`,
  `SOURCE_UPLOAD_MAX_BYTES`, `passwordHash`, `tokenHash`, `storageKey`) ni trace
  serveur d'apprentissage.
- Les appels OpenAI/OCR/TTS sont simulés. Ces contrôles ne mesurent pas la latence
  ni la facturation réelles d'un fournisseur en production.

## Fichiers du correctif

- `app/courses/[id]/page.tsx`
- `app/courses/[id]/understand/page.tsx`
- `app/courses/[id]/revise/page.tsx`
- `app/courses/[id]/homework/page.tsx`
- `app/courses/[id]/reading/[extractionId]/page.tsx`
- `app/courses/learning-actions.ts`
- `app/courses/error.tsx`
- `components/learning-submit.tsx`
- `components/learning-ui.tsx`
- `lib/courses/document-reader.ts`
- `lib/courses/learning-service.ts`
- `lib/courses/learning-trace.ts`
- `lib/providers/llm/course-provider.ts`
- `tests/course-learning.test.mjs`
- `tests/learning-preparation-database.test.mjs`
- `tests/e2e/learning-submit-browser.mjs`
- `docs/learning-submission-fix.md`
