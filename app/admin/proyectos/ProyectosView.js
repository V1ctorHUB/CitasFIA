"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import { PROJECT_TEXT_MAX, rowsToProjects, validateProject } from "../../../lib/projects.mjs";
import { adminApi, errorMessage } from "../api";
import { IconoMas } from "../icons";

function resultadoTexto({ creados, existentes }) {
  const partes = [`${creados} proyecto(s) agregado(s)`];
  if (existentes.length) partes.push(`${existentes.length} ya existía(n): ${existentes.join(", ")}`);
  return `${partes.join(" · ")}. Ya aparecen en el formulario (puede tardar hasta un minuto).`;
}

export default function ProyectosView() {
  const [proyectos, setProyectos] = useState(null);
  const [modo, setModo] = useState(null); // "manual" | "excel" | null
  const [mensaje, setMensaje] = useState("");

  const cargar = useCallback(async () => {
    const { ok, data } = await adminApi("/api/admin/proyectos");
    setProyectos(ok ? data.proyectos : []);
    if (!ok) setMensaje(errorMessage(data));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(lista) {
    const { ok, data } = await adminApi("/api/admin/proyectos", { method: "POST", body: { proyectos: lista } });
    if (!ok) return { ok, error: errorMessage(data), errors: data.errors };
    setMensaje(resultadoTexto(data));
    setModo(null);
    await cargar();
    return { ok };
  }

  const instituciones = [...new Set((proyectos ?? []).map(({ institucion }) => institucion))].sort((a, b) => a.localeCompare(b, "es"));

  return (
    <main style={{ flex: 1, width: "100%", maxWidth: 1100, margin: "0 auto", padding: "24px 24px 56px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 12 }}>
        <div style={{ marginRight: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ fontSize: 30 }}>Proyectos de horas sociales</h1>
          <p className="muted" style={{ fontSize: 14 }}>Los proyectos activos aparecen en el buscador del formulario público.</p>
        </div>
        <button type="button" className={modo === "manual" ? "btn btn-secondary" : "btn btn-primary"} aria-expanded={modo === "manual"} onClick={() => { setModo(modo === "manual" ? null : "manual"); setMensaje(""); }}>
          <IconoMas /> Agregar proyecto
        </button>
        <button type="button" className="btn btn-secondary" aria-expanded={modo === "excel"} onClick={() => { setModo(modo === "excel" ? null : "excel"); setMensaje(""); }}>
          Importar desde Excel
        </button>
      </div>

      {mensaje && <p className="success-message" role="status" style={{ margin: 0 }}>{mensaje}</p>}
      {modo === "manual" && <ProyectoManual instituciones={instituciones} onGuardar={guardar} onCancelar={() => setModo(null)} />}
      {modo === "excel" && <ImportarExcel onGuardar={guardar} onCancelar={() => setModo(null)} />}

      <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Proyectos en la base {proyectos && <span className="muted">({proyectos.length})</span>}</h2>
        <div style={{ overflow: "auto", maxHeight: 520, border: "1px solid #eef1f6", borderRadius: 8 }}>
          <table className="tbl">
            <thead><tr><th>ID</th><th>Proyecto</th><th>Institución receptora</th><th>Citas</th><th>Estado</th></tr></thead>
            <tbody>
              {(proyectos ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.id}</td>
                  <td style={{ whiteSpace: "normal" }}>{p.nombre}</td>
                  <td style={{ whiteSpace: "normal" }}>{p.institucion}</td>
                  <td>{p.citas}</td>
                  <td className={p.activo ? undefined : "muted"}>{p.activo ? "Activo" : "Inactivo"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proyectos === null && <p className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando…</p>}
        </div>
      </section>
    </main>
  );
}

function ProyectoManual({ instituciones, onGuardar, onCancelar }) {
  const [datos, setDatos] = useState({ nombre: "", institucion: "" });
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nombreRef = useRef(null);

  useEffect(() => { nombreRef.current?.focus(); }, []);

  async function enviar(event) {
    event.preventDefault();
    const fieldErrors = validateProject(datos);
    setErrores(fieldErrors);
    if (Object.keys(fieldErrors).length) return;

    setEnviando(true);
    const result = await onGuardar([datos]);
    setEnviando(false);
    if (!result.ok) { setError(result.error); setErrores(result.errors ?? {}); }
  }

  const cambiar = (campo) => (event) => {
    setDatos({ ...datos, [campo]: event.target.value });
    setErrores({ ...errores, [campo]: "" });
    setError("");
  };

  return (
    <form className="panel" noValidate onSubmit={enviar} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>Agregar proyecto</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 14 }}>
        <div className="field">
          <label htmlFor="proyecto-nombre">Nombre del proyecto</label>
          <input ref={nombreRef} id="proyecto-nombre" value={datos.nombre} onChange={cambiar("nombre")} maxLength={PROJECT_TEXT_MAX} autoComplete="off"
            aria-invalid={Boolean(errores.nombre)} className={errores.nombre ? "input-error" : undefined} />
          {errores.nombre && <p className="field-error" role="alert">{errores.nombre}</p>}
        </div>
        <div className="field">
          <label htmlFor="proyecto-institucion">Institución receptora</label>
          <input id="proyecto-institucion" list="instituciones" value={datos.institucion} onChange={cambiar("institucion")} maxLength={PROJECT_TEXT_MAX} autoComplete="off"
            aria-invalid={Boolean(errores.institucion)} className={errores.institucion ? "input-error" : undefined} />
          <datalist id="instituciones">{instituciones.map((nombre) => <option key={nombre} value={nombre} />)}</datalist>
          {errores.institucion && <p className="field-error" role="alert">{errores.institucion}</p>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Si la institución no existe se crea. Un proyecto con el mismo nombre (sin importar mayúsculas ni tildes) no se duplica.</p>
      {error && <p className="err" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? "Guardando…" : "Guardar proyecto"}</button>
      </div>
    </form>
  );
}

function ImportarExcel({ onGuardar, onCancelar }) {
  const [archivo, setArchivo] = useState("");
  const [lectura, setLectura] = useState(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function leer(event) {
    const file = event.target.files?.[0];
    setLectura(null);
    setError("");
    if (!file) return;
    setArchivo(file.name);
    try {
      setLectura(rowsToProjects(await readSheet(file)));
    } catch {
      setError("No se pudo leer el archivo. Guárdalo como Excel (.xlsx) e inténtalo de nuevo.");
    }
  }

  async function importar() {
    setEnviando(true);
    const result = await onGuardar(lectura.proyectos.map(({ nombre, institucion }) => ({ nombre, institucion })));
    setEnviando(false);
    if (!result.ok) setError(result.error);
  }

  const listo = lectura && lectura.errores.length === 0 && lectura.proyectos.length > 0;

  return (
    <section className="panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600 }}>Importar proyectos desde Excel</h2>
      <div className="muted" style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <p>Usa un archivo <strong>.xlsx</strong> con una fila por proyecto y estas dos columnas (la primera hoja del libro):</p>
        <table className="tbl" style={{ width: "auto" }}>
          <thead><tr><th>Proyecto</th><th>Institución</th></tr></thead>
          <tbody>
            <tr><td>Huertos escolares</td><td>Alcaldía de Soyapango</td></tr>
            <tr><td>Censo comunitario</td><td>FUSADES</td></tr>
          </tbody>
        </table>
        <p>Si no hay encabezado se usan las columnas A y B. Se revisa todo antes de guardar: si una fila tiene un error no se importa nada.</p>
      </div>

      <div className="field">
        <label htmlFor="archivo-excel">Archivo</label>
        <input id="archivo-excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={leer} />
      </div>

      {lectura && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 14 }}>
            <strong>{archivo}</strong>: {lectura.proyectos.length} proyecto(s) listos
            {lectura.errores.length > 0 && <>, <span className="err">{lectura.errores.length} fila(s) con error</span></>}.
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
                <thead><tr><th>Fila</th><th>Proyecto</th><th>Institución</th></tr></thead>
                <tbody>
                  {lectura.proyectos.map((p) => <tr key={p.fila}><td className="mono">{p.fila}</td><td>{p.nombre}</td><td>{p.institucion}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && <p className="err" role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="btn btn-primary" disabled={!listo || enviando} onClick={importar}>
          {enviando ? "Importando…" : `Importar ${lectura?.proyectos.length ?? 0} proyecto(s)`}
        </button>
      </div>
    </section>
  );
}
