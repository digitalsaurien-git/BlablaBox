const DEFAULT_MAX_SCRIPT_CHARACTERS = 4_096;
const DEFAULT_SEGMENT_TARGET_CHARACTERS = 3_500;

export function getMaxTTSScriptCharacters(): number {
  const configured = Number(process.env.TTS_MAX_SCRIPT_CHARACTERS);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_SCRIPT_CHARACTERS;
}

export function validateTTSScript(script: string | null): string {
  const normalized = script?.trim() ?? "";
  if (!normalized) throw new Error("Le script est vide. Générez et validez un script avant de créer l'audio.");
  return normalized;
}

export function getTTSSegmentTargetCharacters(): number {
  const maximum = getMaxTTSScriptCharacters();
  const configured = Number(process.env.TTS_SEGMENT_TARGET_CHARACTERS);
  const target = Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_SEGMENT_TARGET_CHARACTERS;
  return Math.min(target, maximum, DEFAULT_SEGMENT_TARGET_CHARACTERS);
}

function findLastBoundary(
  text: string,
  start: number,
  end: number,
  pattern: RegExp,
): number | null {
  const window = text.slice(start, end);
  let boundary: number | null = null;
  for (const match of window.matchAll(pattern)) {
    boundary = start + match.index + match[0].length;
  }
  return boundary;
}

export function segmentTTSScript(script: string | null): string[] {
  const normalized = validateTTSScript(script);
  const maximum = getMaxTTSScriptCharacters();
  const target = getTTSSegmentTargetCharacters();
  const segments: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const proposedEnd = Math.min(start + target, normalized.length);
    if (proposedEnd === normalized.length) {
      segments.push(normalized.slice(start));
      break;
    }

    const paragraphBoundary = findLastBoundary(
      normalized,
      start,
      proposedEnd,
      /\r?\n[\t ]*\r?\n/g,
    );
    const sentenceBoundary = findLastBoundary(
      normalized,
      start,
      proposedEnd,
      /[.!?…](?:["”’»\])}]*)\s+/g,
    );
    const whitespaceBoundary = findLastBoundary(
      normalized,
      start,
      proposedEnd,
      /\s+/g,
    );
    const end = paragraphBoundary ?? sentenceBoundary ?? whitespaceBoundary;

    if (end === null || end <= start) {
      throw new Error(
        `Le texte contient un mot ou une adresse de plus de ${target} caractères. BlablaBox refuse de le couper au milieu pour éviter un audio tronqué.`,
      );
    }

    const segment = normalized.slice(start, end);
    if (segment.length > maximum) {
      throw new Error(`Un segment audio dépasse la limite du provider de ${maximum} caractères.`);
    }
    segments.push(segment);
    start = end;
  }

  if (segments.join("") !== normalized) {
    throw new Error("La segmentation audio n'a pas conservé l'intégralité du texte.");
  }
  if (segments.some((segment) => segment.length > maximum)) {
    throw new Error(`Un segment audio dépasse la limite du provider de ${maximum} caractères.`);
  }

  return segments;
}

export function toPublicAudioError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message.slice(0, 500);
  return "La génération audio a échoué. Réessayez ultérieurement.";
}
