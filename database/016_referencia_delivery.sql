-- Aplicar después de 015. No cambia pedidos ni ubicaciones existentes.
begin;
create or replace function public.guarni_process_location(p_token uuid,p_job uuid,p_reply_enabled boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.guarni_jobs; c public.guarni_conversations; m public.guarni_messages;
 point public.guarni_locations; candidate public.guarni_orders; candidates integer; reply text; association text;reference text;reference_point text;
begin
 select * into j from public.guarni_jobs where id=p_job for update;
 if j.id is null then raise exception 'not_found'; end if;
 if j.status='done' then return jsonb_build_object('duplicate',true); end if;
 select * into c from public.guarni_conversations where id=j.conversation_id for update;
 if c.processing_token is distinct from p_token or c.processing_until<now() then raise exception 'lease_expired'; end if;
 select * into m from public.guarni_messages where id=j.message_id;
 if m.content_type='location' then
  select * into point from public.guarni_locations where message_id=m.id and conversation_id=c.id;
  if point.id is null then raise exception 'invalid_location'; end if;
  select count(*) into candidates from public.guarni_orders where conversation_id=c.id
   and (status='pending' or (status in ('accepted','preparing','ready') and fulfillment='delivery'));
  -- Una entrega demorada no puede reemplazar una ubicación más nueva ni reaparecer en otro pedido.
  if point.whatsapp_sent_at is not null and (
   exists(select 1 from public.guarni_locations previous where previous.conversation_id=c.id
    and previous.id<>point.id and previous.whatsapp_sent_at>point.whatsapp_sent_at)
   or exists(select 1 from public.guarni_orders previous where previous.conversation_id=c.id
    and date_trunc('second',previous.created_at)>point.whatsapp_sent_at)
  ) then
   update public.guarni_locations set review_reason='stale_location' where id=point.id;
   association='review';
   reply='Recibí una ubicación enviada anteriormente 📍. El equipo revisará si corresponde a tu pedido actual.';
  elsif jsonb_array_length(coalesce(c.cart->'items','[]'::jsonb))>0 or c.cart->>'fulfillment' in ('delivery','retiro','local') or candidates=0 then
   reference=btrim(coalesce(c.cart->>'address',''));
   reference_point=c.cart->>'address_location_id';
   if reference_point is not null and reference_point<>point.id::text then reference='';reference_point=null;end if;
   if length(reference)<3 and length(btrim(point.address))>=3 then reference=btrim(point.address);reference_point=point.id::text;end if;
   update public.guarni_conversations set draft_location_id=point.id,
    cart=jsonb_set(jsonb_set(jsonb_set(c.cart,'{address}',to_jsonb(reference)),'{address_location_id}',coalesce(to_jsonb(reference_point),'null'::jsonb)),'{delivery_location_id}',to_jsonb(point.id)) where id=c.id;
   association='draft';
   reply='¡Listo, recibí tu ubicación! 📍';
   if length(reference)<3 then
    reply=reply||' Solo falta una referencia escrita para llegar: calle y número, fachada o un punto cercano.';
   elsif jsonb_array_length(coalesce(c.cart->'items','[]'::jsonb))>0 then
    reply=reply||' También tengo la referencia. Para enviar tu solicitud al local, escribí CONFIRMAR PEDIDO.';
   end if;
  elsif candidates=1 then
   select * into candidate from public.guarni_orders where conversation_id=c.id
    and (status='pending' or (status in ('accepted','preparing','ready') and fulfillment='delivery')) for update;
   if candidate.status='pending' and candidate.fulfillment='delivery' then
    update public.guarni_orders set delivery_location_id=point.id,updated_at=now() where id=candidate.id;
    insert into public.guarni_order_locations(order_id,location_id) values(candidate.id,point.id) on conflict do nothing;
    association='pending_order';
    reply='¡Listo, recibí tu ubicación! 📍 La adjunté a tu solicitud #'||candidate.number||', que sigue pendiente de aceptación del local.';
   else
    update public.guarni_locations set review_reason='accepted_order' where id=point.id;
    association='review';
    reply='Recibí tu nueva ubicación 📍. El equipo revisará a qué pedido corresponde y confirmará cualquier cambio.';
   end if;
  else
   update public.guarni_locations set review_reason='multiple_orders' where id=point.id;
   association='review';
   reply='Recibí tu ubicación 📍. Hay varios pedidos en curso y el equipo elegirá a cuál adjuntarla.';
  end if;
 elsif m.content_type='live_location' then
  reply='Para el delivery, enviame tu ubicación actual puntual desde WhatsApp 📍. No hace falta compartirla en tiempo real.';
 elsif m.content_type='invalid_location' then
  reply='No pude leer una ubicación válida. Enviame tu ubicación actual puntual desde WhatsApp 📍.';
 else raise exception 'invalid_location_type'; end if;
 if p_reply_enabled is true and c.mode='bot' then
  insert into public.guarni_messages(conversation_id,direction,actor,body,status,revision)
  values(c.id,'outbound','bot',reply,'queued',c.revision);
 end if;
 update public.guarni_jobs set status='done',error=null where id=j.id;
 update public.guarni_conversations set processing_token=null,processing_until=null,updated_at=now() where id=c.id;
 return jsonb_build_object('association',association);
end $$;


revoke all on function public.guarni_process_location(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.guarni_process_location(uuid,uuid,boolean) to service_role;
commit;
