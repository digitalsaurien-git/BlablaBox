import path from "node:path";
import { suggestReferenceFromFilename } from "./ordering.ts";
import type { SmartCourseProposal, SmartSubjectOption, SmartThemeOption } from "./smart-types.ts";

type SubjectInput = { id: string; title: string; themes: SmartThemeOption[] };

const SUBJECT_RULES = [
  { names: ["histoire geo", "histoire geographie", "histoire", "geographie"], words: ["humanite", "prehistoire", "antiquite", "histoire", "geographie", "moyen age", "revolution", "guerre", "civilisation", "continent", "population"] },
  { names: ["mathematiques", "maths", "mathematique"], words: ["nombre", "nombres entiers", "calcul", "chiffre", "numeration", "fraction", "geometrie", "equation", "multiplication", "division", "algebre"] },
  { names: ["anglais", "english"], words: ["english", "school", "vocabulary", "classroom", "miss", "teacher", "grammar", "verb", "lesson", "homework"] },
  { names: ["francais", "lettres"], words: ["francais", "grammaire", "conjugaison", "orthographe", "litterature", "poesie", "roman", "lecture", "vocabulaire"] },
  { names: ["sciences", "svt", "sciences de la vie et de la terre"], words: ["cellule", "vivant", "organisme", "ecosysteme", "genetique", "geologie", "terre", "biologie"] },
  { names: ["physique chimie", "physique", "chimie"], words: ["atome", "molecule", "energie", "electricite", "vitesse", "force", "reaction chimique", "matiere"] },
];

export function normalizeCourseText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr")
    .replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sentenceCase(value: string): string {
  if (!value) return "Cours sans titre";
  return value.charAt(0).toLocaleUpperCase("fr") + value.slice(1);
}

export function cleanCourseTitle(fileName: string, internalTitle?: string | null): string {
  const base = path.basename(fileName).replace(/\.(?:pdf|odt)$/i, "").replace(/\s*\(\d+\)\s*$/i, "");
  let cleaned = base.replace(/^\s*cours(?:\s*[-_.:]\s*|\s+)/i, "")
    .replace(/(?:^|[\s._-])(\d+(?:\s*\.\s*\d+)+)\s*$/i, "")
    .replace(/[._-]+/g, " ").replace(/\s+/g, " ").replace(/^[\s,;:]+|[\s,;:]+$/g, "").trim();
  const fallback = internalTitle?.replace(/\s+/g, " ").trim();
  if ((!cleaned || /^(?:document|scan|image)$/i.test(cleaned)) && fallback) cleaned = fallback;
  if (/^d[eé]buts?\s+de\b/i.test(cleaned)) cleaned = `Les ${cleaned.toLocaleLowerCase("fr")}`;
  return sentenceCase(cleaned).slice(0, 160);
}

function occurrenceScore(evidence: string, word: string): number {
  const normalized = normalizeCourseText(word);
  if (!normalized || !evidence.includes(normalized)) return 0;
  return normalized.includes(" ") ? 4 : Math.min(3, Math.max(1, normalized.length >= 7 ? 2 : 1));
}

export function scoreSubject(title: string, evidence: string): number {
  const subject = normalizeCourseText(title);
  const rule = SUBJECT_RULES.find((candidate) => candidate.names.some((name) => subject === name || subject.includes(name) || name.includes(subject)));
  const direct = subject && evidence.includes(subject) ? 5 : 0;
  return direct + (rule ? Math.max(...rule.words.map((word) => occurrenceScore(evidence, word)), 0) + rule.words.filter((word) => occurrenceScore(evidence, word) > 0).length : 0);
}

function tokenSimilarity(left: string, right: string): number {
  const a = new Set(normalizeCourseText(left).split(" ").filter((token) => token.length > 2));
  const b = new Set(normalizeCourseText(right).split(" ").filter((token) => token.length > 2));
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((token) => b.has(token)).length;
  return common / Math.max(a.size, b.size);
}

export function suggestTheme(courseTitle: string, themes: SmartThemeOption[]): SmartSubjectOption["themeSuggestion"] {
  const normalized = normalizeCourseText(courseTitle);
  const exact = themes.find((theme) => normalizeCourseText(theme.title) === normalized);
  if (exact) return { kind: "existing", themeId: exact.id, title: exact.title };
  const ranked = themes.map((theme) => ({ theme, similarity: tokenSimilarity(courseTitle, theme.title) })).sort((a, b) => b.similarity - a.similarity);
  if (ranked[0]?.similarity >= 0.8 && (ranked[1]?.similarity ?? 0) <= ranked[0].similarity - 0.2) return { kind: "existing", themeId: ranked[0].theme.id, title: ranked[0].theme.title };
  if (ranked[0]?.similarity >= 0.45) return { kind: "uncertain", themeId: ranked[0].theme.id, title: ranked[0].theme.title };
  return { kind: "new", themeId: null, title: null };
}

export function buildSmartCourseProposal(input: { fileName: string; internalTitle?: string | null; extractedText?: string; readableText: boolean; subjects: SubjectInput[] }): SmartCourseProposal {
  const courseTitle = cleanCourseTitle(input.fileName, input.internalTitle);
  const evidence = normalizeCourseText(`${input.fileName} ${input.internalTitle ?? ""} ${(input.extractedText ?? "").slice(0, 12_000)}`);
  const subjects = input.subjects.map((subject) => ({ ...subject, score: scoreSubject(subject.title, evidence), themeSuggestion: suggestTheme(courseTitle, subject.themes) }));
  const ranked = [...subjects].sort((left, right) => right.score - left.score);
  const suggestedSubjectId = ranked[0] && ranked[0].score >= 2 && ranked[0].score >= (ranked[1]?.score ?? 0) + 2 ? ranked[0].id : null;
  return { courseTitle, referenceLabel: suggestReferenceFromFilename(input.fileName), readableText: input.readableText, suggestedSubjectId, subjects };
}
