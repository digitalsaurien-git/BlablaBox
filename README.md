# BlablaBox

BlablaBox est une application Next.js mobile-first qui transforme une question ou un sujet en contenu pédagogique lisible et écoutable.

## État fonctionnel

Le dépôt contient désormais le parcours **Comprendre & écouter** :

- demande libre ;
- réponse de type explication, histoire, révision ou réponse rapide ;
- public, niveau, vocabulaire et adaptation pédagogiques ;
- politique de recherche `AUTO`, `NONE` ou `REQUIRED` ;
- recherche Web via la Responses API lorsque le provider OpenAI est activé ;
- conservation et affichage des sources ;
- génération MP3 via le `TTSProvider` existant ;
- lecteur et téléchargement ;
- bibliothèque compatible avec les anciens projets.

La bibliothèque, les pages projet et les fichiers audio sont protégés par un
compte local BlablaBox. Les mots de passe sont hachés avec scrypt et les sessions
opaques sont conservées côté serveur dans PostgreSQL. Les anciens projets sans
propriétaire ne sont visibles par aucun compte ordinaire.

`User` représente le compte propriétaire, pas un profil d'élève. Un futur modèle
`StudentProfile` pourra donc appartenir à un compte et être relié aux nouveaux
contenus sans modifier l'identité de connexion ni partager les ressources entre comptes.

Le parcours **Dicter & rédiger** est affiché comme prochain parcours, mais n'est pas encore implémenté.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- OpenAI Responses API et Web Search côté serveur
- OpenAI TTS côté serveur

## Providers

Par défaut, aucun appel payant n'est effectué :

```env
LLM_PROVIDER=mock
WEB_SEARCH_ENABLED=false
TTS_PROVIDER=disabled
```

Le staging fonctionnel utilisera explicitement :

```env
LLM_PROVIDER=openai
LLM_API_KEY=
LLM_MODEL=gpt-5-mini
WEB_SEARCH_ENABLED=true
TTS_PROVIDER=openai
TTS_API_KEY=
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=coral
TTS_MAX_SCRIPT_CHARACTERS=4096
TTS_SEGMENT_TARGET_CHARACTERS=3500
```

Le modèle LLM doit être confirmé comme compatible avec l'outil `web_search` avant l'activation staging. Les clés restent exclusivement dans les secrets Coolify et ne doivent jamais utiliser le préfixe `NEXT_PUBLIC_`.

## Versionnement contenu et audio

Chaque projet possède un `contentVersion`. Un MP3 n'est proposé que lorsque :

```text
audioContentVersion === contentVersion
```

et que le fichier existe réellement dans le stockage persistant. Les MP3 historiques sont conservés physiquement, mais ne sont pas considérés comme synchronisés tant qu'ils n'ont pas été régénérés avec ce mécanisme.

Un texte dépassant la limite d'un appel TTS est conservé intégralement en base et découpé automatiquement en segments d'environ `TTS_SEGMENT_TARGET_CHARACTERS` caractères. Les paragraphes puis les fins de phrase sont privilégiés. Tous les segments doivent réussir avant la publication de l'audio courant.

Le lecteur enchaîne les segments automatiquement. Pour un contenu segmenté, le téléchargement propose les MP3 numérotés dans l'ordre ; BlablaBox ne réalise aucune concaténation binaire MP3 fragile.

Les sources affichées proviennent uniquement des annotations réellement citées dans la réponse, sont dédupliquées, débarrassées des paramètres de tracking évidents et limitées à huit. Les marqueurs courts `[1]`, `[2]` sont construits par l'application et correspondent à la section structurée « Sources documentaires ».

## Installation et vérification locale

```bash
npm install
npm run db:generate
npx prisma validate
npm test
npm run build
```

Après application de la migration d'authentification, créer un compte depuis
`/register`, puis se connecter depuis `/login`. Aucun service d'e-mail ni fournisseur
d'identité externe n'est nécessaire pour ce lot.

En développement et en test, les inscriptions sont ouvertes par défaut. En production,
elles restent fermées tant que `REGISTRATION_ENABLED=true` n'est pas défini explicitement
côté serveur. `REGISTRATION_ENABLED=false` permet aussi de les fermer explicitement hors
production. Cette variable ne doit jamais être préfixée par `NEXT_PUBLIC_`.

Les tests mockent les réponses OpenAI et n'effectuent aucun appel payant.

## Migrations

Les migrations sont versionnées dans `prisma/migrations`.

En staging et production :

```bash
npm run db:migrate:deploy
```

Ne jamais utiliser `prisma migrate dev` sur une base distante de production. La migration du Lot A est additive et ne renseigne pas `audioContentVersion` pour les anciens projets.

La migration `20260907120000_add_accounts_and_sessions` est également additive :
elle ne modifie aucun projet existant et laisse les `userId` historiques inchangés.
La clé étrangère de propriétaire est validée pendant la migration. Avant de migrer une
base existante, l'opérateur doit vérifier que tous les projets historiques ont bien un
`userId` nul ; toute valeur non nulle doit être auditée, jamais corrigée automatiquement.
La procédure manuelle d'attribution ciblée est décrite dans
`docs/legacy-project-attribution.md` et ne doit jamais être exécutée en masse.

## Coolify

Le déploiement utilise Nixpacks avec :

```text
Build : npx prisma generate && npm run build
Start : npm run start
Port : 3000
Healthcheck : /api/health
```

La procédure production et la préparation du staging sont détaillées dans `docs/deployment-coolify.md`.

## Limites actuelles

- aucun profil d'élève secondaire : le compte reste l'unique propriétaire des contenus ;
- aucun micro ou Speech-to-Text ;
- aucune rédaction par paragraphes ;
- aucun assemblage des segments en un MP3 unique ;
- aucun déploiement automatique depuis une branche de correctif.
