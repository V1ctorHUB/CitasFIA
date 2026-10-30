"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { CONFIRMAR_ELIMINAR, MODALIDADES, ORIGENES, PROJECT_COLUMNS, rowsToProjects, validateProject } from "../../../lib/projects.mjs";
import { normalizeSearchText } from "../../../lib/registration-form.mjs";
import { adminApi, errorMessage } from "../api";
import { CloseButton, Modal } from "../Modal";
import { IconoDescargar, IconoMas } from "../icons";

const BUSCABLES = ["nombre", "institucion", "responsable", "responsable_correo", "perfil", "horario", "ubicacion", "tipo_servicio"];

// "Asesoría General UCA" (id 0) es el valor por defecto del formulario: no lleva datos de proyecto.
const esPorDefecto = (p) => p.id === 0;
// Le falta alguno de los datos de la hoja (proyectos creados antes del formato actual).
const estaIncompleto = (p) => !esPorDefecto(p) && PROJECT_COLUMNS.some(({ campo }) => !p[campo]);

const contar = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

function resultadoTexto({ creados, existentes }) {
  const partes = [contar(creados, "proyecto agregado", "proyectos agregados")];
  if (existentes.length) partes.push(`${contar(existentes.length, "ya existía", "ya existían")}: ${existentes.join(", ")}`);
  const aviso = creados ? ` ${creados === 1 ? "Ya aparece" : "Ya aparecen"} en el formulario.` : "";
  return `${partes.join(" · ")}.${aviso}`;
}

// Columnas que se pueden ordenar y cómo se comparan.
const ORDENES = {
  nombre: (a, b) => a.nombre.localeCompare(b.nombre, "es"),
  citas: (a, b) => a.citas - b.citas,
  activo: (a, b) => Number(b.activo) - Number(a.activo),
};

