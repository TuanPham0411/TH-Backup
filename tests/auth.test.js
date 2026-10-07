import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configured, friendlyError, validName } from '../site/auth-utils.js';
test('missing Firebase fields never enable a partial setup', () => {
 const full = { apiKey:'key',authDomain:'project.firebaseapp.com',projectId:'project',appId:'app' };
 assert.equal(configured(full),true);
 for (const field of Object.keys(full)) {
  assert.equal(configured({...full,[field]:undefined}),false);
  assert.equal(configured({...full,[field]:' '}),false);
 }
});
test('credential errors do not disclose whether an account exists', () => {
 assert.equal(friendlyError({code:'auth/user-not-found'}),friendlyError({code:'auth/wrong-password'}));
 assert.equal(friendlyError({code:'auth/invalid-credential'}),friendlyError({code:'auth/wrong-password'}));
 assert.ok(!friendlyError({message:'private internal detail'}).includes('private internal detail'));
});
test('profiles reject blank or oversized display names', () => {
 assert.equal(validName('  '),false);assert.equal(validName('x'.repeat(81)),false);
 assert.equal(validName(' TH '),true);assert.equal(validName('x'.repeat(80)),true);
});
