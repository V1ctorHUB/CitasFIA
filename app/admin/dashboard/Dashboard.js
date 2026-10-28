"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, formatLongDate, formatShortDate, isoDate, mondayOf, parseIsoDate, todayInElSalvador } from "../../../lib/agenda.mjs";
import {
  aplicarFiltros, cicloActual, contar, desglosar, diaMes, DIMENSIONES, excelXml, limites, ocupacion, ORDEN_ASISTENCIA, porCiclo, resumen, seleccionar, tendencia,
} from "../../../lib/dashboard.mjs";
import { GENDER_LABELS, GENDER_OPTIONS } from "../../../lib/registration-form.mjs";
import { adminApi, errorMessage } from "../api";

const ORDEN_GENERO = GENDER_OPTIONS.map(({ value }) => value);
// Paleta categórica validada (orden fijo: el color sigue al género, nunca a su posición).
const COLOR_GENERO = { femenino: "#2a78d6", masculino: "#eb6834", otro: "#1baf7a", "prefiero-no-indicarlo": "#eda100" };
// Mismos colores que la agenda para cada estado de asistencia.
const COLOR_ASISTENCIA = { ASISTIO: "#1f8a4c", NO_ASISTIO: "#8a93a5", POR_REALIZAR: "#123c8c" };
const ATENUADO = "#dbe2ee";
const TOP_PROYECTOS = 8;
const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
// Nombres de facultad largos: más espacio al texto y menos a la barra.
const ANCHO_NOMBRE_LARGO = "minmax(0, 2.2fr) minmax(48px, 1fr) 32px";

