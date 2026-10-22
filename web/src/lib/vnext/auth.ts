import { timingSafeEqual } from 'node:crypto';
type Role = 'operator' | 'author' | 'reviewer';
export type VnextIdentity = Readonly<{ principal: string; role: Role }>;
/** Separate credential bindings are deployment configuration, never request fields. */
export function vnextIdentity(request: Request): VnextIdentity | null {
  if (request.headers.has('x-internal-key')) return null;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = Buffer.from(authorization.slice(7));
  const bindings: Array<{ role: Role; token?: string; principal?: string }> = [
    { role: 'operator', token: process.env.INTERNAL_API_KEY, principal: process.env.STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL },
    { role: 'author', token: process.env.STOCKINSIDER_VNEXT_AUTHOR_KEY, principal: process.env.STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL },
    { role: 'reviewer', token: process.env.STOCKINSIDER_VNEXT_REVIEWER_KEY, principal: process.env.STOCKINSIDER_VNEXT_REVIEWER_PRINCIPAL },
  ];
  const matches = bindings.filter((binding) => {
    if (!binding.token || !binding.principal) return false;
    const expected = Buffer.from(binding.token);
    return token.length === expected.length && timingSafeEqual(token, expected);
  });
  // Ambiguous credentials cannot impersonate another research role.
  if (matches.length !== 1) return null;
  return Object.freeze({ principal: matches[0].principal!, role: matches[0].role });
}
