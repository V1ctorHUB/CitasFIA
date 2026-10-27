"use client";

import { useEffect, useRef, useState } from "react";
import AutocompleteField from "./AutocompleteField";
import FieldError, { errorProps } from "./FieldError";
import {
  CARNET_LENGTH,
  careers,
  createEmptyRegistration,
  DEFAULT_PROJECT,
  deriveInstitutionalEmail,
  filterCareers,
  filterProjects,
  findCareerByName,
  formatCarnet,
  formatDui,
  formatGraduationCycle,
  formatPhone,
  GENDER_OPTIONS,
  getFacultyForCareer,
  GRADUATION_CYCLES,
  graduationYears,
  inicializarProyectos,
  NAME_MAX_LENGTH,
  resolveProjectOnBlur,
  submissionErrorMessage,
  validateRegistration,
} from "../../lib/registration-form.mjs";

// Orden visual de los campos: el foco se lleva al primero que tenga error.
const ERROR_FOCUS_ORDER = ["nombreCompleto", "telefono", "carnet", "dui", "genero", "proyecto", "carrera", "cicloEgreso"];

const FIELD_FORMATTERS = {
  carnet: formatCarnet,
  dui: formatDui,
  telefono: formatPhone,
};

const careerOptions = (query) => filterCareers(careers, query).map((career) => ({
  key: career,
  title: career,
  subtitle: getFacultyForCareer(career),
  value: career,
}));

const projectOptions = (projects, query) => filterProjects(projects, query).map((project) => ({
  key: project.id,
  title: project.nombre,
  subtitle: project.institucion,
  value: project,
}));

/**
 * Formulario de datos del estudiante: lo usan el formulario público y la cita manual de coordinación.
 * `onSubmit(registration, project)` envía al servidor y devuelve el resultado de enviarSolicitud;
 * los errores de campos ajenos al formulario (p. ej. fecha/hora) los muestra el padre en `children`.
 */
export default function RegistrationForm({ onSubmit, onEdit, submitLabel = "Registrar cita", children }) {
  const [registration, setRegistration] = useState(createEmptyRegistration);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [projects, setProjects] = useState([DEFAULT_PROJECT]);
  const [selectedProject, setSelectedProject] = useState(DEFAULT_PROJECT);
  const [projectQuery, setProjectQuery] = useState(DEFAULT_PROJECT.nombre);
  const [careerQuery, setCareerQuery] = useState("");
  const fieldRefs = useRef({});

  const faculty = getFacultyForCareer(registration.carrera);
  const cicloEgreso = formatGraduationCycle(registration.ciclo, registration.anio);
  const correoInstitucional = deriveInstitutionalEmail(registration.carnet);

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
    onEdit?.();
  }

  function updateProjectQuery(query) {
    setProjectQuery(query);
    setSelectedProject(null);
    clearErrors("proyecto");
    onEdit?.();
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
    onEdit?.();
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

  async function submitRegistration(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const project = selectedProject ?? DEFAULT_PROJECT;
    const { isValid, errors } = validateRegistration(registration, project, projects);
    setSubmitError("");

    if (!isValid) {
      setFieldErrors(errors);
      focusFirstError(errors);
      return;
    }

    setIsSubmitting(true);
    const result = await onSubmit(registration, project);
    setIsSubmitting(false);

    if (result.status === "invalid") {
      const hasFieldError = Object.values(result.errors).some(Boolean);
      setFieldErrors(result.errors);
      focusFirstError(result.errors);
      if (!hasFieldError) setSubmitError(submissionErrorMessage);
      return;
    }
    if (result.status === "rejected") {
      setSubmitError(result.message);
      return;
    }

    resetForm();
  }

  return (
    <form onSubmit={submitRegistration} className="registration-form" noValidate>
      <div className="name-phone-row full-width">
        <div className="field">
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

        <div className="field">
          <label htmlFor="telefono">Teléfono</label>
          <input
            ref={registerField("telefono")}
            id="telefono"
            name="telefono"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={9}
            value={registration.telefono}
            onChange={updateField}
            placeholder="Ej.: 7000-0000"
            {...errorProps("telefono", fieldErrors.telefono)}
            required
          />
          <FieldError fieldName="telefono" message={fieldErrors.telefono} />
        </div>
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

      {children}

      {submitError && (
        <p className="submit-error" role="alert">{submitError}</p>
      )}

      <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Enviando..." : submitLabel}
      </button>
    </form>
  );
}
