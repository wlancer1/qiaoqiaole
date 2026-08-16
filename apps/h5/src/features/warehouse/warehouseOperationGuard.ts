export function isWarehouseOperationCurrent({ operation, currentOperation, scope, currentScope, token, currentToken }: {
  operation: number;
  currentOperation: number;
  scope: string;
  currentScope: string;
  token: string;
  currentToken: string;
}): boolean {
  return operation === currentOperation && scope === currentScope && token === currentToken;
}
