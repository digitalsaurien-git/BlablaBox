# Deploiement Coolify - BlablaBox

## Etat valide

Le premier deploiement Coolify de BlablaBox est fonctionnel.

Etat verifie :

- build Coolify OK ;
- application accessible ;
- `/api/health` OK ;
- `/projects` OK ;
- `/projects/new` OK ;
- base PostgreSQL connectee ;
- migrations Prisma appliquees ;
- parcours principal fonctionnel.

Repository GitHub : `digitalsaurien-git/BlablaBox`

Branche cible : `main`

Mode utilise : Coolify buildpack / Nixpacks Node.

Aucun Dockerfile et aucun docker-compose ne sont utilises pour l'instant.

## Parametres Coolify valides

Port interne de l'application : `3000`

Build command :

```bash
npx prisma generate && npm run build
```

Start command :

```bash
npm run start
```

Commande de migration production :

```bash
npm run db:migrate:deploy
```

Ne jamais utiliser `prisma migrate dev` en production.

Note importante : ne pas ajouter `npm ci` dans la build command Coolify si Nixpacks execute deja l'installation des dependances. Dans ce cas, la build command doit uniquement generer Prisma puis lancer le build Next.js.

## Erreur connue EBUSY node_modules/.cache

Erreur rencontree pendant le premier deploiement :

```text
EBUSY: resource busy or locked, rmdir '/app/node_modules/.cache'
```

Cause : Nixpacks lancait deja `npm ci`, puis la build command personnalisee relancait `npm ci` une seconde fois.

Correction appliquee dans Coolify :

```bash
npx prisma generate && npm run build
```

La start command reste :

```bash
npm run start
```

Le port reste :

```text
3000
```

## Variables d'environnement

Renseigner les variables reelles uniquement dans Coolify. Ne jamais commiter de `.env` reel.

Variables minimales :

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://example.com
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/blablabox
LLM_PROVIDER=mock
LLM_API_KEY=
LLM_MODEL=gpt-5-mini
WEB_SEARCH_ENABLED=false
TTS_PROVIDER=disabled
TTS_API_KEY=
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=coral
TTS_MAX_SCRIPT_CHARACTERS=4096
TTS_SEGMENT_TARGET_CHARACTERS=3500
AUDIO_STORAGE_PATH=/data/blablabox/audio
```

Pour le premier deploiement valide, `LLM_PROVIDER` est reste sur :

```env
LLM_PROVIDER=mock
```

Pour activer le parcours reel, definir explicitement `LLM_PROVIDER=openai` et
`TTS_PROVIDER=openai`, puis renseigner les deux cles dans les secrets Coolify.
Les valeurs `mock` et `disabled` n'effectuent aucun appel payant.

Les appels OpenAI sont factures selon les modeles et volumes utilises. Surveiller
la consommation du compte API et conserver une limite TTS adaptee. Un script qui
depasse `TTS_MAX_SCRIPT_CHARACTERS` est segmente autour de 3500 caracteres, sans
troncature et sans coupe au milieu d'un mot.

Les secrets doivent rester dans Coolify :

- `DATABASE_URL` reelle ;
- future cle `LLM_API_KEY` si un lot valide active un provider reel ;
- `TTS_API_KEY` lorsque la synthese OpenAI est activee ;
- futurs secrets d'authentification ou stockage.

## PostgreSQL

La base PostgreSQL de production est connectee et les migrations Prisma ont ete appliquees.

Recommandations :

- utiliser une base PostgreSQL geree par Coolify ou une base dediee sur le VPS ;
- utiliser un utilisateur PostgreSQL dedie ;
- limiter les droits a la base BlablaBox ;
- verifier que `DATABASE_URL` pointe vers la bonne base avant toute migration ;
- lancer les migrations de production avec `npm run db:migrate:deploy`.

## Prisma

Les migrations Prisma sont versionnees dans `prisma/migrations`.

En production, utiliser :

```bash
npm run db:migrate:deploy
```

Ne pas utiliser :

```bash
npx prisma migrate dev
```

`migrate dev` est reserve au developpement local.

La migration `20260806120000_add_real_audio_generation` est additive. Elle convertit
les anciens statuts `NOT_STARTED` et `MOCK_READY` en `NOT_GENERATED`, puis ajoute les
metadonnees audio. Avant le redeploiement applicatif :

```bash
npm run db:migrate:deploy
```

## Volume audio persistant

Les MP3 ne doivent pas rester dans le systeme de fichiers ephemere du conteneur.
Dans Coolify, creer un volume persistant et le monter exactement sur :

```text
/data/blablabox/audio
```

Configurer ensuite :

```env
AUDIO_STORAGE_PATH=/data/blablabox/audio
```

Le processus Node doit avoir les droits de creation, lecture, renommage et suppression
sur ce dossier. Ne pas monter ce volume dans `public/` : les fichiers sont servis par
la route applicative apres recherche du projet en base.

## Procedure de mise en production du lot audio

1. Sauvegarder la base PostgreSQL.
2. Ajouter les variables LLM, TTS et `AUDIO_STORAGE_PATH` dans Coolify.
3. Creer et monter le volume persistant audio.
4. Deployer la version contenant la migration.
5. Executer `npm run db:migrate:deploy` dans le conteneur de production.
6. Redeployer avec `npx prisma generate && npm run build`, puis `npm run start`.
7. Creer un projet de test, generer son script, puis son audio.
8. Verifier l'ecoute continue, y compris avec un contenu de plus de 4096 caracteres.
9. Verifier le telechargement du MP3 unique ou des parties MP3 numerotees.
10. Redemarrer le conteneur et confirmer que le MP3 reste accessible grace au volume.

La route ne prend jamais de chemin physique en parametre. Elle charge le projet par
son identifiant, utilise uniquement sa reference de fichier en base et retourne 404
si le projet ou le fichier est absent. Sans authentification, toute personne connaissant
l'identifiant du projet peut toutefois demander cette route ; l'isolation utilisateur
sera ajoutee avec l'authentification.

## Healthcheck

Apres deploiement, verifier :

```text
/api/health
```

Le endpoint doit repondre avec un statut HTTP `200`.

## Staging Lot A - Comprendre et ecouter

Le Lot A doit d'abord etre valide sur une application Coolify distincte. Le code de
la branche de lot n'est pas encore deploye et sa migration n'a ete appliquee sur
aucune base.

Configuration recommandee :

- URL : `https://blablabox-staging.digitalsaurien.net` ;
- depot GitHub identique ;
- branche : `codex/lot-a-server-first` ;
- application Coolify distincte ;
- base et utilisateur PostgreSQL distincts ;
- volume audio distinct monte sur `/data/blablabox-staging/audio` ;
- acces staging protege tant que l'authentification BlablaBox n'existe pas.

