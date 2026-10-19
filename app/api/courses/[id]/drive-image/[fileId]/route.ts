import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { parseCourseMetadata } from '@/lib/courses/course-metadata';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const user = await requireCurrentUser();
  const { id: courseId, fileId: rawFileId } = await params;

  // Decode the fileId (may be URI-encoded)
  const fileId = decodeURIComponent(rawFileId);

  // Verify the course belongs to the current user
  const course = await prisma.courseTheme.findFirst({
    where: { id: courseId, userId: user.id, deletedAt: null },
    select: { metadata: true },
  });
  if (!course) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Verify the fileId is in the course's metadata whitelist
  const metadata = parseCourseMetadata(course.metadata);
  const allowed = (metadata.driveImages ?? []).some(img => img.fileId === fileId);
  if (!allowed) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return new NextResponse('Drive API key not configured', { status: 500 });
  }

  // Proxy the image from Google Drive
  const driveUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${apiKey}`;
  const driveRes = await fetch(driveUrl);
  if (!driveRes.ok) {
    return new NextResponse('Failed to fetch image from Drive', { status: driveRes.status });
  }

  const contentType = driveRes.headers.get('content-type') ?? 'image/jpeg';
  const body = await driveRes.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
