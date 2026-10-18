-- Run once in a new Supabase project's SQL editor. Requires email confirmation enabled.
create extension if not exists pgcrypto;
create table public.workspaces (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id),
  name text not null check(length(trim(name)) between 1 and 70),
  plan text not null default 'free' check(plan in ('free','starter','pro')),
  subscription_status text not null default 'inactive', stripe_customer_id text unique, stripe_subscription_id text,
  billing_event_time bigint not null default 0, created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 100), client_name text not null check(length(trim(client_name)) between 1 and 80),
  client_email text not null check(client_email = lower(trim(client_email)) and client_email like '%@%'),
  category text not null default 'Other', description text not null default '' check(length(description) <= 2000),
  status text not null default 'In progress' check(status in ('In progress','In review','Completed')),
  progress integer not null default 0 check(progress between 0 and 100), due_date date not null,
  color text not null default 'sage' check(color in ('peach','sage','lavender','sand')), created_at timestamptz not null default now()
);
create table public.deliverables (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check(length(name) between 1 and 255), file_path text,
  status text not null default 'Pending' check(status in ('Pending','Approved','Changes requested')),
  feedback text check(length(feedback) <= 2000), created_at timestamptz not null default now()
);
create table public.activity (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  message text not null, created_at timestamptz not null default now()
);
create table public.stripe_events (id text primary key, created_at timestamptz not null default now());
create index on public.projects(workspace_id);
create index on public.projects(client_email);
create index on public.deliverables(project_id);
create index on public.activity(project_id,created_at desc);
alter table public.workspaces enable row level security;
alter table public.projects enable row level security;
alter table public.deliverables enable row level security;
alter table public.activity enable row level security;
alter table public.stripe_events enable row level security;

