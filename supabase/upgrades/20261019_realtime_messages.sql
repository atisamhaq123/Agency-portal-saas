-- Safe to run again. Existing message access policies also protect Realtime.
do $$
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='project_messages') then
    alter publication supabase_realtime add table public.project_messages;
  end if;
end;
$$;
