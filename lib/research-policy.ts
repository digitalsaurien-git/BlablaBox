import type { ResearchMode, ResponseMode } from "./providers/llm/types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const documentarySignals = [
  /\bsources?\b/,
  /\bcitations?\b/,
  /\bverifi(?:e|es|er|cation|ez)\b/,
  /\bdocument(?:e|ee|er|ation|aire)\b/,
  /\bavec preuves?\b/,
  /\ba jour\b/,
  /\bactuel(?:le|les|s)?\b/,
  /\baujourd'hui\b/,
  /\ben ce moment\b/,
  /\bdernier(?:e|es|s)?\b/,
  /\brecent(?:e|es|s)?\b/,
  /\bnouve(?:au|aux|lle|lles)\b/,
  /\bchiffres? (?:actuels?|recents?)\b/,
  /\bstatistiques? (?:actuelles?|recentes?)\b/,
  /\bprix (?:actuel|courant|aujourd'hui)\b/,
  /\bqui est (?:le|la) (?:president|premier ministre|dirigeant|directeur|pdg)\b/,
  /\b(?:meteo|prix|horaires?|taux de change)\b/,
  /\b(?:loi|reglementation|reglement) en vigueur\b/,
  /\b(?:president|premier ministre|pdg|ceo) (?:de|du|des|d')\b/,
];

export function requiresDocumentaryResearch(userRequest: string): boolean {
  const normalized = normalize(userRequest);
  return (
    documentarySignals.some((signal) => signal.test(normalized)) ||
    normalized.includes(String(new Date().getFullYear()))
  );
}

export function resolveResearchMode(
  responseMode: ResponseMode,
  userRequest: string,
): ResearchMode {
  if (requiresDocumentaryResearch(userRequest)) {
    return "REQUIRED";
  }

  return responseMode === "STORY" ? "NONE" : "AUTO";
}
