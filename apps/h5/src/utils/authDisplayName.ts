type RestoredUser = {
  nickname?: unknown;
  username?: unknown;
};

const SAFE_DEFAULT_DISPLAY_NAME = '我的创作';

function normalizeDisplayName(candidate: unknown): string | undefined {
  if (typeof candidate !== 'string') return undefined;

  const displayName = candidate.trim();
  if (!displayName || displayName.startsWith('phone_')) return undefined;

  return displayName;
}

export function resolveRestoredDisplayName(
  user: RestoredUser,
  storedDisplayName: unknown,
): string {
  return [user.nickname, user.username, storedDisplayName]
    .map(normalizeDisplayName)
    .find((candidate): candidate is string => candidate !== undefined)
    ?? SAFE_DEFAULT_DISPLAY_NAME;
}
