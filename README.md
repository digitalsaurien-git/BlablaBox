# BlablaBox

BlablaBox est un MVP Next.js qui transforme un texte ou un sujet libre en script audio pédagogique. Le lot actuel utilise `MockLLMProvider` par défaut : aucun appel IA externe, aucun TTS réel et aucun fichier MP3 ne sont générés.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL

## Fonctionnalités du lot actuel

- Création d'un projet audio.
- Paramètres pédagogiques : durée, public cible, ton, niveau, objectif.
- Type de restitution : histoire immersive, résumé de cours, fiche audio de mémorisation, questions-réponses de révision.
- Génération d'un script narratif simulé mais réaliste.
- Bibliothèque globale temporaire.
- Page détail projet avec source, paramètres, statuts, objectif et script.
- Régénération du script avec confirmation.
- Suppression simple avec confirmation.
- Architecture prête pour un futur provider LLM réel, non activé par défaut.

## Cadre de développement

Les décisions produit, règles de sécurité et garde-fous des prochains lots sont dans `AGENTS.md`. Avant tout lot sensible, notamment Prisma, API réelle, TTS/MP3, Auth.js, Docker/Coolify, déploiement ou action GitHub sensible, relire `AGENTS.md`, présenter un plan et attendre validation humaine.

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

`migrate dev` crée les tables en développement. Ne pas utiliser cette commande en production.

## Développement

```bash
npm run dev
```

L'application sera disponible sur `http://localhost:3000`.

## Vérification

```bash
npm run build
```

## Providers LLM

Par défaut, BlablaBox utilise le provider local `MockLLMProvider` :

```env
LLM_PROVIDER=mock
LLM_API_KEY=
LLM_MODEL=gpt-5-mini
```

Ce mode ne fait aucun appel externe et ne consomme aucune API payante.

Un provider OpenAI est préparé côté serveur pour un lot futur. Pour l'activer plus tard, il faudra définir explicitement :

```env
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-5-mini
```

La clé ne doit jamais être préfixée par `NEXT_PUBLIC_` et ne doit jamais être exposée côté client. Si `LLM_PROVIDER=openai` est demandé sans `LLM_API_KEY`, l'application renvoie une erreur claire et la génération échoue proprement.

## Notes produit

Le modèle `Project` contient déjà un `userId` nullable pour préparer une future authentification sans bloquer le MVP technique actuel.