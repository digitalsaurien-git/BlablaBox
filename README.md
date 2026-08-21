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

Le code du Lot A n'est pas considéré comme validé en production tant que la migration et le parcours réel n'ont pas été testés sur le staging Hostinger/Coolify.

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
```

Le modèle LLM doit être confirmé comme compatible avec l'outil `web_search` avant l'activation staging. Les clés restent exclusivement dans les secrets Coolify et ne doivent jamais utiliser le préfixe `NEXT_PUBLIC_`.

## Versionnement contenu et audio

Chaque projet possède un `contentVersion`. Un MP3 n'est proposé que lorsque :

```text
audioContentVersion === contentVersion
```

et que le fichier existe réellement dans le stockage persistant. Les MP3 historiques sont conservés physiquement, mais ne sont pas considérés comme synchronisés tant qu'ils n'ont pas été régénérés avec ce mécanisme.

Un texte dépassant `TTS_MAX_SCRIPT_CHARACTERS` est conservé intégralement. La génération audio est refusée avec une explication ; aucune troncature silencieuse n'est effectuée.

## Installation et vérification locale

```bash
npm install
npm run db:generate
npx prisma validate
npm test
npm run build
```

Les tests mockent les réponses OpenAI et n'effectuent aucun appel payant.

## Migrations

Les migrations sont versionnées dans `prisma/migrations`.

En staging et production :

```bash
npm run db:migrate:deploy
```

Ne jamais utiliser `prisma migrate dev` sur une base distante de production. La migration du Lot A est additive et ne renseigne pas `audioContentVersion` pour les anciens projets.

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

- aucune authentification : bibliothèque globale temporaire ;
- aucun micro ou Speech-to-Text ;
- aucune rédaction par paragraphes ;
- aucune segmentation audio longue ;
- aucun déploiement automatique du Lot A depuis cette branche.
