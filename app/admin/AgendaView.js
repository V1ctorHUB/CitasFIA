"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import RegistrationForm from "../components/RegistrationForm";
import {
  addDays,
  DIAS,
  ESTADOS,
  formatLongDate,
  HORAS,
  isMovable,
  isoDate,
  MESES,
  mondayOf,
  parseIsoDate,
  todayInElSalvador,
} from "../../lib/agenda.mjs";
import { createIdempotencyKey, enviarSolicitud, GENDER_LABELS } from "../../lib/registration-form.mjs";
import { adminApi, errorMessage, ORIGEN_LABEL } from "./api";

function weekLabel(lunes) {
  const viernes = addDays(lunes, 4);
  return lunes.getMonth() === viernes.getMonth()
    ? `${lunes.getDate()} – ${viernes.getDate()} de ${MESES[lunes.getMonth()]} de ${lunes.getFullYear()}`
    : `${lunes.getDate()} de ${MESES[lunes.getMonth()]} – ${viernes.getDate()} de ${MESES[viernes.getMonth()]} de ${viernes.getFullYear()}`;
}

function Modal({ labelledBy, onClose, maxWidth, role = "dialog", children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    ref.current?.focus();
    // En el documento: tras deshabilitarse un botón el foco sale del diálogo y Escape debe seguir cerrándolo.
    const onKey = (event) => { if (event.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        className="dialog"
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth, outline: "none" }}
      >
        {children}
      </div>
    </div>
  );
}

function CloseButton({ onClick }) {
  return (
    <button type="button" className="btn btn-ghost btn-icon" onClick={onClick} aria-label="Cerrar">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  );
}

