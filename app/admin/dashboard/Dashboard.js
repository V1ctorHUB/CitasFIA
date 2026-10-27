"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, formatLongDate, formatShortDate, isoDate, mondayOf, parseIsoDate, todayInElSalvador } from "../../../lib/agenda.mjs";
import { aplicarFiltros, contar, DIMENSIONES, excelXml, resumen, seleccionar } from "../../../lib/dashboard.mjs";
import { GENDER_OPTIONS } from "../../../lib/registration-form.mjs";
import { adminApi, errorMessage, GENERO_LABEL } from "../api";

const ORDEN_GENERO = GENDER_OPTIONS.map(({ value }) => value);
const ORDEN_ASISTENCIA = ["ASISTIO", "NO_ASISTIO", "POR_REALIZAR"];
// Paleta categórica validada (orden fijo: el color sigue al género, nunca a su posición).
const COLOR_GENERO = { femenino: "#2a78d6", masculino: "#eb6834", otro: "#1baf7a", "prefiero-no-indicarlo": "#eda100" };
const ATENUADO = "#dbe2ee";
const GRAFICOS_BARRAS = [
  ["asistencia", "Asistencia"],
  ["facultad", "Citas por facultad"],
  ["carrera", "Citas por carrera"],
  ["proyecto", "Demanda de proyectos"],
  ["egreso", "Ciclo de egreso"],
];

function descargar(contenido, nombre) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "application/vnd.ms-excel" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default function Dashboard() {
  const today = useMemo(() => todayInElSalvador(), []);
  const lunes = useMemo(() => mondayOf(parseIsoDate(today)), [today]);
  const [desde, setDesde] = useState(() => isoDate(addDays(lunes, -35)));
  const [hasta, setHasta] = useState(() => isoDate(addDays(lunes, 11)));
  const [citas, setCitas] = useState(null);
  const [error, setError] = useState("");
  const [filtros, setFiltros] = useState({});
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  useEffect(() => {
    if (rangoInvalido) return undefined;
    let activo = true;
    adminApi(`/api/admin/agenda?desde=${desde}&hasta=${hasta}`).then(({ ok, data }) => {
      if (!activo) return;
      setCitas(ok ? data.citas : []);
      setError(ok ? "" : errorMessage(data));
    });
    return () => { activo = false; };
  }, [desde, hasta, rangoInvalido]);

  const todas = citas ?? [];
  const filtradas = aplicarFiltros(todas, filtros);
  const kpis = resumen(filtradas);
  const chips = Object.entries(filtros).flatMap(([dim, valores]) => valores.map((valor) => ({ dim, valor })));
  // Ctrl/⌘ + clic agrega valores; un clic simple deja solo ese valor (como en Power BI).
  const elegir = (dim) => (valor, event) => setFiltros((actual) => seleccionar(actual, dim, valor, Boolean(event?.ctrlKey || event?.metaKey)));
  // Cada gráfico se calcula con los filtros de los DEMÁS gráficos: así sigue mostrando sus otras opciones.
  const filasDe = (dim, orden) => contar(aplicarFiltros(todas, filtros, dim), dim, orden);

  const presets = [
    ["Últimas 4 semanas", isoDate(addDays(lunes, -28)), isoDate(addDays(lunes, 4))],
    ["Este mes", `${today.slice(0, 7)}-01`, isoDate(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0))],
    [`Año ${today.slice(0, 4)}`, `${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`],
    ["Todo", "", ""],
  ];
  const rangoLabel = desde || hasta
    ? `Periodo: ${desde ? formatLongDate(desde) : "inicio"} → ${hasta ? formatLongDate(hasta) : "sin límite"}`
    : "Periodo: todos los registros";
  const filtrosTexto = chips.map(({ dim, valor }) => `${DIMENSIONES[dim].titulo}: ${DIMENSIONES[dim].etiqueta(valor)}`).join(" · ");

  return (
    <main style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", padding: "24px 24px 56px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "14px 16px" }}>
        <div style={{ marginRight: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <p className="eyebrow">Inteligencia de negocios</p>
          <h1 style={{ fontSize: 26, letterSpacing: "-0.02em" }}>Reporte de citas de servicio social</h1>
          <p className="muted" style={{ fontSize: 14 }}>{rangoLabel}</p>
        </div>
        <div className="field"><label htmlFor="desde">Desde</label><input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ minHeight: 40 }} /></div>
        <div className="field"><label htmlFor="hasta">Hasta</label><input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ minHeight: 40 }} /></div>
        <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>Descargar PDF</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={filtradas.length === 0}
            onClick={() => descargar(excelXml(filtradas), `citas-servicio-social_${desde || "inicio"}_${hasta || "hoy"}${chips.length ? "_filtrado" : ""}.xls`)}
          >
            Descargar Excel
          </button>
        </div>
      </div>

      <div className="no-print" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span className="muted" style={{ fontSize: 13, marginRight: 4 }}>Rangos rápidos:</span>
        {presets.map(([label, d, h]) => (
          <button key={label} type="button" className="btn btn-ghost btn-sm" onClick={() => { setDesde(d); setHasta(h); }}>{label}</button>
        ))}
        {rangoInvalido && <span className="err" role="alert">La fecha “Desde” es posterior a “Hasta”.</span>}
        {error && <span className="err" role="alert">{error}</span>}
      </div>

      {/* Barra de filtros fija arriba mientras se recorre el tablero. */}
      <div className="panel filter-bar no-print" role="status">
        {chips.length === 0 ? (
          <span className="muted" style={{ fontSize: 13 }}>
            Haz clic en cualquier gráfico para filtrar todo el tablero · Ctrl/⌘ + clic para elegir varios · clic de nuevo para quitar.
          </span>
        ) : (
          <>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Filtrado:</span>
            {chips.map(({ dim, valor }) => (
              <button key={`${dim}-${valor}`} type="button" className="chip" onClick={() => elegir(dim)(valor, { ctrlKey: true })} aria-label={`Quitar filtro ${DIMENSIONES[dim].titulo}: ${DIMENSIONES[dim].etiqueta(valor)}`}>
                <span className="muted">{DIMENSIONES[dim].titulo}:</span> {DIMENSIONES[dim].etiqueta(valor)} <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros({})}>Limpiar filtros</button>
            <span className="muted" style={{ fontSize: 13, marginLeft: "auto" }}>{filtradas.length} de {todas.length} citas</span>
          </>
        )}
      </div>
      {chips.length > 0 && <p className="print-only" style={{ fontSize: 13 }}>Filtros aplicados: {filtrosTexto}</p>}

      <Kpis r={kpis} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16, alignItems: "start" }}>
        <GeneroDonut filas={filasDe("genero", ORDEN_GENERO)} seleccion={filtros.genero ?? []} onElegir={elegir("genero")} />
        {GRAFICOS_BARRAS.map(([dim, titulo]) => (
          <Barras
            key={dim}
            titulo={titulo}
            filas={filasDe(dim, dim === "asistencia" ? ORDEN_ASISTENCIA : null).filter((f) => f.n > 0 || (filtros[dim] ?? []).includes(f.valor))}
            seleccion={filtros[dim] ?? []}
            onElegir={elegir(dim)}
          />
        ))}
      </div>

      <Tabla citas={filtradas} filtrosTexto={filtrosTexto} />
    </main>
  );
}

