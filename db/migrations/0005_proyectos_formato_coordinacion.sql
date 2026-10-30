-- Proyectos con el formato de la hoja de la coordinación:
-- CONTRAPARTE | PROYECTO/ACTIVIDAD | PERFIL / ESTUDIANTE | HORARIO / DÍAS | RESPONSABLE | TIPO DE SERVICIO SOCIAL | UBICACIÓN.
-- Contraparte = institución receptora (instituciones). Las columnas aceptan NULL porque los proyectos
-- anteriores (y "Asesoría General UCA") no las tienen; la aplicación las exige en cada alta nueva.

ALTER TABLE proyectos
  ADD COLUMN perfil             text CHECK (length(btrim(perfil)) BETWEEN 2 AND 1000),
  ADD COLUMN horario            text CHECK (length(btrim(horario)) BETWEEN 2 AND 1000),
  ADD COLUMN responsable        text CHECK (length(btrim(responsable)) BETWEEN 2 AND 200),
  ADD COLUMN responsable_correo text CHECK (responsable_correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  ADD COLUMN tipo_servicio      text CHECK (length(btrim(tipo_servicio)) BETWEEN 2 AND 200),
  ADD COLUMN ubicacion          text CHECK (length(btrim(ubicacion)) BETWEEN 2 AND 1000);

-- La misma actividad puede ofrecerse en varias contrapartes ("Apoyo en Modalidades Flexibles"):
-- el nombre deja de ser único global y pasa a ser único por institución.
ALTER TABLE proyectos DROP CONSTRAINT proyectos_nombre_normalizado_key;
ALTER TABLE proyectos ADD CONSTRAINT proyectos_nombre_por_institucion UNIQUE (institucion_id, nombre_normalizado);
