import { z } from 'zod';

/**
 * Schéma Zod pour le champ `ProjectVersion.audio` (Json @default("{}")).
 * La map associe une clé d'audio ("content", "question-N", "feedback-N")
 * à l'entrée du fichier audio préparé et à son hash de cache.
 */
export const audioEntrySchema = z.object({
  file: z.string().min(1),
  hash: z.string().min(1),
}).strict();

export const audioSchema = z.record(z.string(), audioEntrySchema);

export type AudioEntry = z.infer<typeof audioEntrySchema>;
export type AudioMap = z.infer<typeof audioSchema>;

/**
 * Parse le champ Json brut de Prisma en AudioMap typée.
 * Retourne une map vide si la valeur est null / absent.
 */
export function parseAudio(raw: unknown): AudioMap {
  if (raw === null || raw === undefined) return {};
  return audioSchema.parse(raw);
}
