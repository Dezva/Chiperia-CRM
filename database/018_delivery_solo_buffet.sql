-- Aplicar una vez después de 017. Reejecutable; no modifica pedidos ni catálogo.
begin;
insert into public.viejo_settings_ux_backup(version,config)
 select '018',config from public.guarni_settings where id=true on conflict do nothing;

create or replace function public.viejo_delivery_mode(p_config jsonb,p_service text) returns text
language sql immutable set search_path='' as $$
 select case
 when p_service='chiperia' then 'disabled'
 when p_config->'schedules'->p_service->>'delivery_mode' in ('scheduled','pending','disabled') then p_config->'schedules'->p_service->>'delivery_mode'
 when jsonb_typeof(p_config->'fulfillment_modes')='array' and not (p_config->'fulfillment_modes' @> '"delivery"'::jsonb) then 'disabled'
 when coalesce(p_config->'schedules'->p_service->>'delivery_open','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and coalesce(p_config->'schedules'->p_service->>'delivery_close','') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then 'scheduled'
 else 'pending' end;
$$;

-- Configuración antigua o escrituras directas tampoco pueden habilitar chipería.
create or replace function public.viejo_pickup_settings() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.config->'schedules' ? 'chiperia' then
  new.config=jsonb_set(new.config,'{schedules,chiperia}',(new.config->'schedules'->'chiperia')||'{"delivery_mode":"disabled","delivery_open":null,"delivery_close":null}'::jsonb);
 end if;
 if public.viejo_delivery_mode(new.config,'buffet')='disabled' then
  new.config=jsonb_set(new.config,'{fulfillment_modes}',coalesce(new.config->'fulfillment_modes','[]'::jsonb)-'delivery');
  new.fulfillment_modes=new.config->'fulfillment_modes';
 end if;
 return new;
end $$;
drop trigger if exists viejo_pickup_settings on public.guarni_settings;
create trigger viejo_pickup_settings before insert or update on public.guarni_settings
 for each row execute function public.viejo_pickup_settings();
update public.guarni_settings set config=config where id=true;

-- Históricos y entregas ya aceptadas siguen siendo consultables y pueden terminarse.
-- Nuevas solicitudes, cambios a delivery y nuevas aceptaciones quedan bloqueados.
create or replace function public.viejo_pickup_order() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.service='chiperia' and new.fulfillment='delivery' then
  if tg_op='INSERT' then raise exception 'delivery_disabled';end if;
  if old.service is distinct from new.service or old.fulfillment is distinct from new.fulfillment
   or (new.status in ('pending','accepted') and old.status is distinct from new.status)
   then raise exception 'delivery_disabled';end if;
 end if;
 return new;
end $$;
drop trigger if exists viejo_pickup_order on public.guarni_orders;
create trigger viejo_pickup_order before insert or update on public.guarni_orders
 for each row execute function public.viejo_pickup_order();
revoke all on function public.viejo_pickup_settings(),public.viejo_pickup_order() from public,anon,authenticated;
-- Mantiene la implementación vigente de 017 y ajusta el aviso y limpieza de puntos.
create or replace function public.guarni_finish(p_token uuid,p_job uuid,p_revision integer,p_cart jsonb,p_body text,p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.guarni_conversations; j public.guarni_jobs; it jsonb; v public.guarni_catalog; itemlist jsonb='[]'; amount integer=0; o public.guarni_orders; q jsonb; related uuid; submitted boolean=false; service_changed boolean;
begin
 select * into j from public.guarni_jobs where id=p_job for update;
 if j.status='done' then return jsonb_build_object('duplicate',true); end if;
 select * into c from public.guarni_conversations where id=j.conversation_id for update;
 if c.processing_token is distinct from p_token or c.processing_until<now() then raise exception 'lease_expired'; end if;
 if c.mode='human' or c.revision<>p_revision or p_kind='ignore' then
  update public.guarni_jobs set status='done' where id=p_job;
  update public.guarni_conversations set processing_token=null,processing_until=null where id=c.id;
  return jsonb_build_object('discarded',true);
 end if;
 if p_kind not in ('reply','submit','human') then raise exception 'invalid_action'; end if;
 service_changed=c.cart->>'service' is not null and coalesce(c.cart->>'service','')<>coalesce(p_cart->>'service','');
 if p_kind='submit' then
  submitted=true;
  if p_cart->>'fulfillment'='delivery' and public.viejo_delivery_mode((select config from public.guarni_settings where id=true),p_cart->>'service')='disabled' then raise exception 'delivery_disabled';end if;
  if p_cart->>'fulfillment'='delivery' and not exists(
   select 1 from public.guarni_locations where id=c.draft_location_id and conversation_id=c.id
  ) then raise exception 'delivery_location_required'; end if;
  if coalesce((c.cart->>'quoted')::boolean,false) is not true or jsonb_array_length(p_cart->'items') not between 1 and 30 then raise exception 'not_quoted'; end if;
  if c.cart->'items' is distinct from p_cart->'items' then raise exception 'cart_changed'; end if;
  q=public.viejo_quote(p_cart->>'service',p_cart->'items');
  if q->'items' is distinct from p_cart->'items' then raise exception 'price_or_availability_changed';end if;
  itemlist=q->'items'; amount=(q->>'subtotal')::integer;
  if p_cart->>'fulfillment' not in ('retiro','delivery') then raise exception 'fulfillment_required';end if;
  select coalesce(group_id,gen_random_uuid()) into related from public.guarni_orders where conversation_id=c.id and service<>p_cart->>'service' and status in ('pending','accepted','preparing','ready') order by created_at desc limit 1;
  if related is not null then update public.guarni_orders set group_id=related where conversation_id=c.id and status in ('pending','accepted','preparing','ready');end if;
  insert into public.guarni_orders(client_id,conversation_id,source_message_id,service,group_id,items,subtotal,customer_name,fulfillment,address,payment)
  values(c.client_id,c.id,j.message_id,p_cart->>'service',related,itemlist,amount,coalesce(nullif(p_cart->>'customer_name',''),'Cliente WhatsApp'),coalesce(p_cart->>'fulfillment','a_coordinar'),coalesce(p_cart->>'address',''),coalesce(p_cart->>'payment','a_coordinar'))
  returning * into o;
  if p_cart->>'fulfillment'='delivery' then
   update public.guarni_orders set delivery_location_id=c.draft_location_id where id=o.id returning * into o;
   insert into public.guarni_order_locations(order_id,location_id) values(o.id,c.draft_location_id);
  end if;
  p_body='Solicitud #'||o.number||' registrada. Está PENDIENTE DE ACEPTACIÓN DEL LOCAL. '||case when p_cart->>'service'='chiperia' then 'El equipo confirmará disponibilidad, retiro en el local y tiempo de preparación.' else 'El equipo confirmará disponibilidad, modalidad, costo de envío y tiempo de preparación.' end;
  if p_cart->>'service'='buffet' then p_kind='human';end if;
  p_cart=jsonb_build_object('items','[]'::jsonb,'service',p_cart->>'service','saved_carts',public.viejo_clean_saved_carts(p_cart->'saved_carts'));

 end if;
 if length(p_body)>0 then
  insert into public.guarni_messages(conversation_id,direction,actor,body,status,revision)
  values(c.id,'outbound',case when p_kind='human' then 'system' else 'bot' end,left(p_body,4096),'queued',c.revision);
 end if;
 update public.guarni_conversations set cart=case when submitted or service_changed or p_cart->>'service'='chiperia' or p_cart->>'fulfillment'='retiro' then jsonb_set(p_cart,'{delivery_location_id}','null') else p_cart end,
  mode=case when p_kind='human' then 'human' else mode end,
  revision=revision+case when p_kind='human' then 1 else 0 end,
  processing_token=null,processing_until=null,updated_at=now(),
  draft_location_id=case when submitted or service_changed or p_cart->>'service'='chiperia' or p_cart->>'fulfillment'='retiro' or exists(
   select 1 from public.guarni_messages where id=j.message_id and lower(btrim(body)) in ('/cancelar','/reiniciar','cancelar pedido')
  ) then null else draft_location_id end where id=c.id;
 update public.guarni_jobs set status='done',error=null where id=p_job;
 return jsonb_build_object('order',to_jsonb(o));
end $$;
commit;
