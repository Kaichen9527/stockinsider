BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
SELECT json_build_object('observedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'database',current_database(),'user',current_user,'serverVersionNum',current_setting('server_version_num'),'activeWriterCount',(SELECT count(*) FROM public.production_writer_releases WHERE active),'activeWriters',(SELECT coalesce(json_agg(json_build_object('releaseId',release_id,'writerKind',writer_kind,'active',active)),'[]') FROM public.production_writer_releases WHERE active),'dataPlaneLeaseRows',(SELECT count(*) FROM public.production_write_leases WHERE lease_key='production-data-plane'),'unexpiredDataPlaneLeaseRows',(SELECT count(*) FROM public.production_write_leases WHERE lease_key='production-data-plane' AND expires_at>clock_timestamp()));
ROLLBACK;
