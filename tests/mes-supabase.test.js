import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleOwner, validPath, publicAction } from '../mes/supabase/functions/mes-api/policy.ts';
test('Supabase owner requires confirmed exact Google identity', () => {
  const owner = { email: 'eric.scorp93@gmail.com', email_confirmed_at: '2026-10-15', app_metadata: { provider: 'google' }, identities: [{ provider: 'google' }] };
  assert.equal(isGoogleOwner(owner), true);
  for (const patch of [{ email: 'tuanpham.x93@gmail.com' }, { email_confirmed_at: undefined }, { app_metadata: { provider: 'email' } }, { identities: [] }]) assert.equal(isGoogleOwner({ ...owner, ...patch }), false);
});
test('MES attachment paths bind exactly one issue and allocated slot', () => {
  assert.equal(validPath('issues/abc-123/slot-123'), true);
  for (const path of ['issues/../slot', 'issues/a/b/extra', 'issues/a', '/issues/a/b', null, 'other/a/b']) assert.equal(validPath(path), false);
});
test('Only directory and identity challenges are anonymous API operations', () => {
  for (const name of ['getDirectory','startWindowsChallenge','completeWindowsChallenge','loginManagedUser']) assert.equal(publicAction(name), true);
  for (const name of ['read','createIssue','setPolicy','registerDevice','deleteIssue','finishDelete']) assert.equal(publicAction(name), false);
});