export default function ProyectosView() {
  const [proyectos, setProyectos] = useState(null);
  const [modo, setModo] = useState(null); // "manual" | "excel" | null
  const [detalle, setDetalle] = useState(null);
  const [edicion, setEdicion] = useState(null);
  const [mensaje, setMensaje] = useState("");
  const [errorCarga, setErrorCarga] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [orden, setOrden] = useState({ campo: "", dir: 1 });

  const cargar = useCallback(async () => {
    setErrorCarga("");
    const { ok, data } = await adminApi("/api/admin/proyectos");
    if (ok) setProyectos(data.proyectos);
    else setErrorCarga(errorMessage(data));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(lista, { uno = false, cerrar = true } = {}) {
    const { ok, data } = await adminApi("/api/admin/proyectos", { method: "POST", body: { proyectos: lista } });
    if (!ok) return { ok, error: errorMessage(data), errors: data.errors };
    // Alta manual de un proyecto que ya existe: no se creó nada, así que el diálogo sigue abierto para corregirlo.
    if (uno && data.creados === 0) {
      return { ok: false, errors: { nombre: "Ya existe un proyecto con este nombre en esta contraparte." } };
    }
    setMensaje(resultadoTexto(data));
    if (cerrar) setModo(null);
    await cargar();
    return { ok };
  }

  async function actualizar(proyecto, datos) {
    const { ok, data } = await adminApi(`/api/admin/proyectos/${proyecto.id}`, { method: "POST", body: datos });
    if (!ok) return { ok, error: errorMessage(data), errors: data.errors };
    setMensaje(`Cambios guardados en «${datos.nombre}».`);
    cerrarEdicion();
    await cargar();
    return { ok };
  }

  // La edición se abre desde el detalle (que ya se cerró): al terminar, el foco vuelve a la fila del proyecto.
  const volverAFila = useRef(null);
  function cerrarEdicion() {
    volverAFila.current = edicion?.id ?? null;
    setEdicion(null);
  }
  useEffect(() => {
    if (edicion || volverAFila.current === null) return;
    document.querySelector(`.fila-toggle[data-proyecto="${volverAFila.current}"]`)?.focus();
    volverAFila.current = null;
  }, [edicion, proyectos]);

  async function cambiarActivo(proyecto, activo) {
    const { ok, data } = await adminApi(`/api/admin/proyectos/${proyecto.id}`, { method: "PATCH", body: { activo } });
    if (!ok) return { ok, error: errorMessage(data) };
    setDetalle({ ...proyecto, activo });
    setMensaje(activo ? `«${proyecto.nombre}» vuelve a aparecer en el formulario.` : `«${proyecto.nombre}» ya no aparece en el formulario.`);
    await cargar();
    return { ok };
  }

  async function eliminar(proyecto) {
    const { ok, data } = await adminApi(`/api/admin/proyectos/${proyecto.id}`, { method: "DELETE", body: { confirmar: CONFIRMAR_ELIMINAR } });
    if (!ok) return { ok, error: errorMessage(data) };
    const partes = [contar(data.citas, "cita", "citas"), contar(data.estudiantes, "estudiante", "estudiantes")];
    setMensaje(`Se eliminó «${proyecto.nombre}» junto con ${partes.join(" y ")}.`);
    setDetalle(null);
    await cargar();
    return { ok };
  }

  const consulta = normalizeSearchText(busqueda).trim();
  const visibles = (proyectos ?? []).filter((p) => (
    (!estado || (estado === "incompletos" ? estaIncompleto(p) : p.activo === (estado === "activos")))
    && (!consulta || BUSCABLES.some((campo) => normalizeSearchText(p[campo] ?? "").includes(consulta)))
  ));
  if (orden.campo) visibles.sort((a, b) => ORDENES[orden.campo](a, b) * orden.dir);

  const ordenarPor = (campo) => setOrden(orden.campo === campo ? { campo, dir: -orden.dir } : { campo, dir: 1 });
  const encabezado = (campo, texto, style) => (
    <th style={style} aria-sort={orden.campo === campo ? (orden.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" className="th-sort" onClick={() => ordenarPor(campo)}>
        {texto}
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" style={{ opacity: orden.campo === campo ? 1 : 0.45, transform: orden.campo === campo && orden.dir === -1 ? "rotate(180deg)" : undefined }}>
          {/* Sin ordenar: doble flecha neutra; ordenada: una sola flecha en su sentido. */}
          <path d={orden.campo === campo ? "M2 6.5 5 3.5l3 3" : "M2.5 4 5 1.5 7.5 4M2.5 6 5 8.5 7.5 6"} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  );

  // Valores ya usados, para sugerirlos al escribir (sin obligar a elegir uno).
  const usados = (campo) => [...new Set((proyectos ?? []).map((p) => p[campo]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  const sugerencias = { institucion: usados("institucion"), responsable: usados("responsable") };
  const correos = Object.fromEntries((proyectos ?? []).filter((p) => p.responsable_correo).map((p) => [p.responsable, p.responsable_correo]));
  const incompletos = (proyectos ?? []).filter(estaIncompleto).length;

  return (
    <main style={{ flex: 1, width: "100%", maxWidth: 1440, margin: "0 auto", padding: "24px 24px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ marginRight: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ fontSize: 30 }}>Proyectos de horas sociales</h1>
          <p className="muted" style={{ fontSize: 14 }}>Los proyectos activos aparecen en el buscador del formulario público.</p>
        </div>
        <div className="acciones-encabezado">
          <button type="button" className="btn btn-primary" aria-expanded={modo === "excel"} onClick={() => { setModo(modo === "excel" ? null : "excel"); setMensaje(""); }}>
            Importar desde Excel
          </button>
          <button type="button" className="btn btn-secondary" aria-haspopup="dialog" onClick={() => { setModo("manual"); setMensaje(""); }}>
            <IconoMas /> Agregar proyecto
          </button>
        </div>
      </div>

      {mensaje && <p className="success-message" role="status" style={{ margin: 0 }}>{mensaje}</p>}
      {modo === "manual" && <ProyectoManual sugerencias={sugerencias} correos={correos} onGuardar={(datos, { seguir }) => guardar([datos], { uno: true, cerrar: !seguir })} onCancelar={() => setModo(null)} />}
      {modo === "excel" && <ImportarExcel onGuardar={guardar} onCancelar={() => setModo(null)} />}
      {detalle && <DetalleProyecto proyecto={detalle} onClose={() => setDetalle(null)} onEditar={() => { setEdicion(detalle); setDetalle(null); setMensaje(""); }} onEliminar={eliminar} onCambiarActivo={cambiarActivo} />}
      {edicion && <ProyectoManual inicial={edicion} sugerencias={sugerencias} correos={correos} onGuardar={(datos) => actualizar(edicion, datos)} onCancelar={cerrarEdicion} />}

      <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 12px" }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginRight: "auto" }}>
            Proyectos {proyectos && <span className="muted">{visibles.length === proyectos.length ? `(${proyectos.length})` : `(${visibles.length} de ${proyectos.length})`}</span>}
          </h2>
          <div style={{ display: "flex", gap: 8, flex: "0 1 420px", minWidth: "min(100%, 280px)" }}>
            <input type="search" aria-label="Buscar proyecto" placeholder="Buscar proyecto, contraparte o responsable…" value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)} style={{ minHeight: 36, fontSize: 13, flex: 1, minWidth: 0 }} />
            <select aria-label="Filtrar por estado" value={estado} onChange={(e) => setEstado(e.target.value)} style={{ minHeight: 36, fontSize: 13, width: "auto" }}>
              <option value="">Todos</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="incompletos">Incompletos</option>
            </select>
          </div>
        </div>
        {incompletos > 0 && estado !== "incompletos" && (
          <div className="aviso-incompletos" role="status">
            <p style={{ marginRight: "auto" }}>
              <strong>{contar(incompletos, "proyecto con datos incompletos", "proyectos con datos incompletos")}.</strong>
              {" "}Se crearon antes del formato actual: falta parte de su ficha (perfil, horario, responsable…).
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEstado("incompletos")}>Ver incompletos</button>
          </div>
        )}
        {errorCarga && (
          <p className="err" role="alert">
            No se pudo cargar la lista de proyectos. {errorCarga}{" "}
            <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={cargar}>Reintentar</button>
          </p>
        )}
        <div style={{ overflow: "auto", maxHeight: "min(70vh, 760px)", border: "1px solid #eef1f6", borderRadius: 8 }}>
          <table className="tbl tbl-proyectos">
            <caption className="sr-only">Proyectos de horas sociales. Activa el nombre de un proyecto para ver todos sus datos.</caption>
            <thead>
              <tr>
                {encabezado("nombre", "Proyecto", { width: "46%" })}
                <th className="col-opcional">Tipo de servicio</th>
                <th className="col-opcional">Responsable UCA</th>
                {encabezado("citas", "Citas", { textAlign: "right" })}
                {encabezado("activo", "Estado")}
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr key={p.id}>
                  <td className="col-proyecto">
                    <button type="button" className="fila-toggle" data-proyecto={p.id} aria-haspopup="dialog" onClick={() => setDetalle(p)}><span className="clamp-2">{p.nombre}</span></button>
                    <span className="muted clamp-2 clamp-1" style={{ fontSize: 12 }}>{p.institucion}</span>
                  </td>
                  {esPorDefecto(p)
                    ? <td colSpan={2} className="muted col-opcional">Proyecto por defecto</td>
                    : <>
                      <td className="col-opcional" style={{ minWidth: 150 }}>{p.tipo_servicio}</td>
                      <td className="col-opcional" style={{ minWidth: 140 }}>{p.responsable}</td>
                    </>}
                  <td style={{ textAlign: "right" }}>{p.citas}</td>
                  <td>
                    <span className="estado-celda">
                      <span className={p.activo ? "badge" : "badge badge-off"}>{p.activo ? "Activo" : "Inactivo"}</span>
                      {estaIncompleto(p) && <span className="badge badge-aviso">Faltan datos</span>}
                    </span>
                  </td>
                </tr>
              ))}
              {proyectos && visibles.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 24, textAlign: "center" }}>
                    <span className="muted">{proyectos.length ? "Ningún proyecto coincide con la búsqueda." : "Todavía no hay proyectos."}</span>{" "}
                    {proyectos.length > 0 && <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={() => { setBusqueda(""); setEstado(""); }}>Quitar filtros</button>}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {proyectos === null && !errorCarga && <p className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando…</p>}
        </div>
      </section>
    </main>
  );
}

const DATOS_DETALLE = [
  ["tipo_servicio", "Tipo de servicio"],
  ["perfil", "Perfil del estudiante"],
  ["horario", "Horario y días"],
  ["ubicacion", "Ubicación"],
];

function DetalleProyecto({ proyecto: p, onClose, onEditar, onEliminar, onCambiarActivo }) {
  const porDefecto = esPorDefecto(p);
  const incompleto = estaIncompleto(p);
  const sinRegistrar = <span className="muted">Sin registrar</span>;
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEstado, setConfirmarEstado] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [errorEstado, setErrorEstado] = useState("");
  const cancelarEstadoRef = useRef(null);

  // Al pedir confirmación, el foco va a Cancelar: aceptar exige un paso deliberado.
  useEffect(() => { if (confirmarEstado) cancelarEstadoRef.current?.focus(); }, [confirmarEstado]);

  async function alternarActivo() {
    setCambiando(true);
    setErrorEstado("");
    const result = await onCambiarActivo(p, !p.activo);
    setCambiando(false);
    if (result.ok) setConfirmarEstado(false);
    else setErrorEstado(result.error);
  }

  // La confirmación se muestra dentro del mismo diálogo: el foco vuelve a la fila al cerrar.
  return (
    <Modal labelledBy={eliminando ? "eliminar-titulo" : "detalle-titulo"} maxWidth={eliminando ? 560 : 640} onClose={onClose}>
      {eliminando ? <EliminarProyecto proyecto={p} onVolver={() => setEliminando(false)} onClose={onClose} onEliminar={onEliminar} /> : (
      <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <h3 id="detalle-titulo" style={{ fontSize: 22, overflowWrap: "anywhere" }}>{p.nombre}</h3>
          <p className="muted" style={{ fontSize: 14 }}>
            {p.institucion} · <span className={p.activo ? "badge" : "badge badge-off"}>{p.activo ? "Activo" : "Inactivo"}</span>
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      {incompleto && <p className="aviso-incompletos">Le faltan datos: se creó antes del formato actual. Edítalo para completarlos.</p>}
      {porDefecto && <p className="muted" style={{ fontSize: 14 }}>Proyecto por defecto: lo eligen los estudiantes que todavía no tienen proyecto, así que no lleva datos de contraparte ni horario.</p>}
      <dl className="dl dl-proyecto">
        {!porDefecto && DATOS_DETALLE.map(([campo, texto]) => (
          <div key={campo} style={{ display: "contents" }}>
            <dt>{texto}</dt>
            <dd style={{ whiteSpace: "pre-line" }}>{p[campo] ?? sinRegistrar}</dd>
          </div>
        ))}
        {!porDefecto && <>
          <dt>Responsable UCA</dt>
          <dd>
            {p.responsable ?? sinRegistrar}
            {p.responsable_correo && <> · <a href={`mailto:${p.responsable_correo}`}>{p.responsable_correo}</a></>}
          </dd>
        </>}
        <dt>Citas registradas</dt>
        <dd>{p.citas}</dd>
        <dt>En el formulario</dt>
        <dd>{p.activo ? "Visible: los estudiantes pueden elegirlo." : "Oculto: los estudiantes no lo ven."}</dd>
      </dl>
      {confirmarEstado ? (
        <div className="aviso-incompletos" role="alert">
          <p style={{ flex: "1 1 260px" }}>
            {p.activo
              ? <><strong>¿Ocultar este proyecto del formulario?</strong> Los estudiantes dejarán de verlo. Sus citas y datos no cambian.</>
              : <><strong>¿Mostrar este proyecto en el formulario?</strong> Los estudiantes podrán elegirlo de nuevo.</>}
          </p>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button ref={cancelarEstadoRef} type="button" className="btn btn-ghost" disabled={cambiando} onClick={() => { setConfirmarEstado(false); setErrorEstado(""); }}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={cambiando} onClick={alternarActivo}>{cambiando ? "Guardando…" : "Aceptar"}</button>
          </div>
          {errorEstado && <p className="err" style={{ width: "100%" }}>{errorEstado}</p>}
        </div>
      ) : (
        <div className="form-actions" style={{ alignItems: "center" }}>
          {porDefecto
            ? <p className="muted" style={{ fontSize: 13, marginRight: "auto" }}>Es el proyecto por defecto del formulario: no se edita, no se oculta ni se elimina.</p>
            : <button type="button" className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setEliminando(true)}>Eliminar proyecto</button>}
          {!porDefecto && (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirmarEstado(true)}>
              {p.activo ? "Ocultar del formulario" : "Mostrar en el formulario"}
            </button>
          )}
          {!porDefecto && <button type="button" className="btn btn-primary" onClick={onEditar}>Editar proyecto</button>}
        </div>
      )}
      </>
      )}
    </Modal>
  );
}

