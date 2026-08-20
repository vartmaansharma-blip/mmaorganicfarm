-- Cover route foreign-key lookups that are not led by the dispatch date.
create index if not exists daily_route_assignments_route_idx
on public.daily_route_assignments (route_id);
