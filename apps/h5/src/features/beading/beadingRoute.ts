export function parseBeadingRoute(pathname: string): { projectId: string } | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/beading\/?$/);
  if (!match?.[1]) return null;
  try {
    const projectId = decodeURIComponent(match[1]);
    return projectId ? { projectId } : null;
  } catch {
    return null;
  }
}
