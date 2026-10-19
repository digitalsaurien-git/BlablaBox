#!/usr/bin/env node
/**
 * Script pour attacher une image Google Drive à un cours.
 *
 * Usage :
 *   node scripts/attach-drive-image.mjs \
 *     --email "user@example.com" \
 *     --theme-title "Vivant, minéral, technique" \
 *     --file-id "1PGmz8tGXNBjJ2ezi2YuvcF0XXYjdkJN1" \
 *     --caption "Composantes de l'environnement — schéma au tableau"
 *     [--remove]
 *
 * Nécessite DATABASE_URL dans l'environnement (fichier .env ou variable).
 */

import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Charger .env si présent
try {
  const envPath = path.join(__dirname, '..', '.env');
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* pas de .env */ }

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    'theme-title': { type: 'string' },
    'file-id': { type: 'string' },
    caption: { type: 'string' },
    remove: { type: 'boolean', default: false },
  },
});

if (!values.email || !values['theme-title'] || !values['file-id']) {
  console.error('Usage: node scripts/attach-drive-image.mjs --email <email> --theme-title <title> --file-id <driveFileId> [--caption <text>] [--remove]');
  process.exit(1);
}

// Import dynamique de Prisma (doit être construit)
const require = createRequire(import.meta.url);
let PrismaClient;
try {
  ({ PrismaClient } = require('@prisma/client'));
} catch {
  console.error('Erreur : @prisma/client introuvable. Exécuter npm run db:generate.');
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  const user = await db.user.findUnique({ where: { email: values.email }, select: { id: true } });
  if (!user) { console.error(`Utilisateur "${values.email}" introuvable.`); process.exit(1); }

  const theme = await db.courseTheme.findFirst({
    where: { userId: user.id, title: values['theme-title'], deletedAt: null },
    select: { id: true, title: true, metadata: true },
  });
  if (!theme) { console.error(`Cours "${values['theme-title']}" introuvable pour cet utilisateur.`); process.exit(1); }

  // Lire les métadonnées existantes
  const meta = (theme.metadata && typeof theme.metadata === 'object') ? theme.metadata : {};
  const driveImages = Array.isArray(meta.driveImages) ? meta.driveImages : [];

  const fileId = values['file-id'];

  if (values.remove) {
    const updated = driveImages.filter(img => img.fileId !== fileId);
    await db.courseTheme.update({ where: { id: theme.id }, data: { metadata: { ...meta, driveImages: updated } } });
    console.log(`✓ Image ${fileId} retirée du cours "${theme.title}"`);
    return;
  }

  if (driveImages.some(img => img.fileId === fileId)) {
    console.log(`⚠ Image ${fileId} déjà présente dans le cours "${theme.title}"`);
    return;
  }

  const image = { fileId, ...(values.caption ? { caption: values.caption } : {}), mimeType: 'image/jpeg' };
  await db.courseTheme.update({ where: { id: theme.id }, data: { metadata: { ...meta, driveImages: [...driveImages, image] } } });
  console.log(`✓ Image ${fileId} attachée au cours "${theme.title}" (id: ${theme.id})`);
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => db.$disconnect());
