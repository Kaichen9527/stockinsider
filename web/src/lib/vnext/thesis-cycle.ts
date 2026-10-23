import { auditPublishedThesis,type ThesisAuditInput } from './thesis-audit.ts';
import type {TrustedThesisAdmission} from './store.ts';
type Row=Record<string,unknown>;
/** The same cache audit/record/admit sequence is used by the HTTP worker and
 * trusted synthetic transports. No provider is called by the all-active audit. */
export async function auditThesisCycle(inputs:ThesisAuditInput[],deps:{record(reports:ReturnType<typeof auditPublishedThesis>[]):Promise<Row>;screen?: (audits:Record<string,TrustedThesisAdmission>)=>Promise<Row>}){
 if(inputs.length>20 || new Set(inputs.map((input)=>input.symbol)).size!==inputs.length)throw new Error('vnext_weekly_unique_active_scope');
 const reports=inputs.map(auditPublishedThesis);const receipt=await deps.record(reports);
 const audits=Object.fromEntries(reports.map((report)=>[report.symbol,report])) as Record<string,TrustedThesisAdmission>;
 const admission=deps.screen?await deps.screen(audits):{jobs:[],reason:'audit_only'};
 return {reviewed:reports.length,reports,receipt,admission};
}
