begin;
create function pg_temp.feedback_denied(payload jsonb, actor jsonb) returns void language plpgsql as $$
begin
  begin perform public.mes_dispatch('createIssue',payload,actor); exception when others then return; end;
  raise exception 'Expected invalid feedback/time to be rejected';
end $$;
do $$
declare
 owner jsonb := '{"owner":true,"uid":"owner-test"}'; tester jsonb := '{"owner":true,"uid":"owner-test","tester":true}';
 dept text; issue text; body jsonb; times jsonb; row jsonb;
begin
 dept:=public.mes_dispatch('manageDirectory','{"operation":"create","type":"departments","name":"Assembly"}',owner)->>'id';
 times:='[{"kind":"point","start":"2026-10-16T01:00:00.000Z"},{"kind":"range","start":"2026-10-16T02:00:00.000Z","end":"2026-10-16T03:00:00.000Z"},{"kind":"point","start":"2026-10-16T04:00:00.000Z"}]';
 body:=jsonb_build_object('reporterUid','mes-tester','departmentId',dept,'process','Station 1','description','MES lỗi','occurrences',times);
 issue:=public.mes_dispatch('createIssue',body,tester)->>'id';
 select data into row from mes_private.records where collection='issues' and id=issue;
 assert row->>'subject'='MES lỗi';
 assert row->'occurrences'=times;
 assert not(row ? 'teamLeaderId');
 assert row->>'reporterName'='Tester';
 perform public.mes_dispatch('createIssue',body-'occurrences',tester);
 perform pg_temp.feedback_denied(body||'{"departmentId":"missing"}',tester);
 perform pg_temp.feedback_denied(body||'{"reporterUid":"other"}',tester);
 perform pg_temp.feedback_denied(body||'{"description":"  "}',tester);
 perform pg_temp.feedback_denied(body||'{"occurrences":[{"kind":"point","start":"invalid"}]}',tester);
 perform pg_temp.feedback_denied(body||'{"occurrences":[{"kind":"range","start":"2026-10-16T03:00:00Z","end":"2026-10-16T02:00:00Z"}]}',tester);
 perform pg_temp.feedback_denied(body||'{"occurrences":[{"kind":"range","start":"2026-10-16T03:00:00Z"}]}',tester);
 perform pg_temp.feedback_denied(body||'{"occurrences":[{"kind":"point","start":null}]}',tester);
 perform pg_temp.feedback_denied(body||'{"occurrences":[{"kind":"point","start":"1990-01-01T00:00:00Z"}]}',tester);
 perform pg_temp.feedback_denied(body||jsonb_build_object('occurrences',(select jsonb_agg(times->0) from generate_series(1,21))),tester);
 perform public.mes_dispatch('updateIssue',jsonb_build_object('id',issue,'operation','edit','subject','Reviewed','process','Station 2','description','Lỗi'),owner);
 raise notice 'PASS: simplified feedback without leader/title, derived subject, multiple incident moments/ranges, invalid time rejection and user identity';
end $$;
rollback;
