#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# BlablaBox — Script de restauration depuis un backup
# ============================================================
#
# Usage :
#   ./scripts/restore.sh <dossier_backup>
#
# Exemple :
#   ./scripts/restore.sh /data/blablabox/backups/20260924_030000
#
# Ce script :
#   1. Vérifie les checksums du manifest
#   2. Restaure le dump PostgreSQL
#   3. Restaure les fichiers sources
#   4. Restaure les fichiers audio (si présents)
#
# Variables d'environnement requises :
#   DATABASE_URL — URL de connexion PostgreSQL
#
# ATTENTION : ce script écrase la base et les fichiers existants.
# ============================================================

if [ $# -lt 1 ]; then
  echo "Usage : $0 <dossier_backup>" >&2
  exit 1
fi

BACKUP_DIR="$1"
SOURCE_DIR="${SOURCE_STORAGE_ROOT:-/data/blablabox/sources}"
AUDIO_DIR="${AUDIO_STORAGE_PATH:-/data/blablabox/audio}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "[ERREUR] Le dossier ${BACKUP_DIR} n'existe pas." >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[ERREUR] DATABASE_URL n'est pas définie." >&2
  exit 1
fi

# --- Vérification des checksums ---
if [ -f "${BACKUP_DIR}/manifest.txt" ]; then
  echo "[$(date)] Vérification des checksums..."
  cd "${BACKUP_DIR}"
  if sha256sum --check manifest.txt; then
    echo "[$(date)] Checksums OK."
  else
    echo "[ERREUR] Checksums invalides — backup potentiellement corrompu." >&2
    exit 1
  fi
  cd - > /dev/null
else
  echo "[AVERTISSEMENT] Pas de manifest.txt — pas de vérification de checksums."
fi

# --- Confirmation ---
echo ""
echo "=== ATTENTION ==="
echo "Ce script va écraser :"
echo "  - La base PostgreSQL ciblée par DATABASE_URL"
echo "  - Les fichiers dans ${SOURCE_DIR}"
echo "  - Les fichiers dans ${AUDIO_DIR}"
echo ""
read -p "Continuer ? (oui/non) : " CONFIRM
if [ "${CONFIRM}" != "oui" ]; then
  echo "Restauration annulée."
  exit 0
fi

# --- Restauration PostgreSQL ---
DB_FILE=$(find "${BACKUP_DIR}" -name "blablabox_db_*.sql.gz" | head -1)
if [ -n "${DB_FILE}" ]; then
  echo "[$(date)] Restauration PostgreSQL depuis ${DB_FILE}..."
  gunzip -c "${DB_FILE}" | psql "${DATABASE_URL}" --quiet
  echo "[$(date)] Base restaurée."
else
  echo "[AVERTISSEMENT] Pas de dump PostgreSQL trouvé."
fi

# --- Restauration des sources ---
SOURCES_FILE=$(find "${BACKUP_DIR}" -name "sources_*.tar.gz" | head -1)
if [ -n "${SOURCES_FILE}" ]; then
  echo "[$(date)] Restauration des sources..."
  mkdir -p "${SOURCE_DIR}"
  tar -xzf "${SOURCES_FILE}" -C "$(dirname "${SOURCE_DIR}")"
  echo "[$(date)] Sources restaurées."
else
  echo "[$(date)] Pas d'archive sources trouvée."
fi

# --- Restauration des audios ---
AUDIO_FILE=$(find "${BACKUP_DIR}" -name "audio_*.tar.gz" | head -1)
if [ -n "${AUDIO_FILE}" ]; then
  echo "[$(date)] Restauration des audios..."
  mkdir -p "${AUDIO_DIR}"
  tar -xzf "${AUDIO_FILE}" -C "$(dirname "${AUDIO_DIR}")"
  echo "[$(date)] Audios restaurés."
else
  echo "[$(date)] Pas d'archive audio trouvée."
fi

echo ""
echo "[$(date)] Restauration terminée."
echo "N'oubliez pas de relancer les migrations si nécessaire :"
echo "  npm run db:migrate:deploy"
