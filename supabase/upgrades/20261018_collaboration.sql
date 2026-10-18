-- Existing installations: run this once. Fresh installs use only migrations/001_clientnest.sql.
begin;
create table public.project_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null default auth.uid() references auth.users(id),
  author_email text not null default '',
  body text not null check(length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now()
);
create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 120),
  due_date date, completed boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.project_messages(project_id,created_at);
create index on public.milestones(project_id,due_date);
alter table public.project_messages enable row level security;
alter table public.milestones enable row level security;
create policy message_read on public.project_messages for select to authenticated using(public.can_read_project(project_id));
create policy message_post on public.project_messages for insert to authenticated with check(public.verified_email() is not null and public.can_read_project(project_id) and author_id=auth.uid());
create policy milestone_read on public.milestones for select to authenticated using(public.can_read_project(project_id));
create policy milestone_create on public.milestones for insert to authenticated with check(public.owns_project(project_id));
create policy milestone_update on public.milestones for update to authenticated using(public.owns_project(project_id)) with check(public.owns_project(project_id));
create policy milestone_delete on public.milestones for delete to authenticated using(public.owns_project(project_id));
revoke all on public.project_messages, public.milestones from public, anon, authenticated;
grant select on public.project_messages, public.milestones to authenticated;
grant insert(project_id,body) on public.project_messages to authenticated;
grant insert(project_id,title,due_date) on public.milestones to authenticated;
grant update(title,due_date,completed), delete on public.milestones to authenticated;
grant all on public.project_messages, public.milestones to service_role;
create function public.stamp_message_author() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.author_id := auth.uid(); new.author_email := public.verified_email();
  if new.author_email is null then raise exception 'Verify your email before posting'; end if;
  return new;
end;
$$;
create trigger message_author before insert on public.project_messages for each row execute function public.stamp_message_author();
revoke execute on function public.stamp_message_author() from public, anon, authenticated;

commit;
