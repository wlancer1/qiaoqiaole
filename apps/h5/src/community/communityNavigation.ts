export type DetailBackTarget = 'home' | 'author-profile';
export type AuthorBackTarget = 'discover' | 'detail';

export function nextDetailBackTarget(currentScreen: string): DetailBackTarget {
  return currentScreen === 'author-profile' ? 'author-profile' : 'home';
}

export function nextAuthorBackTarget(currentScreen: string): AuthorBackTarget {
  return currentScreen === 'pattern-detail' ? 'detail' : 'discover';
}

export function myWorksBackTarget(): 'profile' {
  return 'profile';
}
