-- Eliminación definitiva de un proyecto y de todo lo que depende de él (pedida por la coordinación para limpiar la base).
-- Las tablas siguen sin admitir DELETE sueltos: solo eliminar_proyecto() abre el paso, dentro de su propia transacción.

-- impedir_borrado deja pasar un DELETE solo mientras eliminar_proyecto() tiene activo app.borrado_autorizado.
CREATE OR REPLACE FUNCTION impedir_borrado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.borrado_autorizado', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'No se permite eliminar filas de %; desactívalas o cancélalas.', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;

-- Borra el proyecto, sus citas (con historial y correos), los estudiantes que solo tenían citas en él, la contraparte
-- si queda sin proyectos y la auditoría de todo eso (guarda datos personales). Queda un único registro de la
-- eliminación: quién, cuándo, nombre del proyecto y cuántas citas y estudiantes se fueron, sin datos de estudiantes.
-- Devuelve NULL si el proyecto no existe.
CREATE FUNCTION eliminar_proyecto(p_id integer) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_proyecto       proyectos%ROWTYPE;
  v_institucion    text;
  v_citas          bigint[];
  v_estudiantes    bigint[];
  v_est_borrados   bigint[];
  v_inst_borrada   boolean;
BEGIN
  IF p_id = 0 THEN
    RAISE EXCEPTION 'El proyecto por defecto no se elimina.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proyecto FROM proyectos WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT nombre INTO v_institucion FROM instituciones WHERE id = v_proyecto.institucion_id;

  SELECT coalesce(array_agg(id), '{}'), coalesce(array_agg(DISTINCT estudiante_id), '{}')
    INTO v_citas, v_estudiantes
    FROM citas WHERE proyecto_id = p_id;

  PERFORM set_config('app.borrado_autorizado', 'on', true);

  DELETE FROM correos WHERE cita_id = ANY (v_citas);
  DELETE FROM cita_eventos WHERE cita_id = ANY (v_citas);
  DELETE FROM citas WHERE id = ANY (v_citas);

  WITH borrados AS (
    DELETE FROM estudiantes e
    WHERE e.id = ANY (v_estudiantes)
      AND NOT EXISTS (SELECT 1 FROM citas c WHERE c.estudiante_id = e.id)
    RETURNING e.id
  )
  SELECT coalesce(array_agg(id), '{}') INTO v_est_borrados FROM borrados;

  DELETE FROM proyectos WHERE id = p_id;

  DELETE FROM instituciones i
  WHERE i.id = v_proyecto.institucion_id
    AND NOT EXISTS (SELECT 1 FROM proyectos p WHERE p.institucion_id = i.id);
  v_inst_borrada := FOUND;

  DELETE FROM auditoria
  WHERE (tabla = 'citas' AND registro_id = ANY (v_citas::text[]))
     OR (tabla = 'estudiantes' AND registro_id = ANY (v_est_borrados::text[]))
     OR (tabla = 'proyectos' AND registro_id = p_id::text)
     OR (tabla = 'instituciones' AND v_inst_borrada AND registro_id = v_proyecto.institucion_id::text);

  PERFORM set_config('app.borrado_autorizado', 'off', true);

  INSERT INTO auditoria (tabla, registro_id, operacion, datos_antes, actor)
  VALUES ('proyectos', p_id::text, 'DELETE',
          jsonb_build_object('nombre', v_proyecto.nombre, 'institucion', v_institucion, 'eliminacion_completa', true,
                             'citas', cardinality(v_citas), 'estudiantes', cardinality(v_est_borrados)),
          NULLIF(current_setting('app.actor', true), ''));

  RETURN jsonb_build_object('citas', cardinality(v_citas), 'estudiantes', cardinality(v_est_borrados),
                            'institucion', v_inst_borrada);
END;
$$;
