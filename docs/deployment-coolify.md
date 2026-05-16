# Preparation deploiement Coolify - BlablaBox

## 1. Diagnostic deploiement

Etat constate le 2026-05-16 :

- Le depot contient uniquement `AGENTS.md`.
- Aucun `package.json`, dossier `app/`, configuration Next.js, schema Prisma, Dockerfile ou docker-compose n'est present.
- Le build Next.js, `prisma generate`, les migrations et la connexion PostgreSQL ne sont donc pas testables a ce stade.
- Le projet n'est pas deployable sur Coolify en l'etat.

Objectif de preparation :

- cadrer les variables d'environnement attendues ;
- definir les fichiers a ajouter quand l'application Next.js existe ;
- lister les controles avant de connecter Coolify au depot ;
- eviter toute modification du VPS, du reverse proxy, du domaine, du HTTPS ou d'une base PostgreSQL existante.

## 2. Fichiers a creer ou modifier

Fichiers ajoutes maintenant :

- `.env.example` : modele de variables sans secret reel.
- `docs/deployment-coolify.md` : diagnostic, etapes et checklist de deploiement.

Fichiers a creer quand l'application existe :

- `package.json` avec scripts `dev`, `build`, `start`, `lint` si utilise, et scripts Prisma.
- `next.config.ts` ou `next.config.js` si configuration specifique.
- `prisma/schema.prisma`.
- `prisma/migrations/` avec migrations versionnees.
- `Dockerfile` uniquement si le mode Docker est retenu dans Coolify.
- `.dockerignore` si un `Dockerfile` est ajoute.
- endpoint de healthcheck, par exemple `app/api/health/route.ts`.

Dockerfile recommande plus tard, apres presence d'un vrai projet Next.js :

```Dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```

Ce Dockerfile suppose `output: "standalone"` dans la configuration Next.js.

## 3. Variables d'environnement necessaires

Variables minimales :

- `NODE_ENV=production`
- `NEXT_PUBLIC_APP_URL`
- `PORT=3000`
- `DATABASE_URL`
- `AUTH_SECRET`

Variables providers :

- `LLM_PROVIDER`
- `LLM_API_KEY`
- `TTS_PROVIDER`
- `TTS_API_KEY`
- `OCR_PROVIDER`
- `OCR_API_KEY`
- `SPEECH_TO_TEXT_PROVIDER`
- `SPEECH_TO_TEXT_API_KEY`

Variables stockage futur :

- `STORAGE_PROVIDER`
- `STORAGE_BUCKET`
- `STORAGE_ENDPOINT`
- `STORAGE_ACCESS_KEY`
- `STORAGE_SECRET_KEY`

Regles de securite :

- Ne jamais commiter de `.env` reel.
- Definir les secrets dans Coolify, pas dans le depot.
- Generer `AUTH_SECRET` avec une valeur aleatoire forte.
- Donner a l'utilisateur PostgreSQL uniquement les droits necessaires a la base BlablaBox.
- Ne pas reutiliser les secrets de developpement en production.

## 4. Etapes Coolify proposees

1. Verifier que le projet Next.js build localement.
2. Verifier que `npx prisma generate` passe.
3. Verifier que les migrations Prisma sont presentes et appliquees sur une base de test.
4. Creer ou selectionner l'application Coolify depuis le depot Git.
5. Choisir le mode de build :
   - Nixpacks/Node si le projet reste standard Next.js ;
   - Dockerfile si un build reproductible et controle est souhaite.
6. Definir le port interne `3000`.
7. Renseigner les variables d'environnement dans Coolify.
8. Connecter PostgreSQL sans remplacer une base existante.
9. Configurer une commande de migration explicite si Coolify le permet, par exemple `npx prisma migrate deploy`.
10. Configurer un healthcheck HTTP, par exemple `/api/health`.
11. Lancer un premier deploiement de validation.

## 5. Risques

- Aucun code applicatif n'existe encore dans ce depot.
- Un `Dockerfile` ajoute trop tot peut donner une fausse impression de deployabilite.
- `prisma migrate dev` ne doit pas etre utilise en production ; preferer `prisma migrate deploy`.
- Une `DATABASE_URL` incorrecte peut pointer vers la mauvaise base PostgreSQL.
- Les providers LLM/TTS/OCR/STT doivent gerer les erreurs et quotas pour eviter des echecs en production.
- Le stockage local n'est pas adapte aux fichiers persistants si les conteneurs sont recrees ; prevoir un volume ou un stockage objet.
- Les logs ne doivent jamais contenir de prompt sensible, cle API, URL de base avec mot de passe, ou contenu utilisateur confidentiel.

## 6. Tests avant deploiement

Commandes a executer quand le projet Next.js existe :

```bash
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
npm run start
```

Verifications manuelles :

- `GET /api/health` retourne `200`.
- L'application demarre sur le port `3000`.
- La connexion PostgreSQL fonctionne.
- La creation d'un projet audio fonctionne.
- La generation de script gere les erreurs provider.
- Les logs restent lisibles sans exposer les secrets.
- Les variables manquantes provoquent une erreur explicite au demarrage ou dans le flux concerne.

## 7. Checklist operateur

- [ ] Le depot contient une application Next.js fonctionnelle.
- [ ] `npm run build` passe localement.
- [ ] `npx prisma generate` passe localement.
- [ ] Les migrations Prisma sont versionnees.
- [ ] `prisma migrate deploy` a ete teste sur une base de test.
- [ ] `.env.example` est a jour.
- [ ] Aucun secret reel n'est commite.
- [ ] `DATABASE_URL` Coolify pointe vers la bonne base.
- [ ] Le port interne Coolify est `3000`.
- [ ] Le healthcheck est disponible.
- [ ] Le stockage futur des fichiers est decide.
- [ ] Les logs ne fuitent pas de donnees sensibles.
- [ ] Le deploiement est valide sur un environnement de test avant production.
