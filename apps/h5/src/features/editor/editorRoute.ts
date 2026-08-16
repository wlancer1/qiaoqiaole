export type EditorProjectRoute = { projectId: string };

/** Parses one URL-encoded project segment without accepting path/control injection. */
export function parseEditorProjectRoute(pathname: string): EditorProjectRoute | null {
  const match = pathname.match(/^\/projects\/([^/]+)\/edit\/?$/);
  if (!match) return null;
  try {
    const projectId = decodeURIComponent(match[1]);
    if (!projectId || /[\/\u0000-\u001f\u007f]/.test(projectId)) return null;
    return { projectId };
  } catch {
    return null;
  }
}
