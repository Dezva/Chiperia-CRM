-- Aplicar después de 018, al publicar la revisión de lenguaje cotidiano.
-- Solo actualiza el texto de ayuda; conserva la función actualmente instalada.
begin;
do $$
declare definition text;signature regprocedure;
begin
 if to_regprocedure('public.viejo_pickup_order()') is null then
  raise exception 'apply_018_first';
 end if;
 signature=to_regprocedure('public.guarni_process_location(uuid,uuid,boolean)');
 if signature is null then raise exception 'location_function_required';end if;
 definition=pg_get_functiondef(signature);
 if position('CONFIRMAR PEDIDO' in definition)>0 then
  execute replace(definition,'CONFIRMAR PEDIDO','CONFIRMAR');
 end if;
end $$;
commit;
