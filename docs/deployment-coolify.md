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
```

Pour le premier deploiement valide, `LLM_PROVIDER` est reste sur :

```env
LLM_PROVIDER=mock
```

Ne pas activer OpenAI ou un provider payant sans lot valide dedie.

Les secrets doivent rester dans Coolify :

- `DATABASE_URL` reelle ;
- future cle `LLM_API_KEY` si un lot valide active un provider reel ;
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

## Healthcheck

Apres deploiement, verifier :

```text
/api/health
```

Le endpoint doit repondre avec un statut HTTP `200`.

## Hors perimetre sans lot dedie

Ne pas ajouter sans validation explicite :

- Dockerfile ;
- docker-compose ;
- modification `next.config.ts` ;
- provider LLM reel active ;
- TTS ;
- MP3 ;
- OCR ;
- dictee ;
- upload PDF/DOCX.

## Checklist operateur

### Avant redeploiement

- [ ] Verifier que les migrations Prisma sont versionnees.
- [ ] Verifier que `DATABASE_URL` pointe vers la bonne base.
- [ ] Garder `LLM_PROVIDER=mock` sauf lot provider reel valide.
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
- Aucun stockage audio reel n'existe encore.
