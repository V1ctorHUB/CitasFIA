"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, formatLongDate, formatShortDate, isoDate, mondayOf, parseIsoDate, todayInElSalvador } from "../../../lib/agenda.mjs";
import { alternarFiltro, aplicarFiltros, contar, DIMENSIONES, excelXml, resumen } from "../../../lib/dashboard.mjs";
import { GENDER_OPTIONS } from "../../../lib/registration-form.mjs";
import { adminApi, errorMessage, GENERO_LABEL } from "../api";

const ORDEN_GENERO = GENDER_OPTIONS.map(({ value }) => value);
const ORDEN_ASISTENCIA = ["ASISTIO", "NO_ASISTIO", "POR_REALIZAR"];
// Paleta categórica validada (orden fijo: el color sigue al género, nunca a su posición).
const COLOR_GENERO = { femenino: "#2a78d6", masculino: "#eb6834", otro: "#1baf7a", "prefiero-no-indicarlo": "#eda100" };
const ATENUADO = "#dbe2ee";
const DIMS_INTERACTIVAS = ["genero", "asistencia", "facultad", "carrera", "proyecto", "egreso"];

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
  const general = resumen(todas);
  const filtrado = resumen(filtradas);
  const chips = Object.entries(filtros).flatMap(([dim, valores]) => valores.map((valor) => ({ dim, valor })));
  const alternar = (dim) => (valor) => setFiltros((actual) => alternarFiltro(actual, dim, valor));
  // Cada gráfico interactivo se calcula con los filtros de las demás dimensiones.
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

  return (
    <main style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", padding: "24px 24px 56px", display: "flex", flexDirection: "column", gap: 20 }}>
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

      {/* ─── Resumen general: todo el periodo, sin filtros ─── */}
      <section aria-labelledby="general-titulo" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 id="general-titulo" style={{ fontSize: 18, fontWeight: 600 }}>Resumen general del periodo</h2>
          <p className="muted" style={{ fontSize: 13 }}>Todas las citas de las fechas seleccionadas. No cambia al aplicar filtros.</p>
        </div>
        <Kpis r={general} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, alignItems: "start" }}>
          <GeneroDonut titulo="Género" filas={contar(todas, "genero", ORDEN_GENERO)} total={todas.length} />
          <Barras titulo="Facultad" filas={contar(todas, "facultad")} />
          <Barras titulo="Asistencia" filas={contar(todas, "asistencia", ORDEN_ASISTENCIA)} />
        </div>
      </section>

      {/* ─── Análisis interactivo: filtros cruzados ─── */}
      <section aria-labelledby="interactivo-titulo" style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8, borderTop: "1px solid #dbe2ee" }}>
        <div>
          <h2 id="interactivo-titulo" style={{ fontSize: 18, fontWeight: 600 }}>Análisis interactivo</h2>
          <p className="muted" style={{ fontSize: 13 }}>Haz clic en cualquier barra o categoría para filtrar todo el tablero. Vuelve a hacer clic para quitar el filtro.</p>
        </div>

        <div className="no-print" role="status" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 32 }}>
          {chips.length === 0 ? (
            <span className="muted" style={{ fontSize: 13 }}>Sin filtros: se muestran las {todas.length} citas del periodo.</span>
          ) : (
            <>
              <span className="muted" style={{ fontSize: 13 }}>Filtros:</span>
              {chips.map(({ dim, valor }) => (
                <button key={`${dim}-${valor}`} type="button" className="btn btn-secondary btn-sm" onClick={() => alternar(dim)(valor)} aria-label={`Quitar filtro ${DIMENSIONES[dim].titulo}: ${DIMENSIONES[dim].etiqueta(valor)}`}>
                  <span className="muted">{DIMENSIONES[dim].titulo}:</span> {DIMENSIONES[dim].etiqueta(valor)} <span aria-hidden="true">×</span>
                </button>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiltros({})}>Limpiar filtros</button>
            </>
          )}
        </div>
        {/* Para el PDF: los chips no se imprimen, los filtros sí deben constar. */}
        {chips.length > 0 && (
          <p className="print-only" style={{ fontSize: 13 }}>
            Filtros aplicados: {chips.map(({ dim, valor }) => `${DIMENSIONES[dim].titulo}: ${DIMENSIONES[dim].etiqueta(valor)}`).join(" · ")}
          </p>
        )}

        <Kpis r={filtrado} base={chips.length ? general.total : null} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 16, alignItems: "start" }}>
          {DIMS_INTERACTIVAS.map((dim) => (dim === "genero" ? (
            <GeneroDonut
              key={dim}
              titulo="Distribución por género"
              filas={filasDe("genero", ORDEN_GENERO)}
              total={aplicarFiltros(todas, filtros, "genero").length}
              seleccion={filtros.genero ?? []}
              onToggle={alternar("genero")}
            />
          ) : (
            <Barras
              key={dim}
              titulo={DIMENSIONES[dim].titulo === "Proyecto" ? "Demanda de proyectos" : `Citas por ${DIMENSIONES[dim].titulo.toLowerCase()}`}
              filas={filasDe(dim, dim === "asistencia" ? ORDEN_ASISTENCIA : null).filter((f) => f.n > 0 || (filtros[dim] ?? []).includes(f.valor))}
              seleccion={filtros[dim] ?? []}
              onToggle={alternar(dim)}
            />
          )))}
        </div>

        <Tabla citas={filtradas} />
      </section>
    </main>
  );
}

