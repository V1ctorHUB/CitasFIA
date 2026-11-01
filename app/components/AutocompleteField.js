"use client";

import { useState } from "react";
import FieldError, { errorProps } from "./FieldError";

/**
 * Campo de búsqueda con lista de sugerencias.
 *
 * `options` es una lista ya filtrada de `{ key, title, subtitle, value }`.
 * `onCommit` se invoca al salir del campo para que el padre resuelva el valor final.
 */
export default function AutocompleteField({
  id,
  label,
  query,
  options,
  selectedKey,
  placeholder,
  listLabel,
  emptyMessage,
  error,
  inputRef,
  onQueryChange,
  onSelect,
  onCommit,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = `${id}-lista`;
  const showList = isOpen && (options.length > 0 || query.trim() !== "");
  const activeOption = showList ? options[Math.min(activeIndex, options.length - 1)] : undefined;

  function handleChange(event) {
    onQueryChange(event.target.value);
    setIsOpen(true);
    setActiveIndex(0);
  }

  function choose(option) {
    onSelect(option.value);
    setIsOpen(false);
  }

  function handleSelect(event, option) {
    // preventDefault mantiene el foco en el input y evita que el blur se adelante a la selección.
    event.preventDefault();
    choose(option);
  }

  function handleBlur() {
    setIsOpen(false);
    onCommit();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") setIsOpen(false);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!options.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const current = Math.min(activeIndex, options.length - 1);
      setActiveIndex(isOpen ? (current + step + options.length) % options.length : 0);
      setIsOpen(true);
    }

    // Enter en el buscador elige la sugerencia resaltada; nunca envía el formulario.
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeOption) choose(activeOption);
      else onCommit();
    }
  }

  return (
    <div className="field full-width autocomplete-field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type="search"
        autoComplete="off"
        value={query}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={activeOption ? `${listId}-${options.indexOf(activeOption)}` : undefined}
        {...errorProps(id, error)}
        required
      />
      {showList && (
        <ul id={listId} className="autocomplete-dropdown" role="listbox" aria-label={listLabel}>
          {options.length > 0 ? (
            options.map((option, index) => (
              <li key={option.key} id={`${listId}-${index}`} role="option" aria-selected={selectedKey === option.key}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={`autocomplete-item${option === activeOption ? " is-active" : ""}`}
                  onMouseDown={(event) => handleSelect(event, option)}
                >
                  <span className="item-title">{option.title}</span>
                  <span className="item-subtitle">{option.subtitle}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="autocomplete-empty" role="status">{emptyMessage}</li>
          )}
        </ul>
      )}
      <FieldError fieldName={id} message={error} />
    </div>
  );
}
