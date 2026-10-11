// Isolated synthetic upstream schema/identity fixture only. No production authority.
// Extracted from pinned75a maker fixture; independent full native acceptance remains required.
export function createAuthorAssignmentFixture(sql,{q,job,reservation,company,priority,snapshot,owner}) {
  sql(`CREATE TABLE research_observed_companies_v1(research_company_id uuid PRIMARY KEY,symbol text);
   CREATE TABLE research_observed_roster_snapshots_v1(snapshot_hash text PRIMARY KEY,mapping_digest text,received_at timestamptz,latest_observed_at timestamptz);
   CREATE TABLE research_observed_roster_members_v1(snapshot_hash text,research_company_id uuid,symbol text);
   CREATE TABLE research_priority_runs_v1(run_id uuid PRIMARY KEY,research_scope text,observed_snapshot_hash text,as_of timestamptz,input_hash text);
   CREATE TABLE research_observed_priority_store_receipts_v1(run_id uuid,stored_run_hash text);
   CREATE TABLE research_deep_jobs_v1(job_id uuid PRIMARY KEY,priority_run_id uuid,symbol text,stock_id uuid,research_scope text,research_company_id uuid,observed_snapshot_hash text,status text,attempts integer,lease_owner text,lease_expires_at timestamptz);
   CREATE TABLE research_deep_job_attempts_v1(job_id uuid,attempt integer,owner text,claimed_at timestamptz,lease_expires_at timestamptz);
   CREATE TABLE research_model_reservations_v1(reservation_id uuid PRIMARY KEY,role text,owner text,work_key text,started_at timestamptz,lease_expires_at timestamptz);
   CREATE TABLE research_model_completions_v1(reservation_id uuid);
   CREATE TABLE stocks(id uuid PRIMARY KEY,symbol text);
   INSERT INTO research_observed_companies_v1 VALUES(${q(company)},'5347');
   INSERT INTO research_observed_roster_snapshots_v1 VALUES(${q(snapshot)},${q('b'.repeat(64))},now()-interval '3 minute',now()-interval '4 minute');
   INSERT INTO research_observed_roster_members_v1 VALUES(${q(snapshot)},${q(company)},'5347');
   INSERT INTO research_priority_runs_v1 VALUES(${q(priority)},'research_observed_v1',${q(snapshot)},now()-interval '2 minute',${q('c'.repeat(64))});
   INSERT INTO research_observed_priority_store_receipts_v1 SELECT run_id,encode(sha256(convert_to(to_jsonb(r)::text,'UTF8')),'hex') FROM research_priority_runs_v1 r;
   INSERT INTO research_deep_jobs_v1 VALUES(${q(job)},${q(priority)},'5347',NULL,'research_observed_v1',${q(company)},${q(snapshot)},'running',1,${q(owner)},now()+interval '28 minute');
   INSERT INTO research_deep_job_attempts_v1 SELECT job_id,1,lease_owner,now()-interval '1 minute',lease_expires_at FROM research_deep_jobs_v1;
   INSERT INTO research_model_reservations_v1 VALUES(${q(reservation)},'company_research',${q(owner)},${q('deep:'+job+':1')},now()-interval '1 minute',now()+interval '28 minute');`);

}