function Kpis({ r, base = null }) {
  const de = base === null ? "en el periodo" : `de ${base} del periodo`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      <div className="panel kpi"><span className="muted" style={{ fontSize: 13 }}>Citas agendadas</span><span className="kpi-n">{r.total}</span><span className="muted" style={{ fontSize: 12 }}>{de}</span></div>
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

/** Lista de barras horizontales. Con `onToggle` cada fila es un botón que filtra el tablero. */
function Barras({ titulo, filas, seleccion = [], onToggle }) {
  const max = Math.max(1, ...filas.map(({ n }) => n));
  const haySeleccion = seleccion.length > 0;

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{titulo}</h3>
      {filas.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin datos.</p>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 330, overflowY: "auto" }}>
        {filas.map((f) => {
          const elegido = seleccion.includes(f.valor);
          const contenido = (
            <>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: elegido ? 700 : 400 }}>{f.etiqueta}</span>
              <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${Math.round((100 * f.n) / max)}%`, background: haySeleccion && !elegido ? ATENUADO : "#123c8c" }} /></span>
              <span className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{f.n}</span>
            </>
          );
          const estilo = { display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(64px, 1fr) 32px", alignItems: "center", gap: 10, fontSize: 13, padding: "6px 6px", borderRadius: 6 };
          return onToggle ? (
            <button
              key={f.valor}
              type="button"
              className="bar-row"
              aria-pressed={elegido}
              title={`${f.etiqueta}: ${f.n} cita(s) · ${f.pct}%`}
              onClick={() => onToggle(f.valor)}
              style={{ ...estilo, border: 0, background: elegido ? "#edf3ff" : "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}
            >
              {contenido}
            </button>
          ) : (
            <div key={f.valor} title={`${f.etiqueta}: ${f.n} cita(s) · ${f.pct}%`} style={estilo}>{contenido}</div>
          );
        })}
      </div>
    </section>
  );
}

function GeneroDonut({ titulo, filas, total, seleccion = [], onToggle }) {
  const haySeleccion = seleccion.length > 0;
  const color = (valor) => (haySeleccion && !seleccion.includes(valor) ? ATENUADO : COLOR_GENERO[valor]);
  let acumulado = 0;
  const tramos = filas.filter(({ n }) => n).map(({ valor, n }) => {
    const inicio = acumulado;
    acumulado += (360 * n) / total;
    return `${color(valor)} ${inicio}deg ${acumulado}deg`;
  });

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600 }}>{titulo}</h3>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
        <div
          role="img"
          aria-label={`Distribución por género: ${filas.map((f) => `${f.etiqueta} ${f.n}`).join(", ")}`}
          style={{ width: 160, height: 160, borderRadius: "50%", background: tramos.length ? `conic-gradient(${tramos.join(", ")})` : "#edf0f5", position: "relative", flex: "none" }}
        >
          <div style={{ position: "absolute", inset: 32, borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 24, fontWeight: 600 }}>{total}</span><span className="muted" style={{ fontSize: 12 }}>citas</span>
          </div>
        </div>
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 170 }}>
          {filas.map((f) => {
            const elegido = seleccion.includes(f.valor);
            const contenido = (
              <>
                <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: color(f.valor), flex: "none" }} />
                <span style={{ flex: 1, fontWeight: elegido ? 700 : 400 }}>{GENERO_LABEL[f.valor]}</span>
                <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{f.n} · {f.pct}%</span>
              </>
            );
            const estilo = { display: "flex", alignItems: "center", gap: 10, fontSize: 14, width: "100%", padding: "6px 8px", borderRadius: 6 };
            return (
              <li key={f.valor}>
                {onToggle ? (
                  <button type="button" aria-pressed={elegido} onClick={() => onToggle(f.valor)} style={{ ...estilo, border: 0, background: elegido ? "#edf3ff" : "transparent", font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
                    {contenido}
                  </button>
                ) : <div style={estilo}>{contenido}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Tabla({ citas }) {
  const filas = [...citas].sort((a, b) => `${a.fecha}${a.hora}`.localeCompare(`${b.fecha}${b.hora}`));

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 12px" }}>
        <h3 style={{ fontSize: 16, fontWeight: 600 }}>Registros</h3>
        <span className="muted" style={{ fontSize: 13 }}>{filas.length} registro(s) · lo que se exporta a Excel</span>
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
