import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeProjectMessages } from '../src/lib/project-messages.ts';
const row = (id, created_at, project_id='p1') => ({id,project_id,created_at,author_id:'u1',author_email:'client@example.com',body:id});
test('send responses, realtime events, and resyncs merge without duplicates',()=>{
  const first=row('a','2026-10-19T12:00:00Z');
  const second=row('b','2026-10-19T12:01:00Z');
  const result=mergeProjectMessages(mergeProjectMessages([first],[second]),[first,second]);
  assert.deepEqual(result.map(m=>m.id),['a','b']);
});
test('out-of-order arrivals are sorted deterministically and retain other projects',()=>{
  const result=mergeProjectMessages([row('z','2026-10-19T12:05:00Z','p2')],[row('b','2026-10-19T12:00:00Z'),row('a','2026-10-19T12:00:00Z')]);
  assert.deepEqual(result.map(m=>m.id),['a','b','z']);
});