/** Confirmación de borrado definitivo: dice exactamente qué se pierde y pide escribir la palabra de confirmación. */
function EliminarProyecto({ proyecto: p, onVolver, onClose, onEliminar }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const confirmado = texto.trim().toUpperCase() === CONFIRMAR_ELIMINAR;

  async function eliminar(event) {
    event.preventDefault();
    if (!confirmado) return;
    setEnviando(true);
    const result = await onEliminar(p);
    setEnviando(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <h3 id="eliminar-titulo" style={{ flex: 1, fontSize: 22, overflowWrap: "anywhere" }}>¿Eliminar «{p.nombre}»?</h3>
        <CloseButton onClick={onClose} />
      </div>
      <form noValidate onSubmit={eliminar} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="aviso-peligro" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <p><strong>Se borra para siempre de la base de datos, junto con todo lo relacionado:</strong></p>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 2 }}>
            <li>El proyecto y todos sus datos.</li>
            <li>{contar(p.citas, "cita registrada", "citas registradas")}, con su historial y sus correos.</li>
            <li>Los estudiantes que solo tenían citas en este proyecto.</li>
            <li>La contraparte «{p.institucion}», si no le quedan otros proyectos.</li>
          </ul>
          <p>No se puede deshacer. Solo queda un registro de quién lo eliminó y cuándo.</p>
        </div>
        <p className="muted" style={{ fontSize: 14 }}>Si solo quieres que deje de aparecer en el formulario, desactívalo desde «Editar proyecto».</p>
        <div className="field">
          <label htmlFor="eliminar-confirmar">Escribe {CONFIRMAR_ELIMINAR} para confirmar</label>
          <input id="eliminar-confirmar" autoFocus value={texto} onChange={(e) => { setTexto(e.target.value); setError(""); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
        </div>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onVolver}>Cancelar</button>
          <button type="submit" className="btn btn-danger-solid" disabled={!confirmado || enviando}>{enviando ? "Eliminando…" : "Eliminar para siempre"}</button>
        </div>
      </form>
    </>
  );
}

