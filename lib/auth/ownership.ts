export function ownedProjectWhere(userId: string, projectId: string) {
  return { id: projectId, userId };
}

export function ownedProjectsWhere(userId: string) {
  return { userId };
}
