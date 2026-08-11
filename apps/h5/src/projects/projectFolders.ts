export type ProjectFolder = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export const UNCATEGORIZED_FOLDER_ID = null;

export function resolveFolderId(folderId: string | null | undefined, folders: ProjectFolder[]): string | null {
  return folderId && folders.some((folder) => folder.id === folderId) ? folderId : null;
}
