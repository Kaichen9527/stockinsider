BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT json_build_object('kind','current_writer','releaseId',release_id,'active',active,'activatedAt',activated_at) FROM public.production_writer_releases WHERE active;
SELECT json_build_object('kind','run','id',id,'status',status,'model',model_version,'session',technical_session_date,'candidates',candidate_count,'completed',completed_count,'partial',partial_count,'failed',failed_count,'pipelineRunId',pipeline_run_id,'terminalReason',terminal_reason,'finishedAt',finished_at,'coverage',summary->'tradePlanCoverage') FROM public.candidate_research_runs ORDER BY started_at DESC LIMIT 3;
SELECT json_build_object('kind','relation','table',table_name,'columns',string_agg(column_name,',' ORDER BY ordinal_position)) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('candidate_detail_snapshots','candidate_research_run_items','candidate_daily_stage_snapshots','radar_public_snapshots') GROUP BY table_name;
ROLLBACK;
