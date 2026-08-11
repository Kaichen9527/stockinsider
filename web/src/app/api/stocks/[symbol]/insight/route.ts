import { GET as getDecisionRevision } from '../deep-dive/route';

export const dynamic='force-dynamic';

export async function GET(request:Request,context:{params:Promise<{symbol:string}>}){
  return getDecisionRevision(request,context);
}