export default function AgendaView() {
  const today = useMemo(() => todayInElSalvador(), []);
  const baseMonday = useMemo(() => mondayOf(parseIsoDate(today)), [today]);
  const [semana, setSemana] = useState(0);
  const [agenda, setAgenda] = useState({ solicitudes: [], citas: [], bloqueados: [] });
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState(null);
  const [sel, setSel] = useState(null);
  const [drag, setDrag] = useState(null);
  const [detId, setDetId] = useState(null);
  const [mov, setMov] = useState(null);
  const [manual, setManual] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(0);

  const lunes = addDays(baseMonday, 7 * semana);
  const diasIso = [0, 1, 2, 3, 4].map((i) => isoDate(addDays(lunes, i)));
  const desde = diasIso[0];
  const hasta = diasIso[4];
  const semanaDe = useCallback(
    (iso) => Math.round((mondayOf(parseIsoDate(iso)) - baseMonday) / 864e5 / 7),
    [baseMonday],
  );

  const aviso = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 4500);
  }, []);

  const cargar = useCallback(async () => {
    const { ok, data } = await adminApi(`/api/admin/agenda?desde=${desde}&hasta=${hasta}`);
    if (ok) setAgenda(data);
    else aviso(errorMessage(data));
    setCargando(false);
  }, [desde, hasta, aviso]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los resultados reemplazan a la lista de solicitudes mientras haya texto de búsqueda.
  useEffect(() => {
    const query = busqueda.trim();
    if (!query) { setResultados(null); return undefined; }

    let activo = true;
    const timer = window.setTimeout(async () => {
      const { ok, data } = await adminApi(`/api/admin/buscar?q=${encodeURIComponent(query)}`);
      if (activo) setResultados(ok ? data.resultados : []);
    }, 250);
    return () => { activo = false; window.clearTimeout(timer); };
  }, [busqueda, agenda]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  async function accion(cita, body) {
    const { ok, data } = await adminApi(`/api/admin/citas/${cita.id}`, { method: "POST", body });
    aviso(ok ? data.message : errorMessage(data));
    if (ok) await cargar();
    return ok;
  }

  const bloqueado = (fecha) => agenda.bloqueados.includes(fecha);
  const enMano = sel !== null ? agenda.solicitudes.find((s) => s.id === sel) ?? null : null;
  const det = detId !== null ? agenda.citas.find((c) => c.id === detId) ?? null : null;

  function pedirMovimiento(cita, fecha, hora) {
    setDrag(null);
    if (cita.fecha === fecha && cita.hora === hora) return;
    if (bloqueado(fecha)) { aviso("Ese día está desactivado."); return; }
    if (fecha < today) { aviso("No se pueden agendar citas en fechas pasadas."); return; }
    setMov({ cita, fecha, hora, notificar: true });
    setDetId(null);
  }

  async function ubicar(solicitud, fecha, hora) {
    setDrag(null);
    setSel(null);
    await accion(solicitud, { accion: "asignar", fecha, hora });
  }

  async function toggleDia(fecha) {
    const bloquear = !bloqueado(fecha);
    const { ok, data } = await adminApi("/api/admin/dias", { method: "POST", body: { fecha, bloqueado: bloquear } });
    if (!ok) { aviso(errorMessage(data)); return; }
    aviso(!bloquear
      ? "Día reabierto para agendar citas."
      : data.citasEseDia
        ? `Día desactivado. Tiene ${data.citasEseDia} cita(s): muévelas a otro día para notificar a los estudiantes.`
        : "Día desactivado: no se podrán agendar citas en esa fecha.");
    await cargar();
  }

  const nPend = agenda.citas.filter((c) => c.estado === "PENDIENTE_CONFIRMACION").length;
  const nConf = agenda.citas.filter((c) => c.estado === "CONFIRMADA").length;

  return (
    <main style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", padding: "20px 24px 48px", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
      <aside className="panel agenda-aside" aria-label="Solicitudes">
        <div style={{ padding: "14px 16px 10px", display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid #eef1f6" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, color: "#123c8c" }}>
            Solicitudes <span className="badge">{agenda.solicitudes.length}</span>
          </h2>
          <div style={{ position: "relative" }}>
            <label htmlFor="buscar" className="sr-only">Buscar caso</label>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b667d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: 14 }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input
              id="buscar"
              type="search"
              value={busqueda}
              onChange={(event) => setBusqueda(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape") setBusqueda(""); }}
              autoComplete="off"
              placeholder="Buscar caso, nombre, carnet o DUI"
              style={{ paddingLeft: 40 }}
            />
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {resultados
              ? `${resultados.length} resultado(s) para “${busqueda.trim()}”.`
              : enMano
                ? `Haz clic en un horario libre para ubicar a ${enMano.nombreCompleto}. Vuelve a hacer clic en la tarjeta para cancelar.`
                : "Arrastra una solicitud al calendario, o selecciónala y elige un horario."}
          </p>
        </div>

        <div className="agenda-aside-list" role="list">
          {!resultados && !cargando && agenda.solicitudes.length === 0 && (
            <p className="muted" style={{ fontSize: 14, padding: "24px 8px", textAlign: "center", border: "1px dashed #d3dae6", borderRadius: 10 }}>
              No hay solicitudes sin horario.
            </p>
          )}
          {resultados && resultados.length === 0 && (
            <p className="muted" style={{ fontSize: 14, padding: "24px 8px", textAlign: "center" }}>Ningún caso coincide.</p>
          )}
          {(resultados ?? agenda.solicitudes).map((s) => (s.estado === "SOLICITADA" ? (
            <button
              key={s.id}
              type="button"
              role="listitem"
              className={sel === s.id ? "req req-sel" : "req"}
              draggable
              aria-pressed={sel === s.id}
              onClick={() => { setSel((current) => (current === s.id ? null : s.id)); setDrag(null); }}
              onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", s.id); setDrag(s); setSel(null); }}
              onDragEnd={() => setDrag(null)}
            >
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span className="mono muted">{s.caso}</span><span className="muted">Egreso {s.ciclo_egreso}</span>
              </span>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{s.nombreCompleto}</span>
              <span className="muted" style={{ fontSize: 13 }}><span className="mono">{s.carnet}</span> · Tel. <span className="mono">{s.telefono ?? "—"}</span></span>
              <span style={{ fontSize: 13 }}>{s.carrera}</span>
              <span className="muted" style={{ fontSize: 13 }}>{s.proyecto} — {s.institucion}</span>
              <span className="muted" style={{ fontSize: 12 }}>{ORIGEN_LABEL[s.origen]} · {s.recibida}</span>
            </button>
          ) : (
            <button
              key={s.id}
              type="button"
              role="listitem"
              className="req"
              style={{ cursor: "pointer" }}
              onClick={() => { setSemana(semanaDe(s.fecha)); setDetId(s.id); }}
            >
              <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
                <span className="mono muted">{s.caso}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: ESTADOS[s.estado].dot === "#ffffff" ? "#123c8c" : ESTADOS[s.estado].dot }} />
                  {ESTADOS[s.estado].label}
                </span>
              </span>
              <span style={{ fontWeight: 600, fontSize: 15 }}>{s.nombreCompleto}</span>
              <span className="muted" style={{ fontSize: 13 }}><span className="mono">{s.carnet}</span> · DUI <span className="mono">{s.dui}</span></span>
              <span style={{ fontSize: 13 }}>Cita: {formatLongDate(s.fecha)} · {s.hora} h</span>
            </button>
          )))}
        </div>
      </aside>

      <section aria-label="Calendario semanal" className="agenda-calendar">
        <div className="panel" style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSemana((s) => s - 1)} aria-label="Semana anterior">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSemana(0)} disabled={semana === 0}>Semana actual</button>
            <button type="button" className="btn btn-ghost btn-icon" onClick={() => setSemana((s) => s + 1)} aria-label="Semana siguiente">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            </button>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginRight: "auto" }}>{weekLabel(lunes)}</h2>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setManual({ fecha: diasIso.find((f) => f >= today && !bloqueado(f)) ?? "", hora: "" })}
          >
            + Nueva cita manual
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", fontSize: 13 }}>
          {Object.entries(ESTADOS).map(([key, estado]) => (
            <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: estado.bg, border: `1px solid ${estado.border}` }} />
              {estado.label}
            </span>
          ))}
          <span className="muted" style={{ marginLeft: "auto" }}>
            {agenda.citas.length} cita(s) · {nPend} por confirmar · {nConf} confirmada(s)
          </span>
        </div>

        {!cargando && agenda.citas.length === 0 && (
          <p role="status" style={{ padding: "12px 16px", border: "1px solid #dbe2ee", background: "#fff", borderRadius: 10, fontWeight: 600, color: "#123c8c" }}>
            Agenda libre en esta semana
          </p>
        )}

        <div className="panel" style={{ overflowX: "auto" }}>
          <div className="cal">
            <div />
            {diasIso.map((iso, i) => {
              const bq = bloqueado(iso);
              const color = bq ? "#8a93a5" : iso === today ? "#123c8c" : "#192033";
              return (
                <div key={iso} className="dayhead">
                  <span style={{ fontSize: 12, color, fontWeight: 600 }}>{DIAS[i]}</span>
                  <span style={{ fontSize: 20, fontWeight: 600, color, textDecoration: bq ? "line-through" : "none" }}>{parseIsoDate(iso).getDate()}</span>
                  {iso >= today && (
                    <button type="button" className="linkbtn" onClick={() => toggleDia(iso)} aria-pressed={bq}>
                      {bq ? "Reabrir día" : "Desactivar día"}
                    </button>
                  )}
                </div>
              );
            })}
            {HORAS.map((hora) => (
              <Fila
                key={hora}
                hora={hora}
                diasIso={diasIso}
                citas={agenda.citas}
                today={today}
                bloqueado={bloqueado}
                enMano={enMano}
                drag={drag}
                onAbrir={(c) => setDetId(c.id)}
                onClickLibre={(fecha) => (enMano ? ubicar(enMano, fecha, hora) : setManual({ fecha, hora }))}
                onDrop={(fecha) => {
                  if (!drag) return;
                  if (drag.estado === "SOLICITADA") ubicar(drag, fecha, hora);
                  else pedirMovimiento(drag, fecha, hora);
                }}
                onDragStart={(c) => { setDrag(c); setSel(null); }}
                onDragEnd={() => setDrag(null)}
              />
            ))}
          </div>
        </div>
      </section>

      {mov && (
        <Modal labelledBy="mov-titulo" role="alertdialog" maxWidth={520} onClose={() => setMov(null)}>
          <h3 id="mov-titulo" style={{ fontSize: 18 }}>¿Mover la cita de {mov.cita.nombreCompleto}?</h3>
          <dl className="dl">
            <dt>Actual</dt><dd>{formatLongDate(mov.cita.fecha)} · {mov.cita.hora} h</dd>
            <dt>Nuevo</dt><dd style={{ fontWeight: 600 }}>{formatLongDate(mov.fecha)} · {mov.hora} h</dd>
          </dl>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={mov.notificar} onChange={(event) => setMov({ ...mov, notificar: event.target.checked })} />
            Avisar al estudiante por correo ({mov.cita.correo})
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setMov(null)}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const { cita, fecha, hora, notificar } = mov;
                setMov(null);
                await accion(cita, { accion: "mover", fecha, hora, notificar });
              }}
            >
              Mover cita
            </button>
          </div>
        </Modal>
      )}

      {det && (
        <Detalle
          cita={det}
          hoy={today}
          onClose={() => setDetId(null)}
          onAccion={(body) => accion(det, body)}
          onMover={(fecha, hora) => {
            setSemana(semanaDe(fecha));
            pedirMovimiento(det, fecha, hora);
          }}
        />
      )}

      {manual && (
        <CitaManual
          inicial={manual}
          today={today}
          onClose={() => setManual(null)}
          onCreada={async (message, fecha) => {
            setManual(null);
            aviso(message);
            setSemana(semanaDe(fecha));
            await cargar();
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Fila({ hora, diasIso, citas, today, bloqueado, enMano, drag, onAbrir, onClickLibre, onDrop, onDragStart, onDragEnd }) {
  return (
    <>
      <div className="muted" style={{ fontSize: 12, padding: "8px 8px 0 0", textAlign: "right", borderTop: "1px solid #e3e8f1" }}>{hora}</div>
      {diasIso.map((fecha, i) => {
        const cita = citas.find((c) => c.fecha === fecha && c.hora === hora) ?? null;
        const estado = cita ? ESTADOS[cita.estado] : null;
        const bq = bloqueado(fecha);
        const pasado = fecha < today;
        const objetivo = !cita && !bq && !pasado && (Boolean(enMano) || Boolean(drag));
        const dia = `${DIAS[i]} ${parseIsoDate(fecha).getDate()}, ${hora}`;
        const cls = objetivo ? "slot slot-target" : bq ? "slot slot-bloq" : pasado ? "slot slot-pasado" : "slot";

        return (
          <div
            key={fecha}
            className={cls}
            onDragOver={(event) => { if (!cita && !bq && !pasado) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
            onDrop={(event) => { event.preventDefault(); if (!cita) onDrop(fecha); }}
          >
            {cita && (
              <button
                type="button"
                className="cita"
                draggable={isMovable(cita.estado)}
                onDragStart={(event) => {
                  if (!isMovable(cita.estado)) { event.preventDefault(); return; }
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", cita.id);
                  onDragStart(cita);
                }}
                onDragEnd={onDragEnd}
                onClick={() => onAbrir(cita)}
                style={{ background: estado.bg, color: estado.ink, boxShadow: `inset 0 0 0 1px ${estado.border}` }}
                aria-label={`${cita.nombreCompleto}, ${dia}, ${estado.label}`}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <i aria-hidden="true" style={{ flex: "none", width: 7, height: 7, borderRadius: "50%", background: estado.dot }} />
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cita.nombreCompleto}</span>
                </span>
                <span className="mono" style={{ fontSize: 11, opacity: 0.85 }}>{cita.caso}</span>
                <span style={{ fontSize: 11, opacity: 0.85 }}>{estado.label}</span>
              </button>
            )}
            {!cita && !bq && (
              <button
                type="button"
                className="slot-btn"
                disabled={pasado}
                onClick={() => onClickLibre(fecha)}
                aria-label={enMano ? `Ubicar a ${enMano.nombreCompleto} el ${dia}` : `Nueva cita manual el ${dia}`}
              >
                <span className={enMano ? "" : "slot-plus"}>{enMano ? "Ubicar aquí" : "+ Cita manual"}</span>
              </button>
            )}
            {!cita && bq && hora === HORAS[0] && <span className="muted" style={{ fontSize: 12, padding: 6 }}>Día desactivado</span>}
          </div>
        );
      })}
    </>
  );
}

function Detalle({ cita, hoy, onClose, onAccion, onMover }) {
  const [historial, setHistorial] = useState([]);
  const [rep, setRep] = useState({ fecha: "", hora: "" });
  const [confirmaBorrado, setConfirmaBorrado] = useState(false);
  const [notificar, setNotificar] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const estado = ESTADOS[cita.estado];
  const movible = isMovable(cita.estado);

  useEffect(() => {
    let activo = true;
    adminApi(`/api/admin/citas/${cita.id}`).then(({ ok, data }) => {
      if (activo && ok) setHistorial(data.historial);
    });
    return () => { activo = false; };
  }, [cita.id, cita.estado, cita.fecha, cita.hora]);

  async function ejecutar(body, cerrar = false) {
    setOcupado(true);
    const ok = await onAccion(body);
    setOcupado(false);
    if (ok && cerrar) onClose();
  }

  const ayuda = cita.estado === "PENDIENTE_CONFIRMACION"
    ? "Cuando el estudiante confirme, presiona Confirmado; si pide otra hora, mueve la cita."
    : cita.estado === "CONFIRMADA"
      ? "Después de la sesión registra Asistió o No asistió. La inasistencia es solo estadística: no bloquea al estudiante para futuras solicitudes."
      : "Registro cerrado; cuenta para el Dashboard BI. Puedes corregir la asistencia si fue un error.";

  return (
    <Modal labelledBy="det-titulo" maxWidth={760} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: estado.bg, color: estado.ink, boxShadow: `inset 0 0 0 1px ${estado.border}` }}>{estado.label}</span>
          <h3 id="det-titulo" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>{cita.nombreCompleto}</h3>
          <span style={{ fontSize: 14 }}>
            <span className="mono">{cita.caso}</span>{" "}
            <span className="muted">· {formatLongDate(cita.fecha)} · {cita.hora} h · {ORIGEN_LABEL[cita.origen]}</span>
          </span>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18, padding: "16px 0", borderTop: "1px solid #eef1f6", borderBottom: "1px solid #eef1f6" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="sect">Identificación</span>
          <dl className="dl">
            <dt>Carnet</dt><dd className="mono">{cita.carnet}</dd>
            <dt>Correo</dt><dd className="mono">{cita.correo}</dd>
            <dt>DUI</dt><dd className="mono">{cita.dui}</dd>
            <dt>Teléfono</dt><dd className="mono">{cita.telefono ?? "—"}</dd>
            <dt>Género</dt><dd>{GENDER_LABELS[cita.genero]}</dd>
          </dl>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="sect">Perfil académico</span>
          <dl className="dl"><dt>Carrera</dt><dd>{cita.carrera}</dd><dt>Facultad</dt><dd>{cita.facultad}</dd><dt>Egreso</dt><dd>{cita.ciclo_egreso}</dd></dl>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="sect">Servicio social</span>
          <dl className="dl"><dt>Proyecto</dt><dd><span className="muted mono">#{cita.proyecto_id}</span> {cita.proyecto}</dd><dt>Institución</dt><dd>{cita.institucion}</dd></dl>
        </div>
      </div>

      {movible && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor="rep-fecha">Reprogramar · fecha</label>
            <input id="rep-fecha" type="date" value={rep.fecha} onChange={(event) => setRep({ ...rep, fecha: event.target.value })} style={{ minHeight: 40 }} />
          </div>
          <div className="field" style={{ flex: "1 1 120px" }}>
            <label htmlFor="rep-hora">Hora</label>
            <select id="rep-hora" value={rep.hora} onChange={(event) => setRep({ ...rep, hora: event.target.value })} style={{ minHeight: 40 }}>
              <option value="">—</option>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" disabled={!rep.fecha || !rep.hora} onClick={() => onMover(rep.fecha, rep.hora)}>Mover cita…</button>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" className="btn btn-primary" disabled={ocupado || cita.estado !== "PENDIENTE_CONFIRMACION"} onClick={() => ejecutar({ accion: "confirmar" })}>✓ Confirmado</button>
        <button type="button" className="btn btn-ok" disabled={ocupado || cita.fecha > hoy || !["CONFIRMADA", "NO_ASISTIO"].includes(cita.estado)} onClick={() => ejecutar({ accion: "asistio" }, true)}>Asistió</button>
        <button type="button" className="btn btn-secondary" disabled={ocupado || cita.fecha > hoy || !["CONFIRMADA", "ASISTIO"].includes(cita.estado)} onClick={() => ejecutar({ accion: "no_asistio" }, true)}>No asistió</button>
        <button type="button" className="btn btn-ghost" disabled={ocupado || !movible} onClick={() => ejecutar({ accion: "reenviar" })}>Reenviar correo</button>
        <span style={{ flex: 1 }} />
        {!confirmaBorrado && movible && <button type="button" className="btn btn-danger" onClick={() => setConfirmaBorrado(true)}>Eliminar cita</button>}
      </div>

      {confirmaBorrado && (
        <div role="alert" style={{ padding: 14, borderRadius: 10, background: "#fdf2f2", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 14px" }}>
          <strong style={{ fontSize: 14, color: "#7f1d1d", marginRight: "auto" }}>¿Eliminar esta cita del calendario?</strong>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: "auto", minHeight: 0 }} checked={notificar} onChange={(event) => setNotificar(event.target.checked)} />
            Notificar cancelación por correo
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmaBorrado(false)}>No</button>
          <button type="button" className="btn btn-danger btn-sm" disabled={ocupado} onClick={() => ejecutar({ accion: "cancelar", notificar }, true)}>Sí, eliminar</button>
        </div>
      )}
      <p className="muted" style={{ fontSize: 13 }}>{ayuda}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sect">Historial</span>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          {[...historial].reverse().map((h, i) => (
            <li key={i} style={{ display: "flex", gap: 10 }}>
              <span className="muted mono" style={{ flex: "none", fontSize: 12 }}>{h.cuando}</span><span>{h.descripcion}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function CitaManual({ inicial, today, onClose, onCreada }) {
  const [slot, setSlot] = useState(inicial);
  const [errores, setErrores] = useState({});
  const idempotencyKey = useRef(createIdempotencyKey());

  async function registrar(registration, project) {
    if (!slot.fecha || !slot.hora) {
      const errors = { fecha: slot.fecha ? "" : "Indica la fecha de la cita.", hora: slot.hora ? "" : "Selecciona la hora." };
      setErrores(errors);
      return { status: "invalid", errors };
    }
    const result = await enviarSolicitud(registration, project, idempotencyKey.current, fetch, {
      url: "/api/admin/citas",
      extra: { fecha: slot.fecha, hora: slot.hora },
    });
    if (result.status === "invalid") setErrores({ fecha: result.errors.fecha, hora: result.errors.hora });
    if (result.status === "ok") onCreada("Cita manual registrada.", slot.fecha);
    return result;
  }

  return (
    <Modal labelledBy="manual-titulo" maxWidth={760} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p className="eyebrow">Coordinación</p>
          <h3 id="manual-titulo" style={{ fontSize: 22 }}>Nueva cita manual</h3>
          <p className="muted" style={{ fontSize: 14 }}>Para estudiantes atendidos en persona o por teléfono. Queda Confirmada y no envía correo.</p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <RegistrationForm onSubmit={registrar} submitLabel="Registrar cita manual">
        <div className="egreso-select-group full-width">
          <div className="field">
            <label htmlFor="manual-fecha">Fecha de la cita</label>
            <input
              id="manual-fecha"
              type="date"
              min={today}
              value={slot.fecha}
              onChange={(event) => { setSlot({ ...slot, fecha: event.target.value }); setErrores({ ...errores, fecha: "" }); }}
              aria-invalid={Boolean(errores.fecha)}
              className={errores.fecha ? "input-error" : undefined}
            />
            {errores.fecha && <p className="field-error" role="alert">{errores.fecha}</p>}
          </div>
          <div className="field">
            <label htmlFor="manual-hora">Hora</label>
            <select
              id="manual-hora"
              value={slot.hora}
              onChange={(event) => { setSlot({ ...slot, hora: event.target.value }); setErrores({ ...errores, hora: "" }); }}
              aria-invalid={Boolean(errores.hora)}
              className={errores.hora ? "input-error" : undefined}
            >
              <option value="">Selecciona la hora</option>
              {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            {errores.hora && <p className="field-error" role="alert">{errores.hora}</p>}
          </div>
        </div>
      </RegistrationForm>
    </Modal>
  );
}
