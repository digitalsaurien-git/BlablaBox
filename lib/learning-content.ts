import type {
  DeliveryType,
  LearningContentSource,
  ResponseMode,
} from "./providers/llm/types";
import { normalizeSourceUrl } from "./source-citations.ts";

export function createLearningTitle(userRequest: string): string {
  const normalized = userRequest.replace(/\s+/g, " ").trim();
  if (!normalized) return "Nouvelle demande";
  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
}

export function responseModeToDeliveryType(responseMode: ResponseMode): DeliveryType {
  if (responseMode === "STORY") return "IMMERSIVE_STORY";
  if (responseMode === "REVIEW") return "REVIEW_QA";
  return "COURSE_SUMMARY";
}

export function responseModeToDuration(responseMode: ResponseMode): number {
  return responseMode === "QUICK" ? 3 : 5;
}

export function sanitizeLearningSources(
  sources: LearningContentSource[],
): LearningContentSource[] {
  const safeSources: LearningContentSource[] = [];
  const seenUrls = new Set<string>();

  for (const source of sources) {
    if (safeSources.length >= 8) break;
    let parsedUrl: URL;
    const normalizedUrl = normalizeSourceUrl(source.url);
    if (!normalizedUrl) continue;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      continue;
    }

    if (!(["http:", "https:"] as string[]).includes(parsedUrl.protocol)) continue;
    if (seenUrls.has(parsedUrl.href)) continue;
    seenUrls.add(parsedUrl.href);

    const start = Number.isInteger(source.citationStart) && source.citationStart! >= 0
      ? source.citationStart
      : undefined;
    const end = Number.isInteger(source.citationEnd) && source.citationEnd! >= 0
      ? source.citationEnd
      : undefined;

    safeSources.push({
      url: parsedUrl.href,
      title: source.title?.trim().slice(0, 500) || undefined,
      domain: (source.domain?.trim() || parsedUrl.hostname.replace(/^www\./, "")).slice(0, 255),
      sourceOrder: safeSources.length,
      citationStart: start,
      citationEnd: start !== undefined && end !== undefined && end >= start ? end : undefined,
    });
  }

  return safeSources;
}