function Kpis({ r }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      <div className="panel kpi"><span className="muted" style={{ fontSize: 13 }}>Citas agendadas</span><span className="kpi-n">{r.total}</span><span className="muted" style={{ fontSize: 12 }}>con los filtros actuales</span></div>
      <div className="panel kpi"><span className="muted" style={{ fontSize: 13 }}>Asistieron</span><span className="kpi-n" style={{ color: "#14532d" }}>{r.asistio}</span><span className="muted" style={{ fontSize: 12 }}>marcadas como Asistió</span></div>
      <div className="panel kpi"><span className="muted" style={{ fontSize: 13 }}>No asistieron</span><span className="kpi-n">{r.noAsistio}</span><span className="muted" style={{ fontSize: 12 }}>solo con fines estadísticos</span></div>
      <div className="panel kpi"><span className="muted" style={{ fontSize: 13 }}>Por realizar</span><span className="kpi-n">{r.porRealizar}</span><span className="muted" style={{ fontSize: 12 }}>asignadas o confirmadas</span></div>
      <div className="panel kpi" style={{ gap: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>Ratio de efectividad</span>
        <span className="kpi-n" style={{ color: "#123c8c" }}>{r.ratio === null ? "—" : `${r.ratio}%`}</span>
        <div className="bar-track" role="img" aria-label={`Efectividad ${r.ratio ?? 0} por ciento`}><div className="bar-fill" style={{ width: `${r.ratio ?? 0}%` }} /></div>
        <span className="muted" style={{ fontSize: 12 }}>{r.asistio} asistencias de {r.total} citas</span>
      </div>
    </div>
  );
}

/** Barras horizontales; cada barra es un botón que filtra el tablero. */
function Barras({ titulo, filas, seleccion, onElegir }) {
  const max = Math.max(1, ...filas.map(({ n }) => n));
  const haySeleccion = seleccion.length > 0;

  return (
    <section className={haySeleccion ? "panel chart chart-activo" : "panel chart"}>
      <h3 style={{ fontSize: 16, fontWeight: 600 }}>{titulo}</h3>
      {filas.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin datos.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 330, overflowY: "auto" }}>
        {filas.map((f) => {
          const elegido = seleccion.includes(f.valor);
          return (
            <button
              key={f.valor}
              type="button"
              className={elegido ? "bar-row bar-row-on" : "bar-row"}
              aria-pressed={elegido}
              title={`${f.etiqueta}: ${f.n} cita(s) · ${f.pct}%`}
              onClick={(event) => onElegir(f.valor, event)}
            >
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: elegido ? 700 : 400 }}>{f.etiqueta}</span>
              <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${Math.round((100 * f.n) / max)}%`, background: haySeleccion && !elegido ? ATENUADO : "#123c8c" }} /></span>
              <span className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

const R_EXT = 80;
const R_INT = 50;

function punto(r, grados) {
  const rad = ((grados - 90) * Math.PI) / 180;
  return `${80 + r * Math.cos(rad)} ${80 + r * Math.sin(rad)}`;
}

// Porción de dona entre dos ángulos; una porción de 360° se dibuja en dos mitades.
function porcion(desde, hasta) {
  if (hasta - desde >= 359.99) return `${porcion(0, 180)} ${porcion(180, 360)}`;
  const grande = hasta - desde > 180 ? 1 : 0;
  return `M ${punto(R_EXT, desde)} A ${R_EXT} ${R_EXT} 0 ${grande} 1 ${punto(R_EXT, hasta)} L ${punto(R_INT, hasta)} A ${R_INT} ${R_INT} 0 ${grande} 0 ${punto(R_INT, desde)} Z`;
}

function GeneroDonut({ filas, seleccion, onElegir }) {
  const total = filas.reduce((suma, { n }) => suma + n, 0);
  const haySeleccion = seleccion.length > 0;
  const color = (valor) => (haySeleccion && !seleccion.includes(valor) ? ATENUADO : COLOR_GENERO[valor]);
  const elegidas = filas.filter(({ valor }) => seleccion.includes(valor)).reduce((suma, { n }) => suma + n, 0);
  let acumulado = 0;

  return (
    <section className={haySeleccion ? "panel chart chart-activo" : "panel chart"}>
      <h3 style={{ fontSize: 16, fontWeight: 600 }}>Distribución por género</h3>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
        <svg viewBox="0 0 160 160" width="160" height="160" role="group" aria-label="Distribución por género" style={{ flex: "none" }}>
          {total === 0 && <circle cx="80" cy="80" r={(R_EXT + R_INT) / 2} fill="none" stroke="#edf0f5" strokeWidth={R_EXT - R_INT} />}
          {filas.filter(({ n }) => n).map((f) => {
            const desde = acumulado;
            acumulado += (360 * f.n) / total;
            return (
              <path
                key={f.valor}
                d={porcion(desde, acumulado)}
                fill={color(f.valor)}
                stroke="#fff"
                strokeWidth="2"
                className="donut-slice"
                role="button"
                tabIndex={0}
                aria-pressed={seleccion.includes(f.valor)}
                aria-label={`${f.etiqueta}: ${f.n} cita(s), ${f.pct}%`}
                onClick={(event) => onElegir(f.valor, event)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onElegir(f.valor, event); } }}
              >
                <title>{`${f.etiqueta}: ${f.n} cita(s) · ${f.pct}%`}</title>
              </path>
            );
          })}
          <text x="80" y="80" textAnchor="middle" fontSize="24" fontWeight="600" fill="#192033">{haySeleccion ? elegidas : total}</text>
          <text x="80" y="98" textAnchor="middle" fontSize="12" fill="#5b667d">{haySeleccion ? `de ${total}` : "citas"}</text>
        </svg>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 170 }}>
          {filas.map((f) => {
            const elegido = seleccion.includes(f.valor);
            return (
              <li key={f.valor}>
                <button type="button" className={elegido ? "legend-row bar-row-on" : "legend-row"} aria-pressed={elegido} onClick={(event) => onElegir(f.valor, event)}>
                  <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: color(f.valor), flex: "none" }} />
                  <span style={{ flex: 1, fontWeight: elegido ? 700 : 400 }}>{GENERO_LABEL[f.valor]}</span>
                  <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{f.n} · {f.pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Tabla({ citas, filtrosTexto }) {
  const filas = [...citas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 12px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Registros</h3>
        <span className="muted" style={{ fontSize: 13 }}>
          {filas.length} registro(s){filtrosTexto ? ` · ${filtrosTexto}` : ""} · es lo que se exporta a Excel
        </span>
      </div>
      <div style={{ overflow: "auto", maxHeight: 420, border: "1px solid #eef1f6", borderRadius: 8 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Caso</th><th>Fecha</th><th>Hora</th><th>Asistencia</th><th>Nombre completo</th><th>Carnet</th><th>Teléfono</th>
              <th>Género</th><th>Carrera</th><th>Facultad</th><th>Egreso</th><th>Proyecto</th><th>Institución</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.id}>
                <td className="mono">{c.caso}</td><td>{formatShortDate(c.fecha)}</td><td>{c.hora}</td>
                <td>{DIMENSIONES.asistencia.etiqueta(DIMENSIONES.asistencia.valor(c))}</td>
                <td>{c.nombreCompleto}</td><td className="mono">{c.carnet}</td><td className="mono">{c.telefono ?? "—"}</td>
                <td>{GENERO_LABEL[c.genero]}</td><td>{c.carrera}</td><td>{c.facultad}</td><td>{c.ciclo_egreso}</td>
                <td>{c.proyecto}</td><td>{c.institucion}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && <p className="muted" style={{ padding: 20, textAlign: "center", fontSize: 14 }}>No hay citas con estos criterios.</p>}
      </div>
    </section>
  );
}
