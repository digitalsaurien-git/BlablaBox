import type { LearningContentSource } from "./providers/llm/types";

const MAX_DISPLAYED_SOURCES = 8;
const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "_hsenc",
  "_hsmi",
]);

export type RawUrlCitation = {
  url: string;
  title?: string;
  startIndex?: number;
  endIndex?: number;
};

export function normalizeSourceUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    for (const parameter of Array.from(parsed.searchParams.keys())) {
      const normalizedParameter = parameter.toLowerCase();
      if (normalizedParameter.startsWith("utm_") || TRACKING_PARAMETERS.has(normalizedParameter)) {
        parsed.searchParams.delete(parameter);
      }
    }
    parsed.searchParams.sort();
    return parsed.href;
  } catch {
    return null;
  }
}

function sourceQualityScore(url: string): number {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  let score = 0;
  if (/\.(gov|mil)$/.test(hostname) || hostname.endsWith(".gouv.fr")) score += 100;
  if (/\.(edu|ac\.uk)$/.test(hostname) || hostname.includes("universite")) score += 80;
  if (/\.(int)$/.test(hostname)) score += 75;
  if (/(who\.int|nih\.gov|inserm\.fr|cnrs\.fr|pasteur\.fr)$/.test(hostname)) score += 50;
  if (hostname.endsWith(".org")) score += 20;
  if (/(reddit|scribd|quora)\./.test(hostname) || /(^|\.)(forum|forums)\./.test(hostname)) {
    score -= 100;
  }
  return score;
}

