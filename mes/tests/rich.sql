begin;
create function pg_temp.rich_denied(action text,payload jsonb,actor jsonb) returns void language plpgsql as $$
begin
 begin perform public.mes_dispatch(action,payload,actor); exception when others then return; end;
 raise exception 'Expected rich feedback action to be rejected';
end $$;
do $$
declare
 owner jsonb := '{"owner":true,"uid":"owner-test"}'; tester jsonb := '{"owner":true,"uid":"owner-test","tester":true}';
 dept text; issue text; body jsonb; rich jsonb; stored jsonb; slot text; timeline jsonb;
begin
 dept:=public.mes_dispatch('manageDirectory','{"operation":"create","type":"departments","name":"Assembly"}',owner)->>'id';
 rich:='{"version":1,"ops":[{"insert":"MES report","attributes":{"bold":true,"size":"24px"}},{"insert":"\n"},{"insert":{"image":0}},{"insert":"\n"}]}';
 body:=jsonb_build_object('reporterUid','mes-tester','departmentId',dept,'process','Station 1','description','MES report','richDocument',rich);
 issue:=public.mes_dispatch('createIssue',body,tester)->>'id';
 select data into stored from mes_private.records where collection='issues' and id=issue;
 assert stored->'richDocument'=rich;slot:=stored->'uploadSlots'->>0;
 perform pg_temp.rich_denied('createIssue',body||'{"richDocument":{"version":1,"ops":[{"insert":{"image":"https://evil.example"}}]}}',tester);
 perform pg_temp.rich_denied('createIssue',body||'{"richDocument":{"version":1,"ops":[{"insert":{"image":5}}]}}',tester);
 perform public.mes_dispatch('updateIssue',jsonb_build_object('id',issue,'operation','edit','subject','Styled report','process','Station 1','description','MES report','richDocument',rich||'{"ops":[{"insert":"MES report","attributes":{"italic":true}}]}'),owner);
 timeline:=public.mes_dispatch('read',jsonb_build_object('path','issues/'||issue||'/timeline','order','asc'),owner)->'rows';
 assert exists(select 1 from jsonb_array_elements(timeline) e where e->>'kind'='edit' and e->'before'->'richDocument'=rich and e->'after'->'richDocument'->'ops'->0->'attributes'->>'italic'='true');
 update mes_private.records set data=data||jsonb_build_object('createdAt',0) where collection='issues' and id=issue;
 perform public.mes_dispatch('uploadUrl',jsonb_build_object('path','issues/'||issue||'/'||slot),owner);
 perform pg_temp.rich_denied('uploadUrl',jsonb_build_object('path','issues/'||issue||'/'||slot),tester);
 perform pg_temp.rich_denied('uploadUrl',jsonb_build_object('path','issues/'||issue||'/unreserved'),owner);
 raise notice 'PASS: rich format/image references persist, unsafe image references denied, format audit retained, owner edit images allowed only in reserved slots';
end $$;
rollback;
