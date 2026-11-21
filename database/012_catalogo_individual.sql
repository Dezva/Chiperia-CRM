-- V1.3 incremental: aplicar solo después de 011. Nunca vuelve a cargar precios.
begin;
create or replace function public.viejo_catalog_key(v text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(lower(translate(v,'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun')),'[[:space:]]+',' ','g'));
$$;
create table if not exists public.viejo_catalog_categories(
 id text primary key,name text not null check(length(btrim(name)) between 1 and 80),
 position integer not null default 0 check(position between 0 and 9999),active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index if not exists viejo_category_unique on public.viejo_catalog_categories(public.viejo_catalog_key(name));
create table if not exists public.viejo_catalog_backup(id text primary key,product jsonb not null,created_at timestamptz not null default now());
insert into public.viejo_catalog_backup(id,product) select id,to_jsonb(c) from public.guarni_catalog c on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-0','Chipas',0) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-1','Chipas rellenas',1) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-2','Empanadas',2) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-3','Tartas',3) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-4','Panes',4) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-5','Sándwiches',5) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-6','Facturas',6) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-7','Otros',7) on conflict do nothing;
insert into public.viejo_catalog_categories(id,name,position) values('chiperia-8','Productos de temporada',8) on conflict do nothing;
-- Conserva categorías personalizadas, normalizando espacios, tildes y mayúsculas.
insert into public.viejo_catalog_categories(id,name,position)
 select 'legacy-'||md5(public.viejo_catalog_key(category)),min(btrim(category)),100 from public.guarni_catalog
 where public.viejo_catalog_key(category)<>'temporada' group by public.viejo_catalog_key(category) on conflict do nothing;
alter table public.guarni_catalog add column if not exists category_id text references public.viejo_catalog_categories(id);
alter table public.guarni_catalog add column if not exists active boolean not null default true;
alter table public.guarni_catalog add column if not exists aliases jsonb not null default '[]' check(jsonb_typeof(aliases)='array');
alter table public.guarni_catalog add column if not exists legacy_generic boolean not null default false;
alter table public.guarni_catalog add column if not exists created_at timestamptz not null default now();
-- Solo los registros aún no convertidos. Reejecutar no restaura disponibilidad, sinónimos ni ediciones.
update public.guarni_catalog p set category_id=c.id,active=case when p.price is null then false else p.active end,
 aliases=case when p.id='pasta-frola-base' and p.aliases='[]' then '["Pastafrola"]'::jsonb else p.aliases end
 from public.viejo_catalog_categories c where p.category_id is null and public.viejo_catalog_key(c.name)=
 case when public.viejo_catalog_key(p.category)='temporada' then 'productos de temporada'
 when p.id in ('pasta-frola-base','bollito-base') and public.viejo_catalog_key(p.category)='otros' then 'facturas' else public.viejo_catalog_key(p.category) end;
update public.guarni_catalog set active=false,available=false,legacy_generic=true
 where id='facturas-base' and public.viejo_catalog_key(name)='facturas' and not legacy_generic;
alter table public.guarni_catalog alter column category_id set not null;
-- No toca pedidos históricos ni carritos. El quote actual rechaza artículos retirados para nuevas solicitudes.
do $$ begin
 if to_regprocedure('public.viejo_staff_settings_base(uuid,text,jsonb)') is null then alter function public.viejo_staff(uuid,text,jsonb) rename to viejo_staff_settings_base;end if;
