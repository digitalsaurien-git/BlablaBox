import { z } from 'zod';

export const driveImageSchema = z.object({
  fileId: z.string().min(1).max(200),
  caption: z.string().max(300).optional(),
  mimeType: z.string().max(100).optional(),
});

export const courseMetadataSchema = z.object({
  driveImages: z.array(driveImageSchema).max(20).optional(),
});

export type CourseMetadata = z.infer<typeof courseMetadataSchema>;
export type DriveImage = z.infer<typeof driveImageSchema>;

export function parseCourseMetadata(raw: unknown): CourseMetadata {
  const result = courseMetadataSchema.safeParse(raw);
  return result.success ? result.data : {};
}
