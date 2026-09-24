#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# BlablaBox — Script de backup PostgreSQL + fichiers sources
# ============================================================
#
# Usage :
#   ./scripts/backup.sh [destination]
#
# Par défaut les backups vont dans /data/blablabox/backups.
# Le script crée un dossier horodaté contenant :
#   - blablabox_db_<timestamp>.sql.gz  (dump PostgreSQL compressé)
#   - sources_<timestamp>.tar.gz       (fichiers sources)
#   - audio_<timestamp>.tar.gz         (fichiers audio, si présents)
#   - manifest.txt                     (checksums SHA-256)
#
# Variables d'environnement requises :
#   DATABASE_URL   — URL de connexion PostgreSQL
#
# Variables optionnelles :
#   SOURCE_STORAGE_ROOT  — chemin des sources (défaut : /data/blablabox/sources)
#   AUDIO_STORAGE_PATH   — chemin des audios  (défaut : /data/blablabox/audio)
#   BACKUP_RETENTION_DAYS — jours de rétention (défaut : 30)
#
# Prérequis :
#   - pg_dump (PostgreSQL client tools)
#   - gzip, tar, sha256sum
#
# Planification cron recommandée (quotidien à 3h) :
#   0 3 * * * /chemin/vers/scripts/backup.sh >> /var/log/blablabox-backup.log 2>&1
# ============================================================

BACKUP_ROOT="${1:-/data/blablabox/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

SOURCE_DIR="${SOURCE_STORAGE_ROOT:-/data/blablabox/sources}"
AUDIO_DIR="${AUDIO_STORAGE_PATH:-/data/blablabox/audio}"

# Vérifications
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ERREUR] DATABASE_URL n'est pas définie." >&2
  exit 1
fi

if ! command -v pg_dump &> /dev/null; then
  echo "[ERREUR] pg_dump n'est pas installé." >&2
  exit 1
fi

echo "[$(date)] Début du backup BlablaBox..."
mkdir -p "${BACKUP_DIR}"

# --- Backup PostgreSQL ---
echo "[$(date)] Dump PostgreSQL..."
DB_FILE="${BACKUP_DIR}/blablabox_db_${TIMESTAMP}.sql.gz"
pg_dump "${DATABASE_URL}" --no-owner --no-privileges --clean --if-exists | gzip > "${DB_FILE}"
echo "[$(date)] Dump PostgreSQL terminé : $(du -h "${DB_FILE}" | cut -f1)"

# --- Backup fichiers sources ---
if [ -d "${SOURCE_DIR}" ] && [ "$(ls -A "${SOURCE_DIR}" 2>/dev/null)" ]; then
  echo "[$(date)] Archivage des sources..."
  SOURCES_FILE="${BACKUP_DIR}/sources_${TIMESTAMP}.tar.gz"
  tar -czf "${SOURCES_FILE}" -C "$(dirname "${SOURCE_DIR}")" "$(basename "${SOURCE_DIR}")"
  echo "[$(date)] Sources archivées : $(du -h "${SOURCES_FILE}" | cut -f1)"
else
  echo "[$(date)] Aucun fichier source à archiver."
fi

# --- Backup fichiers audio ---
if [ -d "${AUDIO_DIR}" ] && [ "$(ls -A "${AUDIO_DIR}" 2>/dev/null)" ]; then
  echo "[$(date)] Archivage des audios..."
  AUDIO_FILE="${BACKUP_DIR}/audio_${TIMESTAMP}.tar.gz"
  tar -czf "${AUDIO_FILE}" -C "$(dirname "${AUDIO_DIR}")" "$(basename "${AUDIO_DIR}")"
  echo "[$(date)] Audios archivés : $(du -h "${AUDIO_FILE}" | cut -f1)"
else
  echo "[$(date)] Aucun fichier audio à archiver."
fi

# --- Manifest avec checksums ---
echo "[$(date)] Calcul des checksums..."
cd "${BACKUP_DIR}"
sha256sum *.gz > manifest.txt 2>/dev/null || true
echo "[$(date)] Manifest créé."

# --- Nettoyage des anciens backups ---
if [ "${RETENTION_DAYS}" -gt 0 ]; then
  echo "[$(date)] Nettoyage des backups de plus de ${RETENTION_DAYS} jours..."
  find "${BACKUP_ROOT}" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true
fi

# --- Résumé ---
echo ""
echo "=== Backup terminé ==="
echo "Dossier  : ${BACKUP_DIR}"
echo "Contenu  :"
ls -lh "${BACKUP_DIR}"
echo ""
echo "[$(date)] Backup BlablaBox terminé avec succès."
