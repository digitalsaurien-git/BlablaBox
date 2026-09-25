export function ownedProjectWhere(userId: string, projectId: string) {
  return { id: projectId, userId, deletedAt: null };
}

export function ownedProjectsWhere(userId: string) {
  return { userId, deletedAt: null };
}
