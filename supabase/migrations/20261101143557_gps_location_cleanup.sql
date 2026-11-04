-- Native database scheduler; removes expired GPS coordinates without an HTTP secret.
create extension if not exists pg_cron;
select cron.schedule('gps-location-cleanup', '17 * * * *', 'select public.purge_old_gps_positions();');