function descargar(contenido, nombre) {
  const url = URL.createObjectURL(new Blob([contenido], { type: "application/vnd.ms-excel" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const A4 = { ancho: 210, alto: 297, margen: 10 }; // mm

/**
 * PDF de los gráficos (sin la tabla): una imagen fiel del tablero repartida en páginas A4,
 * cortando solo entre filas de tarjetas para no partir un gráfico a la mitad.
 */
async function descargarPdf(nodo, { titulo, detalle, nombre }) {
  // Se cargan al hacer clic: no pesan en la carga normal del tablero.
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);
  const escala = 2;
  const canvas = await toCanvas(nodo, { pixelRatio: escala, backgroundColor: "#f4f7fb", cacheBust: true });
  const arriba = nodo.getBoundingClientRect().top;
  const cortes = [...nodo.querySelectorAll(":scope > *, .dash-grid > *")]
    .map((el) => Math.round((el.getBoundingClientRect().top - arriba - 8) * escala))
    .filter((y) => y > 0)
    .concat(canvas.height)
    .sort((a, b) => a - b);

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const ancho = A4.ancho - 2 * A4.margen;
  const mmPorPx = ancho / canvas.width;
  const lineas = pdf.setFontSize(9).splitTextToSize(detalle, ancho);
  const encabezado = 9 + 4 * lineas.length;

  for (let y = 0, pagina = 0; y < canvas.height; pagina += 1) {
    if (pagina > 0) pdf.addPage();
    let top = A4.margen;
    if (pagina === 0) {
      pdf.setFontSize(15).setTextColor("#192033").text(titulo, A4.margen, top + 5);
      pdf.setFontSize(9).setTextColor("#5b667d").text(lineas, A4.margen, top + 10);
      top += encabezado;
    }
    const cabe = (A4.alto - A4.margen - top) / mmPorPx;
    // El corte entre filas más bajo que quepa; si una fila sola no cabe, se corta a la altura de la página.
    const fin = cortes.filter((c) => c > y && c - y <= cabe).pop() ?? Math.min(canvas.height, y + Math.floor(cabe));
    const trozo = document.createElement("canvas");
    trozo.width = canvas.width;
    trozo.height = fin - y;
    trozo.getContext("2d").drawImage(canvas, 0, y, canvas.width, fin - y, 0, 0, canvas.width, fin - y);
    pdf.addImage(trozo.toDataURL("image/jpeg", 0.92), "JPEG", A4.margen, top, ancho, (fin - y) * mmPorPx);
    y = fin;
  }
  pdf.save(nombre);
}

export default function Dashboard() {
  const today = useMemo(() => todayInElSalvador(), []);
  const lunes = useMemo(() => mondayOf(parseIsoDate(today)), [today]);
  const [desde, setDesde] = useState(() => isoDate(addDays(lunes, -35)));
  const [hasta, setHasta] = useState(() => isoDate(addDays(lunes, 11)));
  const [citas, setCitas] = useState(null);
  const [bloqueados, setBloqueados] = useState([]);
  const [error, setError] = useState("");
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const graficosRef = useRef(null);
  const [filtros, setFiltros] = useState({});
  const rangoInvalido = Boolean(desde && hasta && desde > hasta);

  useEffect(() => {
    if (rangoInvalido) return undefined;
    let activo = true;
    adminApi(`/api/admin/agenda?desde=${desde}&hasta=${hasta}`).then(({ ok, data }) => {
      if (!activo) return;
      setCitas(ok ? data.citas : []);
      setBloqueados(ok ? data.bloqueados ?? [] : []);
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
  const sinFiltroDe = (dim) => aplicarFiltros(todas, filtros, dim);
  // Con catálogo fijo (`orden`) se muestran también los ceros; si no, solo valores con citas o elegidos.
  const filasDe = (dim, orden) => contar(sinFiltroDe(dim), dim, orden).filter((f) => orden || f.n > 0 || (filtros[dim] ?? []).includes(f.valor));
  const rango = limites(todas, desde, hasta);
  // La tendencia ignora su propio filtro (día o semana, según el largo del periodo) para seguir mostrando todo el periodo.
  const serie = tendencia(sinFiltroDe(tendencia([], rango).dim), rango);
  const ciclo = cicloActual(today);
  const facultadDe = Object.fromEntries(todas.map((c) => [c.carrera, c.facultad]));

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
  const nombreArchivo = (ext) => `citas-servicio-social_${desde || "inicio"}_${hasta || "hoy"}${chips.length ? "_filtrado" : ""}.${ext}`;

  async function exportarPdf() {
    setGenerandoPdf(true);
    try {
      await descargarPdf(graficosRef.current, {
        titulo: "Reporte de citas de servicio social",
        // Las fuentes estándar del PDF no tienen "→".
        detalle: [rangoLabel.replace("→", "a"), filtrosTexto && `Filtros: ${filtrosTexto}`, `${filtradas.length} cita(s)`].filter(Boolean).join(" · "),
        nombre: nombreArchivo("pdf"),
      });
    } catch {
      setError("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setGenerandoPdf(false);
    }
  }

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
          <button type="button" className="btn btn-secondary" disabled={generandoPdf || filtradas.length === 0} onClick={exportarPdf}>
            {generandoPdf ? "Generando PDF…" : "Descargar PDF"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={filtradas.length === 0}
            onClick={() => descargar(excelXml(filtradas), nombreArchivo("xls"))}
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

      {/* Lo que va al PDF: indicadores y gráficos, sin la tabla de registros (esa va al Excel). */}
      <div ref={graficosRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Kpis r={kpis} />

        {/* Cuadrícula de 12 columnas: cada fila se llena completa y las tarjetas de una fila miden lo mismo. */}
        <div className="dash-grid">
          <Tarjeta titulo={serie.dim === "dia" ? "Citas por día" : "Citas por semana"} activo={(filtros[serie.dim] ?? []).length > 0} lg={6} md={12}>
            <LeyendaAsistencia seleccion={filtros.asistencia ?? []} onElegir={elegir("asistencia")} />
            <Columnas
              filas={serie.filas}
              seleccion={filtros[serie.dim] ?? []}
              onElegir={elegir(serie.dim)}
              eje={(f) => (serie.dim === "dia" ? `${DIAS_CORTOS[(parseIsoDate(f.valor).getDay() + 6) % 7]} ${Number(f.valor.slice(8))}` : diaMes(f.valor))}
              vacio={rangoInvalido ? "Corrige el rango de fechas." : "Sin citas en el periodo."}
            />
          </Tarjeta>
          <Asistencia filas={filasDe("asistencia", ORDEN_ASISTENCIA)} seleccion={filtros.asistencia ?? []} onElegir={elegir("asistencia")} />
          <GeneroDonut filas={filasDe("genero", ORDEN_GENERO)} seleccion={filtros.genero ?? []} onElegir={elegir("genero")} />

          <Ocupacion
            dias={ocupacion(sinFiltroDe("diaSemana"), rango, bloqueados, "diaSemana")}
            horas={ocupacion(sinFiltroDe("hora"), rango, bloqueados, "hora")}
            filtros={filtros}
            elegir={elegir}
          />
          <Tarjeta titulo="Asistencia por carrera" nota="100% = citas de la carrera" activo={(filtros.carrera ?? []).length > 0} lg={6}>
            <LeyendaAsistencia seleccion={filtros.asistencia ?? []} onElegir={elegir("asistencia")} />
            <Proporciones filas={desglosar(sinFiltroDe("carrera"), "carrera").sort((x, y) => y.n - x.n)} seleccion={filtros.carrera ?? []} onElegir={elegir("carrera")} />
          </Tarjeta>

          <Tarjeta titulo="Ciclo de egreso" nota={`Ciclo en curso: ${ciclo}`} activo={(filtros.egreso ?? []).length > 0}>
            <LeyendaAsistencia seleccion={filtros.asistencia ?? []} onElegir={elegir("asistencia")} />
            <Columnas
              filas={desglosar(sinFiltroDe("egreso"), "egreso").sort(porCiclo)}
              seleccion={filtros.egreso ?? []}
              onElegir={elegir("egreso")}
              eje={(f) => f.valor}
              resaltado={ciclo}
              vacio="Sin datos."
            />
          </Tarjeta>
          <FacultadCarrera
            facultades={filasDe("facultad")}
            carreras={filasDe("carrera")}
            facultadDe={facultadDe}
            filtros={filtros}
            elegir={elegir}
          />
          <Proyectos filas={filasDe("proyecto")} seleccion={filtros.proyecto ?? []} onElegir={elegir("proyecto")} />
        </div>
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
    </div>
  );
}

/** Tarjeta de la cuadrícula; `lg`/`md` = columnas (de 12) que ocupa en pantallas anchas/medianas. */
function Tarjeta({ titulo, nota, activo, lg = 4, md = 6, children }) {
  return (
    <section className={activo ? "panel chart chart-activo" : "panel chart"} style={{ "--lg": lg, "--md": md }}>
      <div className="chart-head">
        <h3>{titulo}</h3>
        {nota && <span className="muted" style={{ fontSize: 12 }}>{nota}</span>}
      </div>
      {children}
    </section>
  );
}

const etiquetaAsistencia = (estado) => DIMENSIONES.asistencia.etiqueta(estado);
const detalleAsistencia = (f) => ORDEN_ASISTENCIA.map((e) => `${f[e]} ${etiquetaAsistencia(e).toLowerCase()}`).join(" · ");

/**
 * Leyenda que también filtra: todas las leyendas y la tarjeta de asistencia comparten el mismo filtro,
 * así que un clic en otra leyenda reemplaza la elección en todo el tablero (Ctrl/⌘ + clic suma).
 */
function LeyendaAsistencia({ seleccion, onElegir }) {
  const haySeleccion = seleccion.length > 0;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {ORDEN_ASISTENCIA.map((e) => {
        const elegido = seleccion.includes(e);
        return (
          <button key={e} type="button" className={elegido ? "legend-btn legend-btn-on" : "legend-btn"} aria-pressed={elegido}
            title={elegido ? "Quitar filtro" : `Filtrar: ${etiquetaAsistencia(e)}`} onClick={(event) => onElegir(e, event)}>
            <i aria-hidden="true" style={{ background: haySeleccion && !elegido ? ATENUADO : COLOR_ASISTENCIA[e] }} />{etiquetaAsistencia(e)}
          </button>
        );
      })}
    </div>
  );
}

/** Columnas apiladas por asistencia; cada columna filtra el tablero. Pasa el cursor para ver el detalle. */
function Columnas({ filas, seleccion, onElegir, eje, resaltado, vacio }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...filas.map(({ n }) => n));
  const total = filas.reduce((suma, { n }) => suma + n, 0);
  const cada = Math.ceil(filas.length / 12); // como mucho ~12 etiquetas en el eje
  const haySeleccion = seleccion.length > 0;
  if (filas.length === 0) return <p className="muted" style={{ fontSize: 13 }}>{vacio}</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
      <p className="muted" style={{ fontSize: 12, margin: 0, minHeight: 16 }} aria-live="polite">
        {hover ? `${hover.etiqueta}: ${hover.n} cita(s) · ${detalleAsistencia(hover)}` : `${total} cita(s) · máximo ${max} por columna`}
      </p>
      <div className="cols" style={{ gap: filas.length > 30 ? 2 : 6 }}>
        {filas.map((f) => {
          const elegido = seleccion.includes(f.valor);
          return (
            <button
              key={f.valor}
              type="button"
              className={elegido ? "col col-on" : "col"}
              aria-pressed={elegido}
              aria-label={`${f.etiqueta}: ${f.n} cita(s), ${detalleAsistencia(f)}`}
              onClick={(event) => onElegir(f.valor, event)}
              onMouseEnter={() => setHover(f)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(f)}
              onBlur={() => setHover(null)}
            >
              {filas.length <= 12 && <span className="col-n">{f.n || ""}</span>}
              <span className="col-stack" style={{ height: `${(100 * f.n) / max}%` }}>
                {ORDEN_ASISTENCIA.filter((e) => f[e]).map((e) => (
                  <span key={e} style={{ flex: f[e], background: haySeleccion && !elegido ? ATENUADO : COLOR_ASISTENCIA[e] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div className="cols cols-x" style={{ gap: filas.length > 30 ? 2 : 6 }} aria-hidden="true">
        {filas.map((f, i) => (
          <span key={f.valor} style={{ fontWeight: f.valor === resaltado ? 700 : 400, color: f.valor === resaltado ? "#123c8c" : undefined }}>
            {i % cada === 0 ? eje(f) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Tasa de asistencia efectiva (sobre citas ya realizadas) + reparto clicable de los tres estados. */
function Asistencia({ filas, seleccion, onElegir }) {
  const n = Object.fromEntries(filas.map((f) => [f.valor, f.n]));
  const resueltas = (n.ASISTIO ?? 0) + (n.NO_ASISTIO ?? 0);
  const tasa = resueltas ? Math.round((100 * n.ASISTIO) / resueltas) : null;
  const total = filas.reduce((suma, f) => suma + f.n, 0);
  const haySeleccion = seleccion.length > 0;
  const color = (valor) => (haySeleccion && !seleccion.includes(valor) ? ATENUADO : COLOR_ASISTENCIA[valor]);
  const circ = 2 * Math.PI * 46;

  return (
    <Tarjeta titulo="Tasa de asistencia" activo={haySeleccion} lg={3}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`Tasa de asistencia ${tasa ?? 0} por ciento`} style={{ flex: "none" }}>
          <circle cx="60" cy="60" r="46" fill="none" stroke="#edf0f5" strokeWidth="12" />
          <circle cx="60" cy="60" r="46" fill="none" stroke={COLOR_ASISTENCIA.ASISTIO} strokeWidth="12" strokeLinecap="round"
            strokeDasharray={`${(circ * (tasa ?? 0)) / 100} ${circ}`} transform="rotate(-90 60 60)" style={{ transition: "stroke-dasharray .2s ease" }} />
          <text x="60" y="62" textAnchor="middle" fontSize="24" fontWeight="600" fill="#192033">{tasa === null ? "—" : `${tasa}%`}</text>
          <text x="60" y="80" textAnchor="middle" fontSize="11" fill="#5b667d">asistencia</text>
        </svg>
        <p className="muted" style={{ fontSize: 13, margin: 0, flex: 1, minWidth: 120 }}>
          {n.ASISTIO ?? 0} de {resueltas} citas ya realizadas. Las {n.POR_REALIZAR ?? 0} por realizar no cuentan en la tasa.
        </p>
      </div>
      <div className="seg-bar" style={{ height: 14 }}>
        {filas.filter((f) => f.n).map((f) => (
          <button key={f.valor} type="button" aria-label={`${f.etiqueta}: ${f.n}`} title={`${f.etiqueta}: ${f.n} · ${f.pct}%`}
            style={{ flex: f.n, background: color(f.valor) }} onClick={(event) => onElegir(f.valor, event)} />
        ))}
        {total === 0 && <span style={{ flex: 1, background: "#edf0f5" }} />}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {filas.map((f) => {
          const elegido = seleccion.includes(f.valor);
          return (
            <li key={f.valor}>
              <button type="button" className={elegido ? "legend-row bar-row-on" : "legend-row"} aria-pressed={elegido} onClick={(event) => onElegir(f.valor, event)}>
                <i aria-hidden="true" style={{ width: 12, height: 12, borderRadius: 3, background: color(f.valor), flex: "none" }} />
                <span style={{ flex: 1, fontWeight: elegido ? 700 : 400 }}>{f.etiqueta}</span>
                <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{f.n} · {f.pct}%</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Tarjeta>
  );
}

/** Qué días y horas se piden más: citas reales por día y por hora (con su % del total), cada fila filtra el tablero. */
function Ocupacion({ dias, horas, filtros, elegir }) {
  const total = dias.reduce((suma, f) => suma + f.n, 0);
  const parte = (n) => (total ? Math.round((100 * n) / total) : 0);
  const pico = (filas) => filas.reduce((max, f) => (f.n > (max?.n ?? 0) ? f : max), null);
  const [diaPico, horaPico] = [pico(dias), pico(horas)];
  const bloque = (titulo, filas, dim) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span className="sect" style={{ padding: "0 6px 4px" }}>{titulo}</span>
      {filas.map((f) => <FilaBarra key={f.valor} f={{ ...f, parte: parte(f.n) }} max={Math.max(1, ...filas.map(({ n }) => n))} usar="ocupacion" columnas="minmax(0, 1fr) minmax(48px, 1.2fr) 64px" seleccion={filtros[dim] ?? []} onElegir={elegir(dim)} />)}
    </div>
  );

  return (
    <Tarjeta titulo="¿Qué días y horas se piden más?" nota="Citas del periodo (% del total)" activo={(filtros.diaSemana ?? []).length + (filtros.hora ?? []).length > 0} lg={6} md={12}>
      <p style={{ margin: 0, fontSize: 13 }}>
        {diaPico
          ? <>Lo más pedido: <strong>{diaPico.etiqueta}</strong> ({diaPico.n} {diaPico.n === 1 ? "cita" : "citas"}, {parte(diaPico.n)}%) y las <strong>{horaPico.etiqueta}</strong> ({horaPico.n} {horaPico.n === 1 ? "cita" : "citas"}, {parte(horaPico.n)}%).</>
          : <span className="muted">Sin citas en el periodo.</span>}
      </p>
      <div className="ocup-grid">
        {bloque("Por día", dias, "diaSemana")}
        {bloque("Por hora", horas, "hora")}
      </div>
    </Tarjeta>
  );
}

/** Barra 100% por fila (Asistió / No asistió / Por realizar), con el tamaño de la muestra al lado. */
function Proporciones({ filas, seleccion, onElegir }) {
  const haySeleccion = seleccion.length > 0;
  if (filas.length === 0) return <p className="muted" style={{ fontSize: 13 }}>Sin datos.</p>;
  return (
    <div className="chart-scroll">
      {filas.map((f) => {
        const elegido = seleccion.includes(f.valor);
        return (
          <button key={f.valor} type="button" className={elegido ? "bar-row bar-row-on" : "bar-row"} aria-pressed={elegido}
            title={`${f.etiqueta}: ${detalleAsistencia(f)}`} onClick={(event) => onElegir(f.valor, event)}
            style={{ gridTemplateColumns: "minmax(0, 1.2fr) minmax(80px, 1.4fr) 44px" }}>
            <span className="ellipsis" style={{ fontWeight: elegido ? 700 : 400 }}>{f.etiqueta}</span>
            <span className="seg-bar">
              {ORDEN_ASISTENCIA.filter((e) => f[e]).map((e) => (
                <span key={e} style={{ flex: f[e], background: haySeleccion && !elegido ? ATENUADO : COLOR_ASISTENCIA[e] }} />
              ))}
            </span>
            <span className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>n={f.n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Fila de barra horizontal que filtra el tablero. */
function FilaBarra({ f, max, seleccion, onElegir, sangria = 0, columnas, usar = "n" }) {
  const elegido = seleccion.includes(f.valor);
  const ocupacion = usar === "ocupacion";
  return (
    <button type="button" className={elegido ? "bar-row bar-row-on" : "bar-row"} aria-pressed={elegido}
      title={ocupacion ? `${f.etiqueta}: ${f.n} cita(s), ${f.parte}% del total · ${f.pct}% de los horarios disponibles ocupados` : `${f.etiqueta}: ${f.n} cita(s) · ${f.pct}%`} onClick={(event) => onElegir(f.valor, event)} style={{ paddingLeft: 6 + sangria, gridTemplateColumns: columnas }}>
      <span className="ellipsis" style={{ fontWeight: elegido ? 700 : 400 }}>{f.etiqueta}</span>
      <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${Math.round((100 * f.n) / max)}%`, background: seleccion.length && !elegido ? ATENUADO : "#123c8c" }} /></span>
      <span className="muted" style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{ocupacion ? `${f.n} (${f.parte}%)` : f.n}</span>
    </button>
  );
}

/** Facultades con sus carreras desplegables; ambos niveles filtran el tablero. */
function FacultadCarrera({ facultades, carreras, facultadDe, filtros, elegir }) {
  const [abiertas, setAbiertas] = useState({});
  const selFac = filtros.facultad ?? [];
  const selCar = filtros.carrera ?? [];
  const max = Math.max(1, ...facultades.map(({ n }) => n), ...carreras.map(({ n }) => n));
  // Por defecto se despliega la facultad con más citas y las que tengan algo elegido.
  const abierta = (fac) => abiertas[fac] ?? (fac === facultades[0]?.valor || selFac.includes(fac) || carreras.some((c) => selCar.includes(c.valor) && facultadDe[c.valor] === fac));

  return (
    <Tarjeta titulo="Facultad y carrera" nota="▸ despliega las carreras" activo={selFac.length + selCar.length > 0}>
      {facultades.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin datos.</p>}
      <div className="chart-scroll">
        {facultades.map((fac) => (
          <div key={fac.valor}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <button type="button" className="toggle" aria-expanded={abierta(fac.valor)} aria-label={`Carreras de ${fac.etiqueta}`}
                onClick={() => setAbiertas((a) => ({ ...a, [fac.valor]: !abierta(fac.valor) }))}>
                {abierta(fac.valor) ? "▾" : "▸"}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}><FilaBarra f={fac} max={max} seleccion={selFac} onElegir={elegir("facultad")} columnas={ANCHO_NOMBRE_LARGO} /></div>
            </div>
            {abierta(fac.valor) && carreras.filter((c) => facultadDe[c.valor] === fac.valor).map((c) => (
              <FilaBarra key={c.valor} f={c} max={max} seleccion={selCar} onElegir={elegir("carrera")} sangria={30} columnas={ANCHO_NOMBRE_LARGO} />
            ))}
          </div>
        ))}
      </div>
    </Tarjeta>
  );
}

/** Top 8 proyectos + "Otros"; "Otros" abre la lista completa con buscador. */
function Proyectos({ filas, seleccion, onElegir }) {
  const [todos, setTodos] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const max = Math.max(1, ...filas.map(({ n }) => n));
  const resto = filas.slice(TOP_PROYECTOS).filter((f) => !seleccion.includes(f.valor));
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const visibles = todos
    ? filas.filter((f) => f.etiqueta.toLocaleLowerCase("es").includes(texto))
    : filas.filter((f, i) => i < TOP_PROYECTOS || seleccion.includes(f.valor));

  return (
    <Tarjeta titulo="Demanda de proyectos" nota={`${filas.length} proyecto(s)`} activo={seleccion.length > 0}>
      {todos && (
        <div style={{ display: "flex", gap: 8 }}>
          <input type="search" placeholder="Buscar proyecto…" aria-label="Buscar proyecto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ minHeight: 36, fontSize: 13 }} />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTodos(false); setBusqueda(""); }}>Top {TOP_PROYECTOS}</button>
        </div>
      )}
      {filas.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Sin datos.</p>}
      <div className="chart-scroll">
        {visibles.map((f) => <FilaBarra key={f.valor} f={f} max={max} seleccion={seleccion} onElegir={onElegir} />)}
        {!todos && resto.length > 0 && (
          <button type="button" className="bar-row" onClick={() => setTodos(true)} title="Ver todos los proyectos">
            <span className="ellipsis" style={{ fontStyle: "italic" }}>Otros ({resto.length} proyectos) · ver todos</span>
            <span className="bar-track"><span className="bar-fill" style={{ display: "block", width: `${Math.min(100, Math.round((100 * resto.reduce((s, f) => s + f.n, 0)) / max))}%`, background: "#8a93a5" }} /></span>
            <span className="muted" style={{ textAlign: "right" }}>{resto.reduce((s, f) => s + f.n, 0)}</span>
          </button>
        )}
      </div>
    </Tarjeta>
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
    <Tarjeta titulo="Distribución por género" activo={haySeleccion} lg={3}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <svg viewBox="0 0 160 160" width="140" height="140" role="group" aria-label="Distribución por género" style={{ flex: "none" }}>
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
                  <span style={{ flex: 1, fontWeight: elegido ? 700 : 400 }}>{GENDER_LABELS[f.valor]}</span>
                  <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{f.n} · {f.pct}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Tarjeta>
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
                <td>{GENDER_LABELS[c.genero]}</td><td>{c.carrera}</td><td>{c.facultad}</td><td>{c.ciclo_egreso}</td>
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
