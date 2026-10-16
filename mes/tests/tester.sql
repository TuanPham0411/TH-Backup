begin;
create function pg_temp.tester_denied(action text, payload jsonb, actor jsonb default '{}') returns void language plpgsql as $$
begin
  begin perform public.mes_dispatch(action,payload,actor); exception when others then return; end;
  raise exception 'Expected Tester denial: %',action;
end $$;
do $$
declare
  owner jsonb := '{"owner":true,"uid":"owner-test"}';
  tester jsonb := '{"owner":true,"uid":"owner-test","tester":true}';
  leader text; dept text; issue text; session jsonb;
begin
  assert (public.mes_dispatch('getSession','{}',tester)->>'isOwner')::boolean=false;
  assert public.mes_dispatch('getSession','{}',tester)->'user'->>'uid'='mes-tester';
  assert not exists(select 1 from jsonb_array_elements(public.mes_dispatch('getDirectory','{}')->'users') u where u->>'id'='mes-tester');
  perform pg_temp.tester_denied('getSession','{}','{"tester":true}');
  perform pg_temp.tester_denied('setPolicy','{"requiresWindows":false}',tester);
  perform pg_temp.tester_denied('read','{"path":"users"}',tester);
  perform pg_temp.tester_denied('registerDevice','{"label":"forged"}',tester);
  perform pg_temp.tester_denied('startWindowsChallenge','{"username":"mes.tester"}');
  leader:=public.mes_dispatch('manageDirectory','{"type":"teamLeaders","operation":"create","name":"Test leader"}',owner)->>'id';
  dept:=public.mes_dispatch('manageDirectory','{"type":"departments","operation":"create","name":"Test department"}',owner)->>'id';
  issue:=public.mes_dispatch('createIssue',jsonb_build_object('reporterUid','mes-tester','subject','Tester feedback','process','Station test','description','This is a real Tester report.','teamLeaderId',leader,'departmentId',dept),tester)->>'id';
  assert public.mes_dispatch('read','{"path":"issues"}',tester)->'rows'->0->>'reporterName'='Tester';
  perform pg_temp.tester_denied('deleteIssue',jsonb_build_object('id',issue),tester);
  perform pg_temp.tester_denied('updateIssue',jsonb_build_object('id',issue,'operation','handling','status','Resolved','priority','High'),tester);
  perform pg_temp.tester_denied('addComment',jsonb_build_object('issueId',issue,'text','Not allowed'),tester);
  perform public.mes_dispatch('setPolicy','{"requiresWindows":false}',owner);
  perform pg_temp.tester_denied('loginManagedUser','{"uid":"mes-tester"}');
  assert (public.mes_dispatch('getSession','{}',owner)->>'isOwner')::boolean;
  update mes_private.records set data=data||'{"active":false}' where collection='users' and id='mes-tester';
  perform pg_temp.tester_denied('getSession','{}',tester);
  raise notice 'PASS: Tester submits as normal user; no admin writes, public login or anonymous impersonation; owner can return and deactivate';
end $$;
rollback;
