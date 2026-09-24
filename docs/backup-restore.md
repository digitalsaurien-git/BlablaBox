# Backup et restauration BlablaBox

## Vue d'ensemble

BlablaBox stocke des données dans trois emplacements :

1. **PostgreSQL** — comptes, projets, cours, scripts, sessions
2. **Fichiers sources** (`SOURCE_STORAGE_ROOT`) — documents uploadés pour les cours
3. **Fichiers audio** (`AUDIO_STORAGE_PATH`) — MP3 générés par le TTS

Les trois doivent être sauvegardés ensemble pour garantir la cohérence.

## Backup automatisé

### Script

```bash
./scripts/backup.sh [destination]
```

Par défaut, les backups vont dans `/data/blablabox/backups`. Chaque exécution
crée un dossier horodaté contenant le dump PostgreSQL compressé, les archives
des fichiers sources et audio, et un manifest SHA-256.

### Planification cron (recommandé)

Ajouter au crontab de l'utilisateur qui exécute l'application :

```bash
# Backup quotidien à 3h du matin
0 3 * * * DATABASE_URL="postgresql://user:pass@host:5432/blablabox" /chemin/vers/scripts/backup.sh >> /var/log/blablabox-backup.log 2>&1
```

### Rétention

Par défaut, les backups de plus de 30 jours sont supprimés automatiquement.
Configurable via `BACKUP_RETENTION_DAYS`.

## Restauration

```bash
DATABASE_URL="postgresql://..." ./scripts/restore.sh /data/blablabox/backups/20260924_030000
```

Le script vérifie les checksums, demande confirmation, puis restaure la base
et les fichiers. Relancer `npm run db:migrate:deploy` après restauration si
des migrations ont été ajoutées entre le backup et la restauration.

## Prérequis serveur

- `pg_dump` et `psql` (PostgreSQL client tools, même version que le serveur)
- `gzip`, `tar`, `sha256sum` (présents par défaut sur Linux)

## Vérification manuelle

Après un backup :

```bash
cd /data/blablabox/backups/<timestamp>
sha256sum --check manifest.txt
```

## Bonnes pratiques

- Tester la restauration régulièrement sur une base de staging.
- Conserver au moins un backup hors du serveur (Dropbox, S3, disque externe).
- Sauvegarder avant toute migration Prisma en production.
- Vérifier les logs cron pour détecter les échecs silencieux.
