-- Run once on existing installations after the collaboration upgrade.
begin;
-- Disable the previous outbound worker without deleting its historical records.
drop trigger if exists delivery_email on public.deliverables;
drop function if exists public.queue_delivery_email();
drop function if exists public.claim_notifications(uuid);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  recipient_email text,
  title text not null, body text not null,
  event_key text not null unique,
  created_at timestamptz not null default now(), read_at timestamptz,
  check((recipient_id is null) <> (recipient_email is null))
);
create index on public.notifications(recipient_id,created_at desc);
create index on public.notifications(recipient_email,created_at desc);
alter table public.notifications enable row level security;
create policy notification_read on public.notifications for select to authenticated using(
  public.can_read_project(project_id) and (recipient_id=auth.uid() or recipient_email=public.verified_email())
);
create policy notification_mark_read on public.notifications for update to authenticated using(
  public.can_read_project(project_id) and (recipient_id=auth.uid() or recipient_email=public.verified_email())
) with check(public.can_read_project(project_id) and (recipient_id=auth.uid() or recipient_email=public.verified_email()));
revoke all on public.notifications from public, anon, authenticated;
grant select, update(read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;
create function public.notify_project_event() returns trigger language plpgsql security definer set search_path='' as $$
declare project public.projects; owner uuid; recipient uuid; email text; heading text; content text; event text;
begin
  if auth.uid() is null or public.verified_email() is null then return new; end if;
  select * into project from public.projects where id=new.project_id;
  select owner_id into owner from public.workspaces where id=project.workspace_id;
  if owner=auth.uid() then
    email := project.client_email;
    if email=public.verified_email() then return new; end if;
  else recipient := owner;
  end if;
  if TG_TABLE_NAME='deliverables' then
    if TG_OP='INSERT' then heading := 'New file ready for review';
    elsif old.status is distinct from new.status then heading := new.status;
    else return new;
    end if;
    content := new.name || ' in ' || project.name;
    event := 'delivery:' || new.id::text || ':' || new.status;
  elsif TG_TABLE_NAME='project_messages' then
    heading := 'New project message'; content := project.name || ': ' || left(new.body,200);
    event := 'message:' || new.id::text;
  else
    if TG_OP='INSERT' then heading := 'New milestone';
    elsif old.completed is distinct from new.completed then heading := case when new.completed then 'Milestone completed' else 'Milestone reopened' end;
    else return new;
    end if;
    content := new.title || ' in ' || project.name;
    event := 'milestone:' || new.id::text || ':' || gen_random_uuid()::text;
  end if;
  insert into public.notifications(project_id,recipient_id,recipient_email,title,body,event_key)
    values(new.project_id,recipient,email,heading,content,event) on conflict(event_key) do nothing;
  return new;
end;
$$;
revoke execute on function public.notify_project_event() from public, anon, authenticated;
create trigger delivery_notification after insert or update on public.deliverables for each row execute function public.notify_project_event();
create trigger message_notification after insert on public.project_messages for each row execute function public.notify_project_event();
create trigger milestone_notification after insert or update on public.milestones for each row execute function public.notify_project_event();
commit;
