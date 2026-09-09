export type CoursePartOrderInput = {
  referenceLabel: string | null | undefined;
  position: number;
  id?: string;
};

export function parseNaturalSegments(referenceLabel: string | null | undefined): number[] {
  const value = referenceLabel?.trim() ?? "";
  if (!/^\d+(?:\s*\.\s*\d+)*$/.test(value)) return [];
  const segments = value.split(".").map((segment) => Number(segment.trim()));
  return segments.every((segment) => Number.isSafeInteger(segment) && segment <= 2147483647) ? segments : [];
}

export function compareNaturalReferences(
  left: CoursePartOrderInput,
  right: CoursePartOrderInput,
): number {
  const leftSegments = parseNaturalSegments(left.referenceLabel);
  const rightSegments = parseNaturalSegments(right.referenceLabel);
  if (leftSegments.length !== rightSegments.length || leftSegments.length > 0 || rightSegments.length > 0) {
    if (leftSegments.length === 0 && rightSegments.length > 0) return 1;
    if (leftSegments.length > 0 && rightSegments.length === 0) return -1;
    for (let index = 0; index < Math.max(leftSegments.length, rightSegments.length); index += 1) {
      const difference = (leftSegments[index] ?? -1) - (rightSegments[index] ?? -1);
      if (difference !== 0) return difference;
    }
  }
  const positionDifference = left.position - right.position;
  if (positionDifference !== 0) return positionDifference;
  return (left.id ?? "").localeCompare(right.id ?? "");
}

export function sortCourseParts<T extends CoursePartOrderInput>(parts: T[]): T[] {
  return [...parts].sort(compareNaturalReferences);
}

export function suggestReferenceFromFilename(fileName: string): string | null {
  const matches = fileName.match(/(?:^|[\s._-])(\d+(?:\s*\.\s*\d+)+)(?=$|[\s._-])/g);
  if (!matches?.length) return null;
  const candidate = matches[matches.length - 1].replace(/^[\s._-]+|[\s._-]+$/g, "");
  return candidate.replace(/\s+/g, "");
}