function isCitationLikeSpan(span: string): boolean {
  const normalized = span.trim();
  return (
    /https?:\/\//i.test(normalized) ||
    /cite[^]+/.test(normalized) ||
    /^\(?\[[^\]]+\]\(/.test(normalized) ||
    /^\(?\[?[\w.-]+\.[a-z]{2,}/i.test(normalized)
  );
}

function stripGeneratedSourcesSection(text: string): string {
  const lines = text.split("\n");
  const earliestHeading = Math.floor(lines.length * 0.4);
  const headingIndex = lines.findIndex(
    (line, index) =>
      index >= earliestHeading &&
      /^\s{0,3}(?:#{1,4}\s*)?(?:sources?|sources documentaires|références)\s*:?\s*$/i.test(line),
  );
  return headingIndex >= 0 ? lines.slice(0, headingIndex).join("\n").trimEnd() : text;
}

function cleanVisibleLinks(
  text: string,
  sourceNumbers: Map<string, number>,
  rawCitations: RawUrlCitation[],
): string {
  let cleaned = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
    (_match, label: string, url: string) => {
      const normalizedUrl = normalizeSourceUrl(url);
      const sourceNumber = normalizedUrl ? sourceNumbers.get(normalizedUrl) : undefined;
      return sourceNumber ? `[${sourceNumber}]` : label;
    },
  );

  cleaned = cleaned.replace(
    /\(\[[^\]]+\]\(\s*(\[\d+\](?:\s+\[\d+\])*)\s*\)\)/g,
    "$1",
  );
  cleaned = cleaned.replace(
    /\(\[([^\]]+)\]\(\s*([^)]*)\s*\)\)/g,
    (_match, label: string, target: string) =>
      /\[\d+\]/.test(target) ? target : label,
  );

  for (const citation of rawCitations) {
    const normalizedUrl = normalizeSourceUrl(citation.url);
    const sourceNumber = normalizedUrl ? sourceNumbers.get(normalizedUrl) : undefined;
    if (!sourceNumber) continue;
    cleaned = cleaned.replaceAll(citation.url, `[${sourceNumber}]`);
    if (normalizedUrl && normalizedUrl !== citation.url) {
      cleaned = cleaned.replaceAll(normalizedUrl, `[${sourceNumber}]`);
    }
  }

  return cleaned
    .replace(/cite[^]+/g, "")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/gi, "$1")
    .replace(/\[([^\]]+)\]\(\s*\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+/gi, "")
    .replace(/(\[\d+\])(?:\s+\1)+/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function formatCitedLearningContent(
  rawContent: string,
  rawCitations: RawUrlCitation[],
): { content: string; sources: LearningContentSource[] } {
  const candidates = new Map<
    string,
    {
      url: string;
      title?: string;
      firstPosition: number;
      citationCount: number;
      quality: number;
    }
  >();

  for (const citation of rawCitations) {
    const url = normalizeSourceUrl(citation.url);
    if (!url) continue;
    const position = Number.isInteger(citation.startIndex) && citation.startIndex! >= 0
      ? citation.startIndex!
      : Number.MAX_SAFE_INTEGER;
    const existing = candidates.get(url);
    candidates.set(url, {
      url,
      title: (existing?.title ?? citation.title?.trim()) || undefined,
      firstPosition: Math.min(existing?.firstPosition ?? position, position),
      citationCount: (existing?.citationCount ?? 0) + 1,
      quality: sourceQualityScore(url),
    });
  }

  const selected = Array.from(candidates.values())
    .sort(
      (left, right) =>
        right.quality - left.quality ||
        right.citationCount - left.citationCount ||
        left.firstPosition - right.firstPosition,
    )
    .slice(0, MAX_DISPLAYED_SOURCES)
    .sort((left, right) => left.firstPosition - right.firstPosition);
  const sourceNumbers = new Map(selected.map((source, index) => [source.url, index + 1]));

  const edits = new Map<string, { start: number; end: number; markers: Set<number> }>();
  for (const citation of rawCitations) {
    if (
      !Number.isInteger(citation.startIndex) ||
      !Number.isInteger(citation.endIndex) ||
      citation.startIndex! < 0 ||
      citation.endIndex! < citation.startIndex! ||
      citation.endIndex! > rawContent.length
    ) {
      continue;
    }
    const key = `${citation.startIndex}:${citation.endIndex}`;
    const edit = edits.get(key) ?? {
      start: citation.startIndex!,
      end: citation.endIndex!,
      markers: new Set<number>(),
    };
    const normalizedUrl = normalizeSourceUrl(citation.url);
    const sourceNumber = normalizedUrl ? sourceNumbers.get(normalizedUrl) : undefined;
    if (sourceNumber) edit.markers.add(sourceNumber);
    edits.set(key, edit);
  }

  // Les marqueurs numériques éventuellement produits par le modèle ne sont
  // pas fiables : ils sont neutralisés en conservant leur longueur pour que
  // les offsets des annotations restent valides.
  let content = rawContent.replace(/\[\d+\]/g, (marker) => " ".repeat(marker.length));
  const orderedEdits = Array.from(edits.values()).sort((left, right) => right.start - left.start);
  for (const edit of orderedEdits) {
    const span = content.slice(edit.start, edit.end);
    const markers = Array.from(edit.markers).sort((left, right) => left - right);
    const markerText = markers.map((marker) => `[${marker}]`).join(" ");
    if (isCitationLikeSpan(span)) {
      content = `${content.slice(0, edit.start)}${markerText}${content.slice(edit.end)}`;
    } else if (markerText) {
      content = `${content.slice(0, edit.end)} ${markerText}${content.slice(edit.end)}`;
    }
  }

  content = cleanVisibleLinks(stripGeneratedSourcesSection(content), sourceNumbers, rawCitations);
  const sources = selected.map((source, sourceOrder) => {
    const marker = `[${sourceOrder + 1}]`;
    const citationStart = content.indexOf(marker);
    return {
      url: source.url,
      title: source.title,
      domain: new URL(source.url).hostname.replace(/^www\./, ""),
      sourceOrder,
      citationStart: citationStart >= 0 ? citationStart : undefined,
      citationEnd: citationStart >= 0 ? citationStart + marker.length : undefined,
    };
  });

  return { content, sources };
}