create function public.verified_email() returns text language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null;
$$;
create function public.owns_workspace(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspaces where id=target and owner_id=auth.uid());
$$;
create function public.can_read_project(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.projects p where p.id=target and (public.owns_workspace(p.workspace_id) or p.client_email=public.verified_email()));
$$;
create function public.owns_project(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.projects where id=target and public.owns_workspace(workspace_id));
$$;
create function public.can_read_workspace(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.owns_workspace(target) or exists(select 1 from public.projects where workspace_id=target and client_email=public.verified_email());
$$;

create policy workspace_read on public.workspaces for select to authenticated using(public.can_read_workspace(id));
create policy workspace_name_update on public.workspaces for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy project_read on public.projects for select to authenticated using(public.owns_workspace(workspace_id) or client_email=public.verified_email());
create policy project_create on public.projects for insert to authenticated with check(public.owns_workspace(workspace_id));
create policy project_update on public.projects for update to authenticated using(public.owns_workspace(workspace_id)) with check(public.owns_workspace(workspace_id));
create policy delivery_read on public.deliverables for select to authenticated using(public.can_read_project(project_id));
create policy delivery_create on public.deliverables for insert to authenticated with check(public.owns_project(project_id) and status='Pending' and feedback is null and file_path is not null and split_part(file_path,'/',1)=(select workspace_id::text from public.projects where id=project_id) and split_part(file_path,'/',2)=project_id::text);
create policy activity_read on public.activity for select to authenticated using(public.can_read_project(project_id));

-- Column-level privileges prevent owners from setting their own billing entitlement.
revoke all on public.workspaces, public.projects, public.deliverables, public.activity, public.stripe_events from anon, authenticated;
grant select on public.workspaces, public.projects, public.deliverables, public.activity to authenticated;
grant update(name) on public.workspaces to authenticated;
grant insert on public.projects, public.deliverables to authenticated;
grant update(name,client_name,client_email,category,description,status,progress,due_date,color) on public.projects to authenticated;
grant all on public.workspaces, public.projects, public.deliverables, public.activity, public.stripe_events to service_role;

create function public.bootstrap_workspace() returns uuid language plpgsql security definer set search_path = '' as $$
declare workspace uuid; agency_name text;
begin
  if auth.uid() is null or public.verified_email() is null then raise exception 'Verify your email before continuing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  select id into workspace from public.workspaces where owner_id=auth.uid();
  if workspace is not null then return workspace; end if;
  select workspace_id into workspace from public.projects where client_email=public.verified_email() order by created_at limit 1;
  if workspace is not null then return workspace; end if;
  select left(coalesce(nullif(trim(raw_user_meta_data->>'workspace_name'),''),'My Studio'),70) into agency_name from auth.users where id=auth.uid();
  insert into public.workspaces(owner_id,name) values(auth.uid(),agency_name) returning id into workspace;
  return workspace;
end;
$$;

-- Serialize project creation per workspace so parallel requests cannot bypass limits.
create function public.check_project_limit() returns trigger language plpgsql security definer set search_path = '' as $$
declare workspace public.workspaces; project_count integer; project_limit integer;
begin
  select * into workspace from public.workspaces where id=new.workspace_id for update;
  if workspace.id is null then raise exception 'Workspace not found'; end if;
  project_limit := case when workspace.plan='pro' and workspace.subscription_status in ('active','trialing') then 50 else 5 end;
  select count(*) into project_count from public.projects where workspace_id=new.workspace_id;
  if project_count >= project_limit then raise exception 'Your plan project limit has been reached. Manage your subscription to continue.'; end if;
  return new;
end;
$$;
create trigger enforce_project_limit before insert on public.projects for each row execute function public.check_project_limit();

create function public.review_deliverable(delivery_id uuid, decision text, note text default '') returns void language plpgsql security definer set search_path = '' as $$
declare delivery public.deliverables; project public.projects;
begin
  if auth.uid() is null then raise exception 'Sign in to review'; end if;
  if decision not in ('Approved','Changes requested') then raise exception 'Invalid decision'; end if;
  if length(coalesce(note,'')) > 2000 then raise exception 'Feedback is too long'; end if;
  if decision='Changes requested' and length(trim(coalesce(note,'')))=0 then raise exception 'Please describe the changes needed'; end if;
  select * into delivery from public.deliverables where id=delivery_id for update;
  select * into project from public.projects where id=delivery.project_id;
  if project.client_email is distinct from public.verified_email() or public.verified_email() is null then raise exception 'Only the assigned client can review this deliverable'; end if;
  if delivery.status <> 'Pending' then raise exception 'This deliverable has already been reviewed'; end if;
  update public.deliverables set status=decision, feedback=coalesce(note,'') where id=delivery_id;
end;
$$;

create function public.log_project_activity() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_TABLE_NAME='projects' then
    if TG_OP='INSERT' then insert into public.activity(project_id,message) values(new.id,'Project created: ' || new.name);
    elsif old.status is distinct from new.status or old.progress is distinct from new.progress then insert into public.activity(project_id,message) values(new.id,'Project updated: ' || new.name || ' · ' || new.status); end if;
  else
    if TG_OP='INSERT' then insert into public.activity(project_id,message) values(new.project_id,'New deliverable ready for review: ' || new.name);
    elsif old.status is distinct from new.status then insert into public.activity(project_id,message) values(new.project_id,new.status || ': ' || new.name); end if;
  end if;
  return new;
end;
$$;
create trigger project_activity after insert or update on public.projects for each row execute function public.log_project_activity();
create trigger delivery_activity after insert or update on public.deliverables for each row execute function public.log_project_activity();

create function public.sync_subscription(target_workspace uuid, customer_id text, subscription_id text, new_status text, new_plan text, event_id text, event_time bigint) returns void language plpgsql security definer set search_path = '' as $$
declare workspace public.workspaces;
begin
  select * into workspace from public.workspaces where id=target_workspace for update;
  if workspace.id is null or workspace.stripe_customer_id is distinct from customer_id then raise exception 'Invalid customer mapping'; end if;
  if exists(select 1 from public.stripe_events where id=event_id) then return; end if;
  insert into public.stripe_events(id) values(event_id);
  if event_time < workspace.billing_event_time then return; end if;
  -- Do not let an older subscription's cancellation overwrite a newer active subscription.
  if workspace.stripe_subscription_id is not null and workspace.stripe_subscription_id <> subscription_id and new_status='canceled' then return; end if;
  update public.workspaces set stripe_subscription_id=subscription_id, subscription_status=new_status,
    plan=case when new_status in ('active','trialing') then new_plan else 'free' end, billing_event_time=event_time where id=target_workspace;
end;
$$;

-- Restrict privileged RPCs. PostgreSQL grants function EXECUTE to PUBLIC by default.
revoke execute on function public.verified_email(), public.owns_workspace(uuid), public.can_read_project(uuid), public.owns_project(uuid), public.can_read_workspace(uuid), public.bootstrap_workspace(), public.review_deliverable(uuid,text,text), public.check_project_limit(), public.log_project_activity(), public.sync_subscription(uuid,text,text,text,text,text,bigint) from public, anon, authenticated;
grant execute on function public.verified_email(), public.owns_workspace(uuid), public.can_read_project(uuid), public.owns_project(uuid), public.can_read_workspace(uuid), public.bootstrap_workspace(), public.review_deliverable(uuid,text,text) to authenticated;
grant execute on function public.sync_subscription(uuid,text,text,text,text,text,bigint) to service_role;

insert into storage.buckets(id,name,public,file_size_limit) values('deliverables','deliverables',false,10485760) on conflict(id) do nothing;
create policy private_delivery_read on storage.objects for select to authenticated using(bucket_id='deliverables' and (exists(select 1 from public.deliverables d where d.file_path=storage.objects.name and public.can_read_project(d.project_id)) or exists(select 1 from public.projects p where p.workspace_id::text=split_part(storage.objects.name,'/',1) and p.id::text=split_part(storage.objects.name,'/',2) and public.owns_workspace(p.workspace_id))));
create policy owner_delivery_upload on storage.objects for insert to authenticated with check(bucket_id='deliverables' and exists(select 1 from public.projects p where p.workspace_id::text=split_part(storage.objects.name,'/',1) and p.id::text=split_part(storage.objects.name,'/',2) and public.owns_workspace(p.workspace_id)));
create policy owner_orphan_cleanup on storage.objects for delete to authenticated using(bucket_id='deliverables' and exists(select 1 from public.projects p where p.workspace_id::text=split_part(storage.objects.name,'/',1) and p.id::text=split_part(storage.objects.name,'/',2) and public.owns_workspace(p.workspace_id)) and not exists(select 1 from public.deliverables d where d.file_path=storage.objects.name));
