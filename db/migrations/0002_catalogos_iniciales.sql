-- Catálogos iniciales: deben coincidir con careers y proyectosData de lib/registration-form.mjs.

INSERT INTO carreras (nombre, facultad)
SELECT nombre, 'Facultad de Ingeniería y Arquitectura (FIA)'
FROM unnest(ARRAY[
  'Arquitectura',
  'Ingeniería Civil',
  'Ingeniería Industrial',
  'Ingeniería Informática',
  'Ingeniería Mecánica',
  'Ingeniería Eléctrica',
  'Ingeniería Química',
  'Ingeniería de Alimentos',
  'Ingeniería Energética',
  'Técnico en Desarrollo de Software'
]) WITH ORDINALITY AS c (nombre, orden)
ORDER BY orden;

INSERT INTO instituciones (nombre) VALUES
  ('UCA El Salvador'),
  ('Alcaldía Municipal de San Salvador'),
  ('Cruz Roja Salvadoreña');

-- El id 0 ("Asesoría General UCA") es el valor por defecto del formulario y nunca debe cambiar.
INSERT INTO proyectos (id, nombre, institucion_id)
SELECT p.id, p.nombre, i.id
FROM (VALUES
  (0, 'Asesoría General UCA', 'UCA El Salvador'),
  (1, 'Alfabetización Digital Comunitaria', 'Alcaldía Municipal de San Salvador'),
  (2, 'Modernización del Portal Web Institucional', 'Cruz Roja Salvadoreña'),
  (3, 'Soporte y Mantenimiento de Redes FIA', 'UCA El Salvador')
) AS p (id, nombre, institucion)
JOIN instituciones i ON i.nombre = p.institucion;

SELECT setval(pg_get_serial_sequence('proyectos', 'id'), (SELECT max(id) FROM proyectos));

-- Proteger el proyecto por defecto: puede editarse su institución, pero no desactivarse.
ALTER TABLE proyectos ADD CONSTRAINT proyectos_defecto_siempre_activo CHECK (id <> 0 OR activo);
