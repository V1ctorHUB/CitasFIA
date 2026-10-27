-- Pedido de la coordinación (Oscar Arias): teléfono del estudiante y carreras de todas las facultades.
-- El orden de inserción debe coincidir con FACULTIES de lib/registration-form.mjs.

-- Nulo solo para estudiantes registrados antes de esta migración; el formulario siempre lo exige.
ALTER TABLE estudiantes
  ADD COLUMN telefono text CHECK (telefono ~ '^[267][0-9]{3}-[0-9]{4}$');

INSERT INTO carreras (nombre, facultad)
SELECT c.nombre, c.facultad
FROM (VALUES
  (1, 'Licenciatura en Ciencias Sociales', 'Facultad de Ciencias Sociales y Humanidades'),
  (2, 'Licenciatura en Filosofía', 'Facultad de Ciencias Sociales y Humanidades'),
  (3, 'Licenciatura en Idioma Inglés', 'Facultad de Ciencias Sociales y Humanidades'),
  (4, 'Licenciatura en Psicología', 'Facultad de Ciencias Sociales y Humanidades'),
  (5, 'Licenciatura en Teología', 'Facultad de Ciencias Sociales y Humanidades'),
  (6, 'Técnico en Marketing Digital', 'Comunicaciones y Mercadeo'),
  (7, 'Técnico en Producción Multimedia', 'Comunicaciones y Mercadeo'),
  (8, 'Licenciatura en Mercadeo', 'Comunicaciones y Mercadeo'),
  (9, 'Licenciatura en Comunicación Social', 'Comunicaciones y Mercadeo')
) AS c (orden, nombre, facultad)
ORDER BY c.orden;
