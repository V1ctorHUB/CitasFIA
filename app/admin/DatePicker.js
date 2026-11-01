"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { addDays, DIAS, esDiaHabil, formatLongDate, formatShortDate, isoDate, MESES, mondayOf, parseIsoDate, semanasHabiles, todayInElSalvador } from "../../lib/agenda.mjs";
import { adminApi } from "./api";
import { IconoCalendario, IconoChevron } from "./icons";

const DIAS_CORTOS = DIAS.slice(0, 5).map((d) => d.slice(0, 3));
const mesDe = (iso) => iso.slice(0, 7);
const moverMes = (mes, delta) => isoDate(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1 + delta, 1)).slice(0, 7);

// Día hábil más cercano en la dirección indicada (+1 adelante, -1 atrás).
function habilDesde(iso, paso) {
  let d = parseIsoDate(iso);
  while (!esDiaHabil(isoDate(d))) d = addDays(d, paso);
  return isoDate(d);
}

/**
 * Selector de fecha del panel: solo días hábiles, sin fechas anteriores a `min`
 * y, con `conBloqueados`, sin los días desactivados en la agenda.
 */
export default function DatePicker({ id, value, onChange, min, conBloqueados = false, compacto = false, opcional = false, placeholder = "Elige un día", className, "aria-describedby": describedBy, ...props }) {
  const hoy = useMemo(() => todayInElSalvador(), []);
  const [abierto, setAbierto] = useState(false);
  const [lado, setLado] = useState("");
  const [mes, setMes] = useState(mesDe(value || hoy));
  const [foco, setFoco] = useState("");
  const [bloqueados, setBloqueados] = useState([]);
  const raiz = useRef(null);
  const boton = useRef(null);
  const rejilla = useRef(null);
  const panelId = useId();

  const semanas = semanasHabiles(mes);
  const inactivo = (iso) => Boolean(min && iso < min) || bloqueados.includes(iso);

  function abrir() {
    const inicio = value && esDiaHabil(value) ? value : habilDesde(min && min > hoy ? min : hoy, 1);
    setMes(mesDe(inicio));
    setFoco(inicio);
    // Sin espacio debajo (p. ej. al pie de un diálogo) abre hacia arriba; pegado al borde derecho, se alinea a la derecha.
    const caja = boton.current.getBoundingClientRect();
    setLado([
      window.innerHeight - caja.bottom < 380 && caja.top > 380 && "fecha-panel-arriba",
      window.innerWidth - caja.left < 320 && "fecha-panel-derecha",
    ].filter(Boolean).join(" "));
    setAbierto(true);
  }

  function cerrar(devolverFoco = true) {
    setAbierto(false);
    if (devolverFoco) boton.current?.focus();
  }

  function elegir(iso) {
    if (inactivo(iso)) return;
    onChange(iso);
    cerrar();
  }

  function mover(iso) {
    setFoco(iso);
    if (!semanas.flat().includes(iso)) setMes(mesDe(iso));
  }

  function teclas(event, iso) {
    const pasos = {
      ArrowRight: () => habilDesde(isoDate(addDays(parseIsoDate(iso), 1)), 1),
      ArrowLeft: () => habilDesde(isoDate(addDays(parseIsoDate(iso), -1)), -1),
      ArrowDown: () => isoDate(addDays(parseIsoDate(iso), 7)),
      ArrowUp: () => isoDate(addDays(parseIsoDate(iso), -7)),
      Home: () => isoDate(mondayOf(parseIsoDate(iso))),
      End: () => isoDate(addDays(mondayOf(parseIsoDate(iso)), 4)),
      PageDown: () => habilDesde(`${moverMes(mesDe(iso), 1)}-${iso.slice(8)}`.replace(/-(29|30|31)$/, "-28"), 1),
      PageUp: () => habilDesde(`${moverMes(mesDe(iso), -1)}-${iso.slice(8)}`.replace(/-(29|30|31)$/, "-28"), 1),
    };
    if (pasos[event.key]) {
      event.preventDefault();
      mover(pasos[event.key]());
    }
  }

  // El foco sigue al día activo del teclado.
  useEffect(() => {
    if (abierto && foco) rejilla.current?.querySelector(`[data-iso="${foco}"]`)?.focus();
  }, [abierto, foco, mes]);

  // Clic fuera del selector lo cierra sin robar el foco.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (event) => { if (!raiz.current?.contains(event.target)) cerrar(false); };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  // Días desactivados del mes visible.
  useEffect(() => {
    if (!abierto || !conBloqueados) return undefined;
    let activo = true;
    const dias = semanasHabiles(mes).flat();
    adminApi(`/api/admin/agenda?desde=${dias[0]}&hasta=${dias.at(-1)}`).then(({ ok, data }) => {
      if (activo && ok) setBloqueados(data.bloqueados);
    });
    return () => { activo = false; };
  }, [abierto, conBloqueados, mes]);

  const texto = value ? (compacto ? formatShortDate(value) : formatLongDate(value)) : placeholder;
  const tituloMes = `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`;
  const hoyElegible = esDiaHabil(hoy) && !inactivo(hoy);

  return (
    <div className="fecha" ref={raiz}>
      <button
        ref={boton}
        id={id}
        type="button"
        className={["fecha-trigger", compacto && "fecha-trigger-sm", className].filter(Boolean).join(" ")}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? panelId : undefined}
        aria-describedby={[`${id}-valor`, describedBy].filter(Boolean).join(" ")}
        onClick={() => (abierto ? cerrar() : abrir())}
        {...props}
      >
        <span id={`${id}-valor`} className={value ? "ellipsis" : "ellipsis fecha-placeholder"}>{texto}</span>
        <IconoCalendario />
      </button>

      {abierto && (
        <div id={panelId} className={`fecha-panel ${lado}`} role="dialog" aria-label="Elegir fecha" // Escape se detiene aquí para no cerrar también el diálogo que contiene al selector.
          onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cerrar(); } }}>
          <div className="fecha-head">
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>
              <IconoChevron direccion="izquierda" />
            </button>
            <h4 className="fecha-mes" aria-live="polite">{tituloMes}</h4>
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}>
              <IconoChevron direccion="derecha" />
            </button>
          </div>

          <div className="fecha-grid" role="grid" aria-label={tituloMes} ref={rejilla}>
            <div role="row" className="fecha-fila">
              {DIAS_CORTOS.map((d) => <span key={d} role="columnheader" className="fecha-dow">{d}</span>)}
            </div>
            {semanas.map((semana) => (
              <div key={semana[0]} role="row" className="fecha-fila">
                {semana.map((iso) => {
                  const desactivado = bloqueados.includes(iso);
                  const clases = [
                    "fecha-dia",
                    mesDe(iso) !== mes && "fecha-fuera",
                    iso === hoy && "fecha-hoy",
                    iso === value && "fecha-sel",
                    desactivado && "fecha-bloq",
                  ].filter(Boolean).join(" ");
                  return (
                    <span key={iso} role="gridcell" aria-selected={iso === value}>
                      <button
                        type="button"
                        data-iso={iso}
                        className={clases}
                        tabIndex={iso === foco ? 0 : -1}
                        aria-label={`${formatLongDate(iso)}${desactivado ? " · día desactivado" : ""}`}
                        aria-current={iso === hoy ? "date" : undefined}
                        aria-disabled={inactivo(iso) || undefined}
                        onClick={() => elegir(iso)}
                        onKeyDown={(event) => teclas(event, iso)}
                      >
                        {Number(iso.slice(8))}
                      </button>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="fecha-pie">
            <span>Solo días hábiles</span>
            <span style={{ display: "flex", gap: 4 }}>
              {opcional && value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { onChange(""); cerrar(); }}>Quitar</button>}
              {hoyElegible && <button type="button" className="btn btn-ghost btn-sm" onClick={() => elegir(hoy)}>Hoy</button>}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
