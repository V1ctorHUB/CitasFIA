-- Módulos 3 y 5 (agenda de coordinación) y bandeja de salida de correos.

-- Dos citas vigentes nunca ocupan el mismo horario, aunque dos sesiones asignen a la vez.
CREATE UNIQUE INDEX citas_un_horario_ocupado
  ON citas (fecha_hora)
  WHERE fecha_hora IS NOT NULL AND estado <> 'CANCELADA';

-- Días en que la coordinación no atiende. Se reabre poniendo bloqueado = false (la app no borra filas).
CREATE TABLE dias_bloqueados (
  fecha          date PRIMARY KEY,
  bloqueado      boolean NOT NULL DEFAULT true,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Historial legible de cada cita (la tabla auditoria guarda el detalle técnico).
CREATE TABLE cita_eventos (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cita_id     bigint NOT NULL REFERENCES citas (id) ON DELETE RESTRICT,
  descripcion text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 1 AND 300),
  actor       text,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cita_eventos_cita_idx ON cita_eventos (cita_id, creado_en);

CREATE TYPE tipo_correo AS ENUM ('ASIGNACION', 'REPROGRAMACION', 'RECORDATORIO', 'CANCELACION');
CREATE TYPE estado_correo AS ENUM ('PENDIENTE', 'ENVIADO', 'ERROR');

-- Bandeja de salida: el correo se guarda en la misma transacción que la acción que lo origina
-- y un proceso aparte lo entrega (lib/server/email.mjs).
CREATE TABLE correos (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cita_id        bigint NOT NULL REFERENCES citas (id) ON DELETE RESTRICT,
  tipo           tipo_correo NOT NULL,
  destinatario   text NOT NULL CHECK (destinatario ~ '^[0-9]{8}@uca\.edu\.sv$'),
  asunto         text NOT NULL CHECK (length(asunto) BETWEEN 1 AND 200),
  cuerpo         text NOT NULL CHECK (length(cuerpo) BETWEEN 1 AND 5000),
  estado         estado_correo NOT NULL DEFAULT 'PENDIENTE',
  intentos       smallint NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ultimo_error   text,
  creado_en      timestamptz NOT NULL DEFAULT now(),
  enviado_en     timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correos_enviado_con_fecha CHECK ((estado = 'ENVIADO') = (enviado_en IS NOT NULL))
);

CREATE INDEX correos_por_entregar_idx ON correos (creado_en) WHERE estado <> 'ENVIADO';
CREATE INDEX correos_recientes_idx ON correos (creado_en DESC);

CREATE TRIGGER dias_bloqueados_actualizado_en BEFORE UPDATE ON dias_bloqueados FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();
CREATE TRIGGER correos_actualizado_en BEFORE UPDATE ON correos FOR EACH ROW EXECUTE FUNCTION fijar_actualizado_en();

CREATE TRIGGER dias_bloqueados_sin_borrado BEFORE DELETE ON dias_bloqueados FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER correos_sin_borrado BEFORE DELETE ON correos FOR EACH ROW EXECUTE FUNCTION impedir_borrado();
CREATE TRIGGER cita_eventos_solo_insercion BEFORE UPDATE OR DELETE ON cita_eventos FOR EACH ROW EXECUTE FUNCTION impedir_borrado();

CREATE TRIGGER dias_bloqueados_auditoria AFTER INSERT OR UPDATE OR DELETE ON dias_bloqueados FOR EACH ROW EXECUTE FUNCTION auditar_cambios('fecha');