const VACIO = { ...Object.fromEntries(PROJECT_COLUMNS.map(({ campo }) => [campo, ""])), responsable_correo: "" };
const COLUMNA = Object.fromEntries(PROJECT_COLUMNS.map((col) => [col.campo, col]));
// Lo escrito se guarda en la pestaña: cerrar el diálogo por accidente o que venza la sesión no lo borra.
const BORRADOR = "admin-proyecto-borrador";

function leerBorrador() {
  try {
    const guardado = JSON.parse(sessionStorage.getItem(BORRADOR) ?? "null");
    if (!guardado || typeof guardado !== "object") return null;
    const datos = Object.fromEntries(Object.keys(VACIO).map((k) => [k, typeof guardado[k] === "string" ? guardado[k] : ""]));
    return Object.values(datos).some(Boolean) ? datos : null;
  } catch {
    return null;
  }
}

function guardarBorrador(datos) {
  try {
    if (Object.values(datos).some((v) => v.trim())) sessionStorage.setItem(BORRADOR, JSON.stringify(datos));
    else sessionStorage.removeItem(BORRADOR);
  } catch {
    // Sin almacenamiento (modo privado o bloqueado): el formulario funciona igual, solo no recupera.
  }
}

// Orden de lectura del diálogo; también decide a qué campo va el foco cuando hay errores.
const ORDEN = ["institucion", "nombre", "tipo_servicio", "perfil", "horario", "ubicacion", "responsable", "responsable_correo"];

