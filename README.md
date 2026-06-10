# BlablaBox

BlablaBox est un MVP Next.js qui transforme un texte ou un sujet libre en script audio pÃ©dagogique. Le lot actuel utilise `MockLLMProvider` par dÃ©faut : aucun appel IA externe, aucun TTS rÃ©el et aucun fichier MP3 ne sont gÃ©nÃ©rÃ©s.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL

## FonctionnalitÃ©s du lot actuel

- CrÃ©ation d'un projet audio.
- ParamÃ¨tres pÃ©dagogiques : durÃ©e, public cible, ton, niveau, objectif.
- Type de restitution : histoire immersive, rÃ©sumÃ© de cours, fiche audio de mÃ©morisation, questions-rÃ©ponses de rÃ©vision.
- GÃ©nÃ©ration d'un script narratif simulÃ© mais rÃ©aliste.
- BibliothÃ¨que globale temporaire.
- Page dÃ©tail projet avec source, paramÃ¨tres, statuts, objectif et script.
- RÃ©gÃ©nÃ©ration du script avec confirmation.
- Suppression simple avec confirmation.
- Architecture prÃªte pour un futur provider LLM rÃ©el, non activÃ© par dÃ©faut.

## Cadre de dÃ©veloppement

Les dÃ©cisions produit, rÃ¨gles de sÃ©curitÃ© et garde-fous des prochains lots sont dans `AGENTS.md`. Avant tout lot sensible, notamment Prisma, API rÃ©elle, TTS/MP3, Auth.js, Docker/Coolify, dÃ©ploiement ou action GitHub sensible, relire `AGENTS.md`, prÃ©senter un plan et attendre validation humaine.

## Installation

```bash
npm install
```

## Configuration

Copier `.env.example` vers `.env`, puis renseigner `DATABASE_URL` avec une base PostgreSQL locale.

```bash
npm run db:generate
npx prisma migrate dev
```

`migrate dev` crÃ©e les tables en dÃ©veloppement. Ne pas utiliser cette commande en production.

## DÃ©veloppement

```bash
npm run dev
```

L'application sera disponible sur `http://localhost:3000`.

## VÃ©rification

```bash
npm run build
```

## Providers LLM

Par dÃ©faut, BlablaBox utilise le provider local `MockLLMProvider` :

```env
LLM_PROVIDER=mock
LLM_API_KEY=
LLM_MODEL=gpt-5-mini
```

Ce mode ne fait aucun appel externe et ne consomme aucune API payante.

Un provider OpenAI est prÃ©parÃ© cÃ´tÃ© serveur pour un lot futur. Pour l'activer plus tard, il faudra dÃ©finir explicitement :

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-5-mini
```

La clÃ© ne doit jamais Ãªtre prÃ©fixÃ©e par `NEXT_PUBLIC_` et ne doit jamais Ãªtre exposÃ©e cÃ´tÃ© client. Si `LLM_PROVIDER=openai` est demandÃ© sans `LLM_API_KEY`, l'application renvoie une erreur claire et la gÃ©nÃ©ration Ã©choue proprement.


## Déploiement Coolify

Le premier déploiement Coolify est validé avec Nixpacks, `LLM_PROVIDER=mock`, le port `3000`, la build command `npx prisma generate && npm run build` et la start command `npm run start`.

Les notes d'exploitation sont documentées dans `docs/deployment-coolify.md`.

## Notes produit

Le modÃ¨le `Project` contient dÃ©jÃ  un `userId` nullable pour prÃ©parer une future authentification sans bloquer le MVP technique actuel.
