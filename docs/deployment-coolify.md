# Déploiement Coolify - BlablaBox

## État actuel

BlablaBox est maintenant une application Next.js App Router avec TypeScript, Tailwind CSS, Prisma et PostgreSQL.

Repository GitHub : `digitalsaurien-git/BlablaBox`

Branche cible : `main`

Le premier déploiement futur doit rester simple et contrôlé : utiliser le buildpack Coolify / Nixpacks Node. Aucun Dockerfile et aucun docker-compose ne sont utilisés pour l'instant.

Ce document prépare le déploiement, mais ne déclenche aucun déploiement.

## Décision recommandée

Mode recommandé pour le premier déploiement : Coolify buildpack / Nixpacks Node.

Raisons :

- le projet est un Next.js standard ;
- aucun besoin Docker spécifique n'existe actuellement ;
- la commande de build peut rester explicite ;
- le Dockerfile sera traité dans un lot dédié si le besoin apparaît.

## Paramètres Coolify recommandés

Port interne de l'application : `3000`

Commande de build recommandée :

```bash
npm ci && npx prisma generate && npm run build
```

Commande de start recommandée :

```bash
npm run start
```

Commande de migration production :

```bash
npm run db:migrate:deploy
```

Ne jamais utiliser `prisma migrate dev` en production.

## Variables d'environnement

Renseigner les variables réelles uniquement dans Coolify. Ne jamais commiter de `.env` réel.

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

Pour le premier déploiement, garder obligatoirement :

```env
LLM_PROVIDER=mock
```

Ne pas activer OpenAI ou un provider payant pendant le premier déploiement.

Les secrets doivent rester dans Coolify :

- `DATABASE_URL` réelle ;
- future clé `LLM_API_KEY` si un lot validé active un provider réel ;
- futurs secrets d'authentification ou stockage.

## PostgreSQL

Préparer une base PostgreSQL dédiée à BlablaBox.

Recommandations :

- utiliser une base PostgreSQL gérée par Coolify ou une base dédiée sur le VPS ;
- utiliser un utilisateur PostgreSQL dédié ;
- limiter les droits à la base BlablaBox ;
- vérifier que `DATABASE_URL` pointe vers la bonne base avant toute migration ;
- tester les migrations sur une base de test avant production si possible.

## Prisma

Les migrations Prisma sont versionnées dans `prisma/migrations`.

En production, utiliser :

```bash
npm run db:migrate:deploy
```

Ne pas utiliser :

```bash
npx prisma migrate dev
```

`migrate dev` est réservé au développement local.

## Healthcheck

Après déploiement, vérifier :

```text
/api/health
```

Le endpoint doit répondre avec un statut HTTP `200`.

## Hors périmètre de ce lot

Ne pas ajouter dans ce lot :

- Dockerfile ;
- docker-compose ;
- modification `next.config.ts` ;
- déploiement ;
- connexion VPS ;
- configuration Coolify réelle ;
- provider LLM réel activé ;
- TTS ;
- MP3 ;
- OCR ;
- dictée ;
- upload PDF/DOCX.

## Checklist opérateur

### Avant déploiement

- [ ] Vérifier que `npm run build` passe en local.
- [ ] Vérifier que les migrations Prisma sont versionnées.
- [ ] Préparer une base PostgreSQL dédiée.
- [ ] Préparer `DATABASE_URL`.
- [ ] Garder `LLM_PROVIDER=mock`.
- [ ] Vérifier que `.env` n'est pas committé.
- [ ] Vérifier que la branche GitHub `main` est à jour.

### Dans Coolify

- [ ] Créer une application depuis GitHub.
- [ ] Choisir le repository `digitalsaurien-git/BlablaBox`.
- [ ] Choisir la branche `main`.
- [ ] Utiliser Nixpacks / Node.
- [ ] Renseigner les variables d'environnement.
- [ ] Configurer le port `3000`.
- [ ] Lancer le build.
- [ ] Lancer la migration Prisma avec `npm run db:migrate:deploy` si nécessaire.
- [ ] Vérifier `/api/health`.

### Après déploiement

- [ ] Ouvrir l'application.
- [ ] Créer un projet test.
- [ ] Générer un script avec le mock.
- [ ] Vérifier la bibliothèque.
- [ ] Supprimer le projet test.
- [ ] Vérifier les logs Coolify.

## Risques

- Une mauvaise `DATABASE_URL` peut appliquer les migrations sur la mauvaise base.
- Oublier `npx prisma generate` peut casser le build ou le runtime Prisma.
- Lancer `prisma migrate dev` en production peut modifier l'historique de migration de façon inadaptée.
- Activer `LLM_PROVIDER=openai` sans clé ou sans validation produit peut provoquer des erreurs ou des coûts.
- Sans Auth.js, la bibliothèque reste globale temporairement.
- Aucun stockage audio réel n'existe encore.