-- El tipo de servicio social es una lista cerrada: interno o externo, solo o con su modalidad.
-- Debe coincidir con TIPOS_SERVICIO de lib/projects.mjs. NULL sigue permitido para los proyectos anteriores.
ALTER TABLE proyectos ADD CONSTRAINT proyectos_tipo_servicio_valido CHECK (tipo_servicio IN (
  'Interno', 'Interno - Presencial', 'Interno - Semipresencial', 'Interno - Virtual',
  'Externo', 'Externo - Presencial', 'Externo - Semipresencial', 'Externo - Virtual'
));
