import { getOwnerOidcRuntime } from '../../../../lib/vnext/owner-oidc.ts';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const POST = (request: Request) => getOwnerOidcRuntime().login(request);
export const GET = (request: Request) => getOwnerOidcRuntime().login(request);
