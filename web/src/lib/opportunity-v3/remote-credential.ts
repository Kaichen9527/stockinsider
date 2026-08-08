export type PostgrestRemoteErrorV3 = {
  code?: string;
  message?: string;
};

export function isPreFunctionCredentialRejectionV3(
  status: number,
  error: PostgrestRemoteErrorV3,
): boolean {
  return (status === 401 || status === 403) &&
    !String(error.code ?? '').startsWith('PT');
}
