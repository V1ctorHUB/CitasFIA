-- citas_app no tiene DELETE sobre ninguna tabla. eliminar_proyecto() corre con los permisos de su dueño (citas_owner,
-- quien aplica las migraciones): la app solo puede borrar a través de ella y con todas sus reglas.
-- search_path fijo para que una función SECURITY DEFINER no resuelva tablas en otro esquema.
ALTER FUNCTION eliminar_proyecto(integer) SECURITY DEFINER SET search_path = public, pg_temp;