end $$;
create or replace function public.viejo_quote(p_service text,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare it jsonb;v jsonb;result jsonb='[]';amount integer=0;qty integer; seen text[]='{}'; menu jsonb;
begin
 if p_service is null or p_service not in ('buffet','chiperia') or jsonb_typeof(p_items)<>'array' or coalesce(jsonb_array_length(p_items),0) not between 1 and 30 then raise exception 'invalid_items';end if;
 if p_service='buffet' then
  select items into menu from public.viejo_menus where day=(now() at time zone 'America/Asuncion')::date and status='published' for share;
  if menu is null then raise exception 'daily_menu_required';end if;
 end if;
 for it in select * from jsonb_array_elements(p_items) loop
  if coalesce(jsonb_typeof(it->'qty'),'')<>'number' or coalesce(it->>'qty','') !~ '^[0-9]+$' then raise exception 'invalid_quantity';end if;
  qty=(it->>'qty')::integer;
  if qty not between 1 and 30 or (it->>'variant_id')=any(seen) then raise exception 'invalid_quantity';end if;
  seen=array_append(seen,it->>'variant_id');v=null;
  if p_service='chiperia' then
   select to_jsonb(c) into v from public.guarni_catalog c join public.viejo_catalog_categories g on g.id=c.category_id where c.id=it->>'variant_id' and c.active and g.active and not c.legacy_generic and c.available and c.price>0 for share of c,g;
  else
   select x into v from jsonb_array_elements(menu) x where x->>'id'=it->>'variant_id' and x->'available'='true'::jsonb and x->>'category_id' in ('guarniciones','carne','pollo_chancho');
  end if;
  if v is null then raise exception 'price_or_availability_changed';end if;
  if p_service='chiperia' then amount=amount+(v->>'price')::integer*qty;end if;
  result=result||jsonb_build_array(jsonb_build_object('variant_id',v->>'id','name',v->>'name','variant',coalesce(v->>'variant','Base'),'qty',qty,'unit_price',case when p_service='chiperia' then (v->>'price')::integer else null end,'notes',left(coalesce(it->>'notes',''),300)));
 end loop;
 return jsonb_build_object('items',result,'subtotal',case when p_service='buffet' then null else amount end);
end $$;

create or replace function public.viejo_staff(p_actor uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare role_name text;c public.viejo_catalog_categories;p public.guarni_catalog;a jsonb;tid text;begin
 select role into role_name from public.crm_members where user_id=p_actor;
 if role_name is null then raise exception 'not_member';end if;
 if p_action not in ('catalog','catalog_category') then return public.viejo_staff_settings_base(p_actor,p_action,p_data);end if;
 if role_name<>'admin' and not exists(select 1 from public.crm_members where user_id=p_actor and catalog_editor) then raise exception 'catalog_permission_required';end if;
 if coalesce(length(p_data->>'id'),0) not between 1 and 120 then raise exception 'invalid_product';end if;
 if p_action='catalog_category' then
  if coalesce((p_data->>'remove')::boolean,false) then
   select * into c from public.viejo_catalog_categories where id=p_data->>'id' for update;
   if not found then raise exception 'not_found';end if;
   if exists(select 1 from public.guarni_catalog where category_id=c.id) then
    tid=p_data->>'reassign_to';
    if tid=c.id or not exists(select 1 from public.viejo_catalog_categories where id=tid and active) then raise exception 'category_reassignment_required';end if;
    update public.guarni_catalog set category_id=tid,category=(select name from public.viejo_catalog_categories where id=tid),updated_at=now() where category_id=c.id;
   end if;
   delete from public.viejo_catalog_categories where id=c.id;
  else
   if jsonb_typeof(p_data->'name') is distinct from 'string' or length(btrim(p_data->>'name')) not between 1 and 80 or jsonb_typeof(p_data->'active') is distinct from 'boolean' or coalesce(p_data->>'position','') !~ '^[0-9]{1,4}$' then raise exception 'invalid_category';end if;
   insert into public.viejo_catalog_categories(id,name,position,active) values(p_data->>'id',btrim(p_data->>'name'),(p_data->>'position')::integer,(p_data->>'active')::boolean)
   on conflict(id) do update set name=excluded.name,position=excluded.position,active=excluded.active,updated_at=now();
   update public.guarni_catalog set category=p_data->>'name' where category_id=p_data->>'id';
  end if;
 else
  if jsonb_typeof(p_data->'name') is distinct from 'string' or length(btrim(p_data->>'name')) not between 1 and 120 or jsonb_typeof(p_data->'variant') is distinct from 'string' or length(btrim(p_data->>'variant')) not between 1 and 80 then raise exception 'invalid_product';end if;
  for tid in select unnest(array['active','available','seasonal']) loop
   if jsonb_typeof(p_data->tid) is distinct from 'boolean' then raise exception 'invalid_product';end if;
  end loop;
  if jsonb_typeof(p_data->'price') is distinct from 'null' and (jsonb_typeof(p_data->'price') is distinct from 'number' or coalesce(p_data->>'price','') !~ '^[0-9]+$') then raise exception 'price_required';end if;
  if (p_data->>'price')::numeric not between 1 and 2147483647 then raise exception 'price_required';end if;
  if (p_data->>'active')::boolean and (p_data->>'available')::boolean and coalesce((p_data->>'price')::integer,0)<=0 then raise exception 'price_required';end if;
  if jsonb_typeof(p_data->'aliases') is distinct from 'array' then raise exception 'invalid_aliases';end if;
  if jsonb_array_length(p_data->'aliases')>30 then raise exception 'invalid_aliases';end if;
  for a in select * from jsonb_array_elements(p_data->'aliases') loop
   if jsonb_typeof(a)<>'string' or length(btrim(a#>>'{}')) not between 1 and 120 or public.viejo_catalog_key(a#>>'{}')='facturas' then raise exception 'invalid_aliases';end if;
  end loop;
  if (select count(distinct public.viejo_catalog_key(x#>>'{}')) from jsonb_array_elements(p_data->'aliases') x)<>jsonb_array_length(p_data->'aliases') then raise exception 'invalid_aliases';end if;
  select * into c from public.viejo_catalog_categories where id=p_data->>'category_id' for share;
  if not found then raise exception 'invalid_category';end if;
  select * into p from public.guarni_catalog where id=p_data->>'id' for update;
  if (p.legacy_generic or public.viejo_catalog_key(p_data->>'name')='facturas') and ((p_data->>'active')::boolean or (p_data->>'available')::boolean) then raise exception 'generic_product_review';end if;
  insert into public.guarni_catalog(id,product_id,name,variant,category_id,category,price,available,active,seasonal,aliases)
   values(p_data->>'id',p_data->>'id',btrim(p_data->>'name'),btrim(p_data->>'variant'),c.id,c.name,(p_data->>'price')::integer,(p_data->>'available')::boolean,(p_data->>'active')::boolean,(p_data->>'seasonal')::boolean,p_data->'aliases')
   on conflict(id) do update set name=excluded.name,variant=excluded.variant,category_id=excluded.category_id,category=excluded.category,price=excluded.price,available=excluded.available,active=excluded.active,seasonal=excluded.seasonal,aliases=excluded.aliases,updated_at=now();
 end if;
 insert into public.guarni_audit(actor_id,action,target_id) values(p_actor,p_action,p_data->>'id');
 return jsonb_build_object('ok',true);
exception when unique_violation then raise exception 'duplicate_category';
end $$;
do $$ declare t text;f record;begin
 foreach t in array array['viejo_catalog_categories','viejo_catalog_backup'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('viejo_staff','viejo_quote','viejo_staff_settings_base','viejo_catalog_key') loop
 execute 'revoke all on function '||f.sig||' from public,anon,authenticated';
 execute 'grant execute on function '||f.sig||' to service_role';end loop;
end $$;
revoke execute on function public.viejo_staff_settings_base(uuid,text,jsonb) from service_role;
commit;
