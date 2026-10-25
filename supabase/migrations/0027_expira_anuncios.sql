-- Cartazes e lances que cumpriram as 12 h passam a "expired" sozinhos (antes só o cliente escondia os vencidos).
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.expire_ads() returns void language sql security definer set search_path = '' as $$
  update public.custom_signs set status = 'expired' where status = 'active' and expires_at is not null and expires_at <= now();
  update public.billboard_bids set status = 'expired' where status = 'active' and expires_at is not null and expires_at <= now();
$$;
revoke all on function public.expire_ads() from public, anon, authenticated;

select cron.unschedule('expire_ads') where exists (select 1 from cron.job where jobname = 'expire_ads');
select cron.schedule('expire_ads', '*/5 * * * *', $$select public.expire_ads()$$);
