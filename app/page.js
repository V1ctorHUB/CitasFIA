"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import AutocompleteField from "./components/AutocompleteField";
import FieldError, { errorProps } from "./components/FieldError";
import {
  buildAppointmentPayload,
  CARNET_LENGTH,
  careers,
  confirmationSuccessMessage,
  createEmptyRegistration,
  DEFAULT_PROJECT,
  deriveInstitutionalEmail,
  facultyName,
  filterCareers,
  filterProjects,
  findCareerByName,
  formatCarnet,
  formatDui,
  formatGraduationCycle,
  GENDER_OPTIONS,
  getFacultyForCareer,
  GRADUATION_CYCLES,
  graduationYears,
  inicializarProyectos,
  NAME_MAX_LENGTH,
  resolveProjectOnBlur,
  submissionConfirmationDurationMs,
  validateRegistration,
} from "../lib/registration-form.mjs";

// Orden visual de los campos: el foco se lleva al primero que tenga error.
const ERROR_FOCUS_ORDER = ["nombreCompleto", "carnet", "dui", "genero", "proyecto", "carrera", "cicloEgreso"];

const FIELD_FORMATTERS = {
  carnet: formatCarnet,
  dui: formatDui,
};

const careerOptions = (query) => filterCareers(careers, query).map((career) => ({
  key: career,
  title: career,
  subtitle: facultyName,
  value: career,
}));

const projectOptions = (projects, query) => filterProjects(projects, query).map((project) => ({
  key: project.id,
  title: project.nombre,
  subtitle: project.institucion,
  value: project,
}));

