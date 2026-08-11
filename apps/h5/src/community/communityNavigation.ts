export type DetailBackTarget = 'home' | 'author-profile';
export type AuthorBackTarget = 'discover' | 'detail' | 'following' | 'followers';

export function nextDetailBackTarget(currentScreen: string): DetailBackTarget {
  return currentScreen === 'author-profile' ? 'author-profile' : 'home';
}

export function nextAuthorBackTarget(currentScreen: string): AuthorBackTarget {
  if (currentScreen === 'pattern-detail') return 'detail';
  if (currentScreen === 'following') return 'following';
  if (currentScreen === 'followers') return 'followers';
  return 'discover';
}

export function myWorksBackTarget(): 'profile' {
  return 'profile';
}
