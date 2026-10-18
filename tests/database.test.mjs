import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const ids = { ownerA:'00000000-0000-0000-0000-000000000001', ownerB:'00000000-0000-0000-0000-000000000002', client:'00000000-0000-0000-0000-000000000003', other:'00000000-0000-0000-0000-000000000004', unverified:'00000000-0000-0000-0000-000000000005', unassigned:'00000000-0000-0000-0000-000000000006', agencyNew:'00000000-0000-0000-0000-000000000007' };
let wa, wb, pa, pb, delivery;
async function as(user) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[user]]); await db.exec('set role authenticated'); }
async function scalar(sql, args=[]) { return Object.values((await db.query(sql,args)).rows[0])[0]; }
before(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,storage,public to authenticated,anon,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,delete on storage.objects to authenticated;
  `);
  let sql = await readFile(new URL('../supabase/migrations/001_clientnest.sql', import.meta.url),'utf8');
  sql = sql.replace('create extension if not exists pgcrypto;','');
  await db.exec(sql);
  for (const [name,id] of Object.entries(ids)) await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[id,`${name}@test.example`,name==='unverified'?null:new Date().toISOString(),JSON.stringify({workspace_name:`Studio ${name}`})]);
  // Owners created before migration keep access, while new agencies opt in.
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data || '{\"account_type\":\"agency\"}'::jsonb where id=any($1::uuid[])", [[ids.ownerA, ids.ownerB]]);
  await as('ownerA'); wa=await scalar('select public.bootstrap_workspace()');
  pa=await scalar("insert into projects(workspace_id,name,client_name,client_email,due_date) values($1,'Project A','Client','client@test.example','2026-12-01') returning id",[wa]);
  const path=`${wa}/${pa}/test.pdf`;
  await db.query("insert into storage.objects(bucket_id,name) values('deliverables',$1)",[path]);
  delivery=await scalar("insert into deliverables(project_id,name,file_path) values($1,'test.pdf',$2) returning id",[pa,path]);
  await as('ownerB'); wb=await scalar('select public.bootstrap_workspace()');
  pb=await scalar("insert into projects(workspace_id,name,client_name,client_email,due_date) values($1,'Project B','Other','other@test.example','2026-12-01') returning id",[wb]);
  await db.exec('reset role');
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data - 'account_type' where id=$1", [ids.ownerA]);
  await db.query("update auth.users set raw_user_meta_data=raw_user_meta_data || '{\"account_type\":\"agency\"}'::jsonb where id=$1", [ids.agencyNew]);
});
after(async()=>{ await db.close(); });
test('unassigned clients and legacy accounts never get an automatic agency workspace', async()=>{
  await as('unassigned');
  for (const kind of [null, 'client', 'agency']) assert.equal(await scalar('select bootstrap_workspace($1)', [kind]), null);
  assert.equal(await scalar('select count(*)::int from workspaces'), 0);
  await assert.rejects(db.query("select bootstrap_workspace('admin')"), /Invalid account type/);
});
test('agency signup creates only its own workspace and client entry never provisions one', async()=>{
  await as('agencyNew');
  assert.equal(await scalar("select bootstrap_workspace('client')"), null);
  const workspace = await scalar("select bootstrap_workspace('agency')");
  assert.ok(workspace);
  assert.equal(await scalar("select bootstrap_workspace('agency')"), workspace);
  assert.equal(await scalar('select owner_id from workspaces where id=$1', [workspace]), ids.agencyNew);
});
test('portal choice and invitation workspace cannot grant access to another agency', async()=>{
  await as('client');
  assert.equal(await scalar("select bootstrap_workspace('client',$1)", [wa]), wa);
  assert.equal(await scalar("select bootstrap_workspace('client',$1)", [wb]), null);
  assert.equal(await scalar("select bootstrap_workspace('agency')"), null);
  await as('ownerA');
  assert.equal(await scalar("select bootstrap_workspace('agency')"), wa);
  assert.equal(await scalar("select bootstrap_workspace('client')"), null);
});
test('owners see their own tenant and cannot modify billing entitlements', async()=>{
  await as('ownerA'); assert.equal(await scalar('select count(*)::int from projects'),1);
  assert.equal(await scalar('select count(*)::int from workspaces where id=$1',[wb]),0);
  await assert.rejects(db.query("update workspaces set plan='pro' where id=$1",[wa]),/permission denied/);
  assert.equal((await db.query("update projects set progress=90 where id=$1 returning id",[pb])).rows.length,0);
});
test('verified clients see only assigned projects, files, and activity',async()=>{
  await as('client'); assert.equal(await scalar('select public.bootstrap_workspace()'),wa);
  assert.equal(await scalar('select count(*)::int from projects'),1);
  assert.equal(await scalar('select count(*)::int from deliverables'),1);
  assert.equal(await scalar('select count(*)::int from storage.objects'),1);
  assert.equal(await scalar('select count(*)::int from activity where project_id=$1',[pb]),0);
  await assert.rejects(db.query("insert into projects(workspace_id,name,client_name,client_email,due_date) values($1,'Attack','X','client@test.example','2026-12-01')",[wa]),/row-level security/);
});
test('other clients cannot read or approve another client’s deliverable',async()=>{
  await as('other'); assert.equal(await scalar('select count(*)::int from deliverables'),0);
  assert.equal(await scalar('select count(*)::int from storage.objects'),0);
  await assert.rejects(db.query("select review_deliverable($1,'Approved','')",[delivery]),/assigned client/);
});
test('owners cannot approve on behalf of their client',async()=>{
  await as('ownerA'); await assert.rejects(db.query("select review_deliverable($1,'Approved','')",[delivery]),/assigned client/);
});
test('review requires feedback for changes and cannot be replayed',async()=>{
  await as('client'); await assert.rejects(db.query("select review_deliverable($1,'Changes requested','')",[delivery]),/describe the changes/);
  await db.query("select review_deliverable($1,'Approved','Looks great')",[delivery]);
  assert.equal(await scalar('select status from deliverables where id=$1',[delivery]),'Approved');
  await assert.rejects(db.query("select review_deliverable($1,'Approved','Again')",[delivery]),/already been reviewed/);
  await assert.rejects(db.query("update deliverables set status='Pending' where id=$1",[delivery]),/permission denied/);
});
test('storage paths cannot cross tenant or project boundaries',async()=>{
  await as('ownerB'); await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('deliverables',$1)",[`${wa}/${pa}/intrusion.pdf`]),/row-level security/);
  await as('client'); await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('deliverables',$1)",[`${wa}/${pa}/client-upload.pdf`]),/row-level security/);
});
test('owners can remove orphan uploads but cannot delete a referenced deliverable',async()=>{
  await as('ownerA'); const orphan=`${wa}/${pa}/orphan.pdf`;
  await db.query("insert into storage.objects(bucket_id,name) values('deliverables',$1)",[orphan]);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[orphan])).rows.length,1);
  assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[`${wa}/${pa}/test.pdf`])).rows.length,0);
});
test('project limits are enforced by the database',async()=>{
  await as('ownerA');
  for(let i=0;i<4;i++) await db.query("insert into projects(workspace_id,name,client_name,client_email,due_date) values($1,$2,'Client','client@test.example','2026-12-01')",[wa,`Project ${i}`]);
  await assert.rejects(db.query("insert into projects(workspace_id,name,client_name,client_email,due_date) values($1,'Over limit','Client','client@test.example','2026-12-01')",[wa]),/project limit/);
});
test('unverified users cannot provision workspaces and anon cannot execute privileged RPCs',async()=>{
  await as('unverified'); await assert.rejects(db.query('select bootstrap_workspace()'),/Verify your email/);
  await db.exec('reset role; set role anon'); await assert.rejects(db.query('select bootstrap_workspace()'),/permission denied/);
});
test('subscription sync is service-only, deduplicated, and ignores stale events',async()=>{
  await as('ownerA'); await assert.rejects(db.query("select sync_subscription($1,'cus_a','sub_a','active','pro','evt_1',100)",[wa]),/permission denied/);
  await db.exec('reset role'); await db.query("update workspaces set stripe_customer_id='cus_a' where id=$1",[wa]); await db.exec('set role service_role');
  await db.query("select sync_subscription($1,'cus_a','sub_a','active','pro','evt_1',100)",[wa]);
  await db.query("select sync_subscription($1,'cus_a','sub_a','canceled','free','evt_1',101)",[wa]);
  await db.query("select sync_subscription($1,'cus_a','sub_a','canceled','free','evt_old',90)",[wa]);
  assert.equal(await scalar('select plan from workspaces where id=$1',[wa]),'pro');
  await assert.rejects(db.query("select sync_subscription($1,'wrong_customer','sub_a','active','pro','evt_wrong',110)",[wa]),/Invalid customer mapping/);
  await db.query("select sync_subscription($1,'cus_a','sub_a','canceled','free','evt_cancel',120)",[wa]);
  assert.equal(await scalar('select plan from workspaces where id=$1',[wa]),'free');
});
