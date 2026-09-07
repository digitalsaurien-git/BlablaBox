# Attribution manuelle des projets historiques

Les projets dont `userId` vaut `NULL` sont volontairement invisibles pour tous les
comptes ordinaires. Ils restent en base afin qu'un administrateur puisse, plus tard,
attribuer une sélection vérifiée à un compte précis.

Cette opération n'est pas automatique et ne fait pas partie du parcours utilisateur.
Elle doit être exécutée par un administrateur disposant d'un accès PostgreSQL protégé,
après sauvegarde et idéalement après répétition sur une copie de la base.

## Procédure ciblée

1. Identifier le compte par son adresse normalisée et noter son `id` exact :

```sql
SELECT "id", "email"
FROM "User"
WHERE "email" = 'compte-verifie@example.com';
```

2. Examiner explicitement chaque projet à attribuer. Ne jamais sélectionner tous les
   projets sans propriétaire :

```sql
SELECT "id", "title", "createdAt", "userId"
FROM "Project"
WHERE "id" IN ('projet-id-1', 'projet-id-2')
ORDER BY "createdAt";
```

3. Dans une transaction, verrouiller le compte et les projets, puis attribuer uniquement
   les identifiants validés qui sont encore sans propriétaire :

```sql
BEGIN;

SELECT "id", "email"
FROM "User"
WHERE "id" = 'user-id-verifie'
FOR UPDATE;

SELECT "id", "title", "userId"
FROM "Project"
WHERE "id" IN ('projet-id-1', 'projet-id-2')
FOR UPDATE;

UPDATE "Project"
SET "userId" = 'user-id-verifie'
WHERE "id" IN ('projet-id-1', 'projet-id-2')
  AND "userId" IS NULL;

SELECT "id", "title", "userId"
FROM "Project"
WHERE "id" IN ('projet-id-1', 'projet-id-2');

COMMIT;
```

Si l'identité du compte, la liste des projets ou le nombre de lignes modifiées ne
correspond pas exactement à l'attendu, exécuter `ROLLBACK` au lieu de `COMMIT`.

## Garde-fous

- Ne jamais exécuter `UPDATE "Project" SET "userId" = ... WHERE "userId" IS NULL`.
- Ne jamais déduire le propriétaire depuis le titre ou le contenu d'un projet.
- Ne jamais attribuer un projet déjà rattaché sans enquête et validation séparées.
- Conserver une trace administrative des identifiants attribués, de la date et de
  l'opérateur, hors des données applicatives sensibles.
- La contrainte `Project_userId_fkey` est validée normalement par la migration.

## Contrôle avant migration d'une base existante

Le modèle initial contenait déjà `Project.userId`, mais l'application antérieure ne
l'attribuait pas. Sur toute base dont le rôle a été identifié et sauvegardé, exécuter
ce contrôle en lecture seule avant la migration d'authentification :

```sql
SELECT "id", "title", "userId"
FROM "Project"
WHERE "userId" IS NOT NULL;
```

Le résultat attendu est vide. Si une ligne apparaît, arrêter la migration et enquêter
sur chaque identifiant. La migration échoue volontairement plutôt que de conserver une
clé étrangère non validée ou de transformer automatiquement ces données.