export default function Home() {
  const [registration, setRegistration] = useState(createEmptyRegistration);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [projects, setProjects] = useState([DEFAULT_PROJECT]);
  const [selectedProject, setSelectedProject] = useState(DEFAULT_PROJECT);
  const [projectQuery, setProjectQuery] = useState(DEFAULT_PROJECT.nombre);
  const [careerQuery, setCareerQuery] = useState("");
  const fieldRefs = useRef({});

  const faculty = getFacultyForCareer(registration.carrera);
  const cicloEgreso = formatGraduationCycle(registration.ciclo, registration.anio);
  const correoInstitucional = deriveInstitutionalEmail(registration.carnet);

  useEffect(() => {
    if (!isSubmitted) return undefined;

    const timeoutId = window.setTimeout(() => setIsSubmitted(false), submissionConfirmationDurationMs);
    return () => window.clearTimeout(timeoutId);
  }, [isSubmitted]);

  useEffect(() => {
    let isActive = true;

    inicializarProyectos().then((loadedProjects) => {
      if (isActive) setProjects(loadedProjects);
    });

    return () => {
      isActive = false;
    };
  }, []);

  function registerField(name) {
    return (element) => {
      fieldRefs.current[name] = element;
    };
  }

  function clearErrors(...names) {
    setFieldErrors((current) => ({
      ...current,
      ...Object.fromEntries(names.map((name) => [name, ""])),
    }));
  }

  function setRegistrationValue(name, value) {
    setRegistration((current) => ({ ...current, [name]: value }));
  }

  function updateField(event) {
    const { name, value } = event.target;
    const format = FIELD_FORMATTERS[name];

    setRegistrationValue(name, format ? format(value) : value);
    clearErrors(name === "ciclo" || name === "anio" ? "cicloEgreso" : name);
    setIsSubmitted(false);
  }

  function updateProjectQuery(query) {
    setProjectQuery(query);
    setSelectedProject(null);
    clearErrors("proyecto");
    setIsSubmitted(false);
  }

  function selectProject(project) {
    setProjectQuery(project.nombre);
    setSelectedProject(project);
    clearErrors("proyecto");
  }

  function commitProject() {
    const resolved = resolveProjectOnBlur(projectQuery, selectedProject, projects);
    selectProject(resolved);
  }

  function updateCareerQuery(query) {
    setCareerQuery(query);
    setRegistrationValue("carrera", "");
    clearErrors("carrera");
    setIsSubmitted(false);
  }

  function selectCareer(career) {
    setCareerQuery(career);
    setRegistrationValue("carrera", career);
    clearErrors("carrera");
  }

  function commitCareer() {
    const match = findCareerByName(careerQuery);
    setCareerQuery(match ?? "");
    setRegistrationValue("carrera", match ?? "");
    if (match) clearErrors("carrera");
  }

  function focusFirstError(errors) {
    const firstInvalidField = ERROR_FOCUS_ORDER.find((name) => errors[name]);
    fieldRefs.current[firstInvalidField]?.focus();
  }

  function resetForm() {
    setRegistration(createEmptyRegistration());
    setFieldErrors({});
    setSelectedProject(DEFAULT_PROJECT);
    setProjectQuery(DEFAULT_PROJECT.nombre);
    setCareerQuery("");
  }

  function submitRegistration(event) {
    event.preventDefault();
    const project = selectedProject ?? DEFAULT_PROJECT;
    const { isValid, errors } = validateRegistration(registration, project, projects);

    if (!isValid) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }

    // TODO: enviar a POST /api/citas cuando exista el backend. El servidor debe
    // repetir validateRegistration y recalcular los campos derivados (ver ARCHITECTURE.md).
    buildAppointmentPayload(registration, project);

    resetForm();
    setIsSubmitted(true);
  }

  return (
    <main className="page-shell">
      <section className="registration-card" aria-labelledby="form-title">
        <header className="brand-header">
          <Image
            src="/Logo_UCA_2015.jpg"
            alt="Universidad Centroamericana José Simeón Cañas"
            width={96}
            height={131}
            priority
          />
          <div>
            <p className="eyebrow">Servicio Social</p>
            <h1 id="form-title">Registro de citas FIA</h1>
          </div>
        </header>

        {isSubmitted && (
          <p className="success-message" role="status">
            {confirmationSuccessMessage}
          </p>
        )}

        <form onSubmit={submitRegistration} className="registration-form" noValidate>
          <div className="field full-width">
            <label htmlFor="nombreCompleto">Nombre completo</label>
            <input
              ref={registerField("nombreCompleto")}
              id="nombreCompleto"
              name="nombreCompleto"
              type="text"
              autoComplete="name"
              maxLength={NAME_MAX_LENGTH}
              value={registration.nombreCompleto}
              onChange={updateField}
              placeholder="Ej.: Ana María López Martínez"
              {...errorProps("nombreCompleto", fieldErrors.nombreCompleto)}
              required
            />
            <FieldError fieldName="nombreCompleto" message={fieldErrors.nombreCompleto} />
          </div>

          <div className="compact-three-row full-width">
            <div className="field carnet-field">
              <label htmlFor="carnet">Carnet</label>
              <input
                ref={registerField("carnet")}
                id="carnet"
                name="carnet"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={CARNET_LENGTH}
                value={registration.carnet}
                onChange={updateField}
                placeholder="Ej.: 00000000"
                {...errorProps("carnet", fieldErrors.carnet, correoInstitucional ? "correo-hint" : undefined)}
                required
              />
              <FieldError fieldName="carnet" message={fieldErrors.carnet} />
              {correoInstitucional && !fieldErrors.carnet && (
                <p id="correo-hint" className="carnet-email-hint">
                  Correo institucional: <strong>{correoInstitucional}</strong>
                </p>
              )}
              <input type="hidden" name="correo_institucional" value={correoInstitucional} />
            </div>

            <div className="field">
              <label htmlFor="dui">DUI</label>
              <input
                ref={registerField("dui")}
                id="dui"
                name="dui"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                value={registration.dui}
                onChange={updateField}
                placeholder="00000000-0"
                {...errorProps("dui", fieldErrors.dui)}
                required
              />
              <FieldError fieldName="dui" message={fieldErrors.dui} />
            </div>

            <div className="field">
              <label htmlFor="genero">Género</label>
              <select
                ref={registerField("genero")}
                id="genero"
                name="genero"
                value={registration.genero}
                onChange={updateField}
                {...errorProps("genero", fieldErrors.genero)}
                required
              >
                <option value="" disabled>Selecciona una opción</option>
                {GENDER_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <FieldError fieldName="genero" message={fieldErrors.genero} />
            </div>
          </div>

          <AutocompleteField
            id="proyecto"
            label="Proyecto de horas sociales"
            query={projectQuery}
            options={projectOptions(projects, projectQuery)}
            selectedKey={selectedProject?.id}
            placeholder="Escribe para buscar un proyecto..."
            listLabel="Proyectos disponibles"
            emptyMessage="No se encontraron proyectos."
            error={fieldErrors.proyecto}
            inputRef={registerField("proyecto")}
            onQueryChange={updateProjectQuery}
            onSelect={selectProject}
            onCommit={commitProject}
          />
          <input type="hidden" name="proyecto_id" value={selectedProject?.id ?? DEFAULT_PROJECT.id} />

          <div className="field full-width">
            <label htmlFor="institucion">Institución receptora</label>
            <input
              id="institucion"
              name="institucion"
              type="text"
              value={selectedProject?.institucion ?? DEFAULT_PROJECT.institucion}
              readOnly
              tabIndex={-1}
            />
          </div>

          <AutocompleteField
            id="carrera"
            label="Carrera"
            query={careerQuery}
            options={careerOptions(careerQuery)}
            selectedKey={registration.carrera}
            placeholder="Busca o selecciona tu carrera..."
            listLabel="Carreras disponibles"
            emptyMessage="No se encontraron carreras."
            error={fieldErrors.carrera}
            inputRef={registerField("carrera")}
            onQueryChange={updateCareerQuery}
            onSelect={selectCareer}
            onCommit={commitCareer}
          />

          <div className="field full-width">
            <label htmlFor="facultad">Facultad</label>
            <input
              id="facultad"
              name="facultad"
              type="text"
              value={faculty}
              placeholder="Se completa al seleccionar una carrera"
              readOnly
              tabIndex={-1}
            />
          </div>

          <fieldset className="field full-width">
            <legend>Ciclo de egreso previsto</legend>
            <div className="egreso-select-group">
              <select
                ref={registerField("cicloEgreso")}
                id="ciclo"
                name="ciclo"
                aria-label="Ciclo de egreso"
                value={registration.ciclo}
                onChange={updateField}
                {...errorProps("cicloEgreso", fieldErrors.cicloEgreso)}
                required
              >
                <option value="" disabled>Selecciona el ciclo</option>
                {GRADUATION_CYCLES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                id="anio"
                name="anio"
                aria-label="Año de egreso"
                value={registration.anio}
                onChange={updateField}
                {...errorProps("cicloEgreso", fieldErrors.cicloEgreso)}
                required
              >
                <option value="" disabled>Selecciona el año</option>
                {graduationYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <input type="hidden" name="ciclo_egreso" value={cicloEgreso} />
            <FieldError fieldName="cicloEgreso" message={fieldErrors.cicloEgreso} />
          </fieldset>

          <button type="submit">Registrar cita</button>
        </form>
      </section>
    </main>
  );
}