// Proyecto de la base → valores del formulario (los campos que un proyecto antiguo no tiene quedan vacíos).
const aFormulario = (p) => ({ ...Object.fromEntries(Object.keys(VACIO).map((k) => [k, p[k] ?? ""])), activo: p.activo });

/** Alta (sin `inicial`) o edición (con `inicial`, el proyecto de la base) de un proyecto. */
function ProyectoManual({ inicial, sugerencias, correos, onGuardar, onCancelar }) {
  const editando = Boolean(inicial);
  const [original] = useState(() => (editando ? aFormulario(inicial) : null));
  const [datos, setDatos] = useState(() => original ?? leerBorrador() ?? VACIO);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const seguirEditandoRef = useRef(null);
  const [recuperado, setRecuperado] = useState(() => !editando && datos !== VACIO);
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Enter envía con el botón principal; "Guardar y agregar otro" solo con su propio clic.
  const seguirRef = useRef(false);

  // El alta guarda borrador en la pestaña; la edición, en cambio, pide confirmar antes de descartar cambios.
  useEffect(() => { if (!editando) guardarBorrador(datos); }, [datos, editando]);
  const sinGuardar = editando && Object.keys(original).some((k) => original[k] !== datos[k]);

  // Esc, la X, Cancelar y el clic fuera del diálogo pasan por aquí.
  function intentarCerrar() {
    if (sinGuardar) setConfirmarSalida(true);
    else onCancelar();
  }

  useEffect(() => { if (confirmarSalida) seguirEditandoRef.current?.focus(); }, [confirmarSalida]);
  // Al abrir, el cursor va directo al primer campo (corre después de que el diálogo toma el foco).
  useEffect(() => { document.getElementById(`proyecto-${ORDEN[0]}`)?.focus(); }, []);

  function empezarDeNuevo() {
    setDatos(VACIO);
    setErrores({});
    setError("");
    setRecuperado(false);
    document.getElementById(`proyecto-${ORDEN[0]}`)?.focus();
  }

  // Lleva el foco (y la vista) al primer campo con error, en el orden en que se lee el diálogo.
  const enfocarError = (fieldErrors) => {
    const primero = ORDEN.find((nombre) => fieldErrors[nombre]);
    if (primero) document.getElementById(`proyecto-${primero}`)?.focus();
  };

  async function enviar(event) {
    event.preventDefault();
    // "Guardar y agregar otro" deja el diálogo abierto con la contraparte, el tipo y el responsable ya puestos.
    const seguir = seguirRef.current;
    seguirRef.current = false;
    const fieldErrors = validateProject(datos);
    setErrores(fieldErrors);
    setAviso("");
    if (Object.keys(fieldErrors).length) return enfocarError(fieldErrors);

    setEnviando(true);
    const result = await onGuardar(datos, { seguir });
    setEnviando(false);
    if (result.ok && seguir) {
      const { institucion, tipo_servicio, responsable, responsable_correo } = datos;
      setDatos({ ...VACIO, institucion, tipo_servicio, responsable, responsable_correo });
      setRecuperado(false);
      setAviso(`«${datos.nombre}» guardado. Escribe el siguiente proyecto.`);
      document.getElementById("proyecto-nombre")?.focus();
      return;
    }
    if (result.ok) return editando || guardarBorrador(VACIO);
    setError(result.error ?? "");
    setErrores(result.errors ?? {});
    enfocarError(result.errors ?? {});
  }

  // El tipo de servicio se elige en dos pasos (origen y modalidad) y se guarda como uno de TIPOS_SERVICIO.
  const [origen = "", modalidad = ""] = datos.tipo_servicio ? datos.tipo_servicio.split(" - ") : [];
  const fijarTipo = (o, m) => {
    setDatos({ ...datos, tipo_servicio: o ? (m ? `${o} - ${m}` : o) : "" });
    setErrores({ ...errores, tipo_servicio: "" });
    setError("");
  };
  const selectorTipo = () => {
    const errorTipo = errores.tipo_servicio;
    const describedBy = errorTipo ? "proyecto-tipo_servicio-error" : undefined;
    return (
      <>
        <div className="field">
          <label htmlFor="proyecto-tipo_servicio">Tipo de servicio</label>
          <select id="proyecto-tipo_servicio" value={origen} onChange={(e) => fijarTipo(e.target.value, modalidad)}
            aria-invalid={Boolean(errorTipo)} aria-describedby={describedBy} className={errorTipo ? "input-error" : undefined}>
            <option value="">Elige una opción</option>
            {ORIGENES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {errorTipo && <p id="proyecto-tipo_servicio-error" className="field-error">{errorTipo}</p>}
        </div>
        <div className="field">
          <label htmlFor="proyecto-modalidad">Modalidad</label>
          <select id="proyecto-modalidad" value={modalidad} disabled={!origen} onChange={(e) => fijarTipo(origen, e.target.value)}>
            <option value="">Sin definir</option>
            {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </>
    );
  };

  const cambiar = (campo) => (event) => {
    const value = event.target.value;
    const siguiente = { ...datos, [campo]: value };
    // Al elegir un responsable conocido se completa su correo, si aún está vacío.
    if (campo === "responsable" && !datos.responsable_correo && correos[value]) siguiente.responsable_correo = correos[value];
    setDatos(siguiente);
    setErrores({ ...errores, [campo]: "" });
    setError("");
  };

  // Sin placeholders: un texto dentro de la caja se lee como un valor ya escrito. La pista va fuera, bajo la etiqueta.
  const campo = (nombre, { label, type = "text", pista, max, ancho, filas } = {}) => {
    const col = COLUMNA[nombre];
    const id = `proyecto-${nombre}`;
    const describedBy = [pista && `${id}-pista`, errores[nombre] && `${id}-error`].filter(Boolean).join(" ");
    const props = {
      id, value: datos[nombre], onChange: cambiar(nombre), maxLength: max ?? col?.max,
      "aria-invalid": Boolean(errores[nombre]), "aria-describedby": describedBy || undefined,
      className: errores[nombre] ? "input-error" : undefined,
    };
    return (
      <div className="field" style={ancho ? { gridColumn: "1 / -1" } : undefined}>
        <label htmlFor={id}>{label ?? col.titulo}</label>
        {pista && <p id={`${id}-pista`} className="field-hint">{pista}</p>}
        {filas
          ? <textarea {...props} rows={filas} />
          : <input {...props} type={type} autoComplete="off" list={sugerencias[nombre] ? `${id}-lista` : undefined} />}
        {sugerencias[nombre] && <datalist id={`${id}-lista`}>{sugerencias[nombre].map((v) => <option key={v} value={v} />)}</datalist>}
        {errores[nombre] && <p id={`${id}-error`} className="field-error">{errores[nombre]}</p>}
      </div>
    );
  };

  return (
    <Modal labelledBy="proyecto-titulo" maxWidth={760} onClose={intentarCerrar}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h3 id="proyecto-titulo" style={{ fontSize: 22 }}>{editando ? "Editar proyecto" : "Nuevo proyecto"}</h3>
          <p className="muted" style={{ fontSize: 14 }}>
            {editando ? "Las citas ya registradas conservan los datos con que se pidieron." : "Aparece en el buscador del formulario público."}
            {" "}Todos los campos son obligatorios, salvo el correo.
          </p>
          {recuperado && (
            <p className="field-hint" role="status" style={{ marginTop: 6 }}>
              Recuperamos lo que habías escrito. <button type="button" className="linkbtn" style={{ fontSize: 13 }} onClick={empezarDeNuevo}>Empezar de nuevo</button>
            </p>
          )}
        </div>
        <CloseButton onClick={intentarCerrar} />
      </div>

      <form noValidate onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <fieldset className="form-grupo tinte">
          <legend className="sect">Proyecto</legend>
          {campo("institucion", { ancho: true, label: "Contraparte", pista: editando
            ? "Institución receptora. Si la cambias por una que no existe, se crea una nueva."
            : "Institución receptora. Si no existe, se crea." })}
          {campo("nombre", { ancho: true })}
          {selectorTipo()}
        </fieldset>

        <fieldset className="form-grupo">
          <legend className="sect">Estudiantes y horario</legend>
          {campo("perfil", { ancho: true, filas: 2, label: "Perfil del estudiante", pista: "Carreras, año mínimo y conocimientos que se piden." })}
          {campo("horario", { filas: 3, label: "Horario y días", pista: "Días, horas o carga semanal." })}
          {campo("ubicacion", { filas: 3, pista: "Dirección, o «Consultar con coordinador» si aún no se define." })}
        </fieldset>

        <fieldset className="form-grupo">
          <legend className="sect">Responsable UCA</legend>
          {campo("responsable", { label: "Nombre" })}
          {campo("responsable_correo", { label: "Correo (opcional)", type: "email", max: 200 })}
        </fieldset>

        {editando && (
          <label className="check-activo">
            <input type="checkbox" checked={datos.activo} onChange={(e) => setDatos({ ...datos, activo: e.target.checked })} />
            <span><strong>Activo</strong> · aparece en el buscador del formulario público.</span>
          </label>
        )}
        {aviso && <p className="success-message" role="status" style={{ margin: 0 }}>{aviso}</p>}
        {error && <p className="err" role="alert">{error}</p>}
        {confirmarSalida ? (
          <div className="aviso-peligro" role="alert">
            <p style={{ marginRight: "auto" }}><strong>Tienes cambios sin guardar.</strong> Si cierras, se pierden.</p>
            <button ref={seguirEditandoRef} type="button" className="btn btn-secondary" onClick={() => setConfirmarSalida(false)}>Seguir editando</button>
            <button type="button" className="btn btn-danger" onClick={onCancelar}>Descartar cambios</button>
          </div>
        ) : (
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={intentarCerrar}>Cancelar</button>
          {!editando && (
            <button type="button" className="btn btn-secondary" disabled={enviando}
              onClick={(e) => { seguirRef.current = true; e.currentTarget.form.requestSubmit(); }}>Guardar y agregar otro</button>
          )}
          <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? "Guardando…" : editando ? "Guardar cambios" : "Guardar proyecto"}</button>
        </div>
        )}
      </form>
    </Modal>
  );
}

function ImportarExcel({ onGuardar, onCancelar }) {
  const [archivo, setArchivo] = useState("");
  const [lectura, setLectura] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [arrastrando, setArrastrando] = useState(false);

  // Mientras el panel está abierto, soltar un archivo fuera de la zona no hace que el navegador lo abra.
  useEffect(() => {
    const evitar = (event) => event.preventDefault();
    window.addEventListener("dragover", evitar);
    window.addEventListener("drop", evitar);
    return () => {
      window.removeEventListener("dragover", evitar);
      window.removeEventListener("drop", evitar);
    };
  }, []);

  function leer(event) {
    const file = event.target.files?.[0];
    // Se vacía el selector para que volver a elegir el mismo archivo (ya corregido) lo lea de nuevo.
    event.target.value = "";
    leerArchivo(file);
  }

  function soltar(event) {
    event.preventDefault();
    setArrastrando(false);
    leerArchivo(event.dataTransfer.files?.[0]);
  }

  async function leerArchivo(file) {
    setLectura(null);
    setError("");
    if (!file) return;
    setArchivo(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setError("Ese archivo no es un Excel (.xlsx). Guárdalo como .xlsx e inténtalo de nuevo.");
      return;
    }
    try {
      setLectura(rowsToProjects(await readSheet(file)));
    } catch {
      setError("No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo de nuevo.");
    }
  }

  async function importar() {
    setEnviando(true);
    const result = await onGuardar(lectura.proyectos.map(({ fila, ...proyecto }) => proyecto));
    setEnviando(false);
    if (!result.ok) setError(result.error);
  }

  const listo = lectura && lectura.errores.length === 0 && lectura.proyectos.length > 0;
  // Al abrir el panel, el foco (y la vista) van a su título, no se quedan en el botón de la cabecera.
  const tituloRef = useRef(null);
  useEffect(() => { tituloRef.current?.focus(); }, []);

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 ref={tituloRef} tabIndex={-1} style={{ fontSize: 16, fontWeight: 600 }}>Importar proyectos desde Excel</h2>
      <ol className="pasos">
        <li className="paso">
          <span className="paso-n" aria-hidden="true">1</span>
          <h3 className="paso-titulo">Descarga la plantilla</h3>
          <div className="paso-cuerpo">
            <p className="muted">Llena una fila por proyecto en la primera hoja. La hoja «Ejemplo» muestra cómo hacerlo; en Responsable puede ir el nombre y el correo en la misma celda.</p>
            <a className="btn btn-secondary" href="/api/admin/proyectos/plantilla" download="plantilla-proyectos.xlsx"><IconoDescargar /> Descargar plantilla .xlsx</a>
          </div>
        </li>
        <li className="paso">
          <span className="paso-n" aria-hidden="true">2</span>
          <h3 className="paso-titulo">Arrastra o elige el archivo lleno</h3>
          <div className="paso-cuerpo">
            <div
              className={arrastrando ? "zona-archivo arrastrando" : "zona-archivo"}
              onDragEnter={(e) => { e.preventDefault(); setArrastrando(true); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setArrastrando(false); }}
              onDrop={soltar}
            >
              <p>{arrastrando ? "Suelta el archivo aquí" : <>Arrastra aquí el archivo <strong>.xlsx</strong>, o</>}</p>
              <input id="archivo-excel" className="sr-only file-input" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={leer} />
              <label htmlFor="archivo-excel" className="btn btn-secondary">{archivo ? "Elegir otro archivo" : "Elegir archivo .xlsx"}</label>
              <span className={archivo ? undefined : "muted"} style={{ fontSize: 14, overflowWrap: "anywhere" }}>{archivo || "Ningún archivo elegido"}</span>
            </div>
          </div>
        </li>
        <li className="paso">
          <span className="paso-n" aria-hidden="true">3</span>
          <h3 className="paso-titulo">Revisa e importa</h3>
          <div className="paso-cuerpo">
            {!lectura && <p className="muted">Antes de guardar verás cada proyecto leído y los errores por fila. Si una fila tiene un error no se importa nada: corrígela y vuelve a elegir el archivo.</p>}
            {lectura && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p style={{ fontSize: 14 }} role="status">
                  {lectura.proyectos.length + lectura.errores.length === 0
                    ? "El archivo no tiene proyectos en la primera hoja."
                    : <>{contar(lectura.proyectos.length, "proyecto listo", "proyectos listos")}{lectura.errores.length > 0 && <>, <span className="err">{contar(lectura.errores.length, "fila con error", "filas con error")}</span></>}.</>}
                </p>
                {lectura.errores.length > 0 && (
                  <ul className="err" role="alert" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                    {lectura.errores.slice(0, 20).map(({ fila, mensaje }) => <li key={`${fila}-${mensaje}`}>{fila ? `Fila ${fila}: ` : ""}{mensaje}</li>)}
                    {lectura.errores.length > 20 && <li>…y {lectura.errores.length - 20} más.</li>}
                  </ul>
                )}
                {lectura.proyectos.length > 0 && (
                  <div style={{ overflow: "auto", maxHeight: 280, border: "1px solid #eef1f6", borderRadius: 8 }}>
                    <table className="tbl">
                      <thead><tr><th>Fila</th>{PROJECT_COLUMNS.map(({ campo, titulo }) => <th key={campo}>{titulo}</th>)}</tr></thead>
                      <tbody>
                        {lectura.proyectos.map((p) => (
                          <tr key={p.fila}>
                            <td className="mono">{p.fila}</td>
                            {PROJECT_COLUMNS.map(({ campo }) => (
                              <td key={campo} style={{ whiteSpace: "normal", minWidth: 140, verticalAlign: "top" }}>
                                {p[campo]}{campo === "responsable" && p.responsable_correo && <><br /><span className="muted">{p.responsable_correo}</span></>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </li>
      </ol>

      {error && <p className="err" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!listo || enviando} onClick={importar}>
          {!lectura ? "Elige un archivo"
            : lectura.errores.length ? "Corrige las filas con error"
              : enviando ? "Importando…" : `Importar ${contar(lectura.proyectos.length, "proyecto", "proyectos")}`}
        </button>
      </div>
    </section>
  );
}
