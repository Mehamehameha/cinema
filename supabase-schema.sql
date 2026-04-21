create table if not exists public.cinema_planner_weeks (
  week_start text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cinema_planner_weeks enable row level security;

drop policy if exists "cinema planner public read" on public.cinema_planner_weeks;
create policy "cinema planner public read"
on public.cinema_planner_weeks
for select
using (true);

drop policy if exists "cinema planner public insert" on public.cinema_planner_weeks;
create policy "cinema planner public insert"
on public.cinema_planner_weeks
for insert
with check (true);

drop policy if exists "cinema planner public update" on public.cinema_planner_weeks;
create policy "cinema planner public update"
on public.cinema_planner_weeks
for update
using (true)
with check (true);