Variables staging attendues :

```env
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://blablabox-staging.digitalsaurien.net
PORT=3000
DATABASE_URL=postgresql://<staging-user>:<secret>@<host>:5432/blablabox_staging
LLM_PROVIDER=openai
LLM_API_KEY=<secret-coolify>
LLM_MODEL=<modele-responses-compatible-web-search>
WEB_SEARCH_ENABLED=true
TTS_PROVIDER=openai
TTS_API_KEY=<secret-coolify>
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=coral
TTS_MAX_SCRIPT_CHARACTERS=4096
AUDIO_STORAGE_PATH=/data/blablabox-staging/audio
```

Procedure staging, apres validation humaine du commit et du push :

1. Creer la base, l'utilisateur, l'application, le domaine et le volume staging.
2. Configurer les secrets uniquement dans Coolify.
3. Verifier que `DATABASE_URL` cible bien `blablabox_staging`.
4. Deployer la branche avec `npx prisma generate && npm run build`.
5. Executer `npm run db:migrate:deploy` contre la base staging uniquement.
6. Verifier `npx prisma migrate status` puis `/api/health`.
7. Tester une explication factuelle avec recherche et sources.
8. Tester une histoire creative sans recherche inutile.
9. Generer, lire puis recharger un MP3.
10. Regenerer le contenu et confirmer que l'ancien MP3 disparait du lecteur.
11. Redemarrer l'application et confirmer la persistance du nouveau MP3.

La production reste sur `main`, sa base et son volume actuels jusqu'a validation
complete du staging. Aucun fichier ne doit etre modifie directement dans un
conteneur Coolify.

## Hors perimetre sans lot dedie

Ne pas ajouter sans validation explicite :

- Dockerfile ;
- docker-compose ;
- modification `next.config.ts` ;
- activation reelle hors staging valide ;
- concatenation des segments audio en un MP3 unique ;
- OCR ;
- dictee ;
- upload PDF/DOCX.

## Checklist operateur

### Avant redeploiement

- [ ] Verifier que les migrations Prisma sont versionnees.
- [ ] Verifier que le volume audio persistant est monte sur `AUDIO_STORAGE_PATH`.
- [ ] Verifier que `DATABASE_URL` pointe vers la bonne base.
- [ ] Garder `LLM_PROVIDER=mock` et `TTS_PROVIDER=disabled` tant que les appels reels ne sont pas souhaites.
- [ ] Verifier que `.env` n'est pas committe.
- [ ] Verifier que la branche GitHub `main` est a jour.

### Dans Coolify

- [ ] Utiliser Nixpacks / Node.
- [ ] Renseigner les variables d'environnement.
- [ ] Configurer le port `3000`.
- [ ] Configurer la build command : `npx prisma generate && npm run build`.
- [ ] Configurer la start command : `npm run start`.
- [ ] Ne pas ajouter `npm ci` dans la build command si Nixpacks l'execute deja.
- [ ] Lancer la migration Prisma avec `npm run db:migrate:deploy` si necessaire.
- [ ] Verifier `/api/health`.

### Apres redeploiement

- [ ] Ouvrir l'application.
- [ ] Verifier `/projects`.
- [ ] Verifier `/projects/new`.
- [ ] Creer un projet test si necessaire.
- [ ] Generer un script avec le mock.
- [ ] Verifier les logs Coolify.

## Risques

- Une mauvaise `DATABASE_URL` peut appliquer les migrations sur la mauvaise base.
- Oublier `npx prisma generate` peut casser le build ou le runtime Prisma.
- Ajouter `npm ci` dans la build command alors que Nixpacks l'execute deja peut provoquer l'erreur `EBUSY` sur `/app/node_modules/.cache`.
- Lancer `prisma migrate dev` en production peut modifier l'historique de migration de facon inadaptee.
- Activer `LLM_PROVIDER=openai` sans cle ou sans validation produit peut provoquer des erreurs ou des couts.
- Sans Auth.js, la bibliotheque reste globale temporairement.
- Sans volume persistant, les MP3 peuvent disparaitre lors d'un redeploiement.
- Sans authentification, la route audio n'applique pas encore de controle par utilisateur.
