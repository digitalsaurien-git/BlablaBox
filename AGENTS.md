# AGENTS.md - BlablaBox

## Vision produit

BlablaBox est une application SaaS web mobile-first qui transforme un texte ou un sujet libre en script audio pédagogique clair, vivant et mémorisable. La cible produit future est de produire un fichier audio complet, écoutable, réécoutable et téléchargeable, mais le MVP actuel ne génère pas encore de MP3 réel.

## Stack cible

- Next.js App Router
- TypeScript
- Tailwind CSS
- PostgreSQL
- Prisma
- Architecture providers côté serveur
- Docker / Coolify plus tard, uniquement dans un lot validé dédié

## État actuel du MVP

Fonctionnalités présentes :

- création d'un projet audio ;
- saisie texte ou sujet libre ;
- choix des paramètres pédagogiques ;
- choix du type de restitution ;
- génération d'un script via provider LLM ;
- bibliothèque globale temporaire ;
- page détail projet ;
- affichage de la source complète ;
- affichage des paramètres, statuts, objectif et script ;
- régénération du script avec confirmation ;
- conservation de l'ancien script si la régénération échoue ;
- suppression simple d'un projet avec confirmation.

## Providers existants et prévus

- `LLMProvider` existe.
- `MockLLMProvider` est le provider par défaut.
- `OpenAILLMProvider` est préparé côté serveur mais non activé par défaut.
- `TTSProvider` est prévu plus tard mais non implémenté dans le MVP actuel.
- Aucun MP3 réel n'existe pour l'instant.
- Aucun provider payant ne doit être activé sans lot validé.

## Variables d'environnement

Variables principales :

- `DATABASE_URL`
- `LLM_PROVIDER=mock` par défaut
- `LLM_API_KEY=` vide par défaut
- `LLM_MODEL=gpt-5-mini`
- `TTS_PROVIDER=disabled`
- `OCR_PROVIDER=disabled`
- `SPEECH_TO_TEXT_PROVIDER=disabled`

Règles :

- Ne jamais commiter de secret réel.
- Ne jamais exposer de clé serveur avec un préfixe `NEXT_PUBLIC_`.
- Les clés API doivent rester côté serveur.
- Les variables de production ne doivent pas être modifiées sans validation humaine explicite.

## Commandes utiles

```bash
npm install
npm run dev
npm run build
npm run db:generate
npx prisma migrate dev --name <nom_migration>
```

`prisma migrate dev` est réservé au développement local. Ne jamais l'utiliser sur une base de production.

## Règles de sécurité

- Ne pas appeler d'API payante par défaut.
- Ne pas logger de clé API, secret, prompt sensible ou `DATABASE_URL` complète.
- Ne pas ajouter de provider réel activé sans validation.
- Ne pas supprimer de données sans demande explicite.
- Ne pas régénérer automatiquement les anciens scripts sans demande explicite.
- Ne pas lancer de commande destructive sans validation explicite.

## Hors périmètre actuel sauf lot validé

Interdit sauf lot explicitement validé :

- provider LLM réel activé ;
- TTS réel ;
- MP3 ;
- lecteur audio ;
- téléchargement audio ;
- upload PDF/DOCX ;
- OCR ;
- dictée vocale ;
- import URL ;
- Auth.js ;
- paiement ;
- partage public ;
- stockage objet S3/MinIO ;
- Docker ;
- Coolify ;
- déploiement ;
- refactoring global non demandé.

## Plan obligatoire avant lot sensible

Codex doit toujours présenter un plan et attendre validation humaine avant :

- migration Prisma ;
- modification du modèle de données ;
- branchement API réelle ;
- activation OpenAI ou autre provider payant ;
- ajout TTS/MP3 ;
- ajout upload PDF/DOCX ;
- ajout OCR ;
- ajout dictée ;
- ajout Auth.js ;
- ajout Docker/Coolify ;
- déploiement ;
- modification des variables d'environnement de production ;
- modification de stockage fichiers ;
- action GitHub sensible.

## Règles avant migration Prisma

Avant toute migration :

- vérifier `DATABASE_URL` ;
- confirmer que la base ciblée est locale/dev, sauf validation explicite contraire ;
- privilégier une migration non destructive ;
- prévoir une valeur par défaut pour tout nouveau champ requis ;
- ne pas supprimer de colonne/table/donnée sans validation explicite ;
- ne pas régénérer les anciens scripts automatiquement.

## Règles avant branchement API réelle

Avant toute API réelle :

- garder `MockLLMProvider` par défaut ;
- activer le provider réel uniquement via variable d'environnement explicite ;
- vérifier que la clé API est absente du client ;
- tester les erreurs de configuration ;
- documenter les coûts et risques ;
- demander validation humaine avant toute consommation API.

## Règles avant déploiement Coolify

Avant tout travail Coolify/déploiement :

- présenter un plan dédié ;
- vérifier `npm run build` ;
- vérifier `npm run db:generate` ;
- vérifier les migrations sur une base de test ;
- garder les secrets uniquement dans Coolify ;
- vérifier le healthcheck ;
- ne pas ajouter Docker/Coolify dans un lot non prévu pour cela.

## Définition de terminé

Un lot est terminé quand :

- le périmètre validé est respecté ;
- aucun ajout hors périmètre n'a été fait ;
- le build ou les vérifications annoncées ont été exécutés ;
- les tests pertinents sont passés ou les limites sont signalées ;
- les risques restants sont explicités ;
- le rapport final liste les fichiers modifiés et le résultat des vérifications.