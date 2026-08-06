const DEFAULT_MAX_SCRIPT_CHARACTERS = 12_000;

export function getMaxTTSScriptCharacters(): number {
  const configured = Number(process.env.TTS_MAX_SCRIPT_CHARACTERS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_SCRIPT_CHARACTERS;
}

export function validateTTSScript(script: string | null): string {
  const normalized = script?.trim() ?? "";
  if (!normalized) throw new Error("Le script est vide. Générez et validez un script avant de créer l'audio.");
  const maximum = getMaxTTSScriptCharacters();
  if (normalized.length > maximum) {
    throw new Error(`Le script contient ${normalized.length} caractères, au-delà de la limite de ${maximum}. Choisissez une durée plus courte. La génération par chapitres sera proposée dans une version future.`);
  }
  return normalized;
}

export function toPublicAudioError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return "La génération audio a échoué. Réessayez ultérieurement.";
}
