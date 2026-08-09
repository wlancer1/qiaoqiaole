export function validatePasswordLength(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}

export function passwordValidationMessage(password: string): string {
  if (password.length > 0 && password.length < 8) return '密码至少需要 8 位';
  if (password.length > 128) return '密码长度不能超过 128 位';
  return '';
}
