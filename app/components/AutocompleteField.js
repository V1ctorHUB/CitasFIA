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
  const listId = `${id}-lista`;
  const showList = isOpen && (options.length > 0 || query.trim() !== "");

  function handleChange(event) {
    onQueryChange(event.target.value);
    setIsOpen(true);
  }

  function handleSelect(event, option) {
    // preventDefault mantiene el foco en el input y evita que el blur se adelante a la selección.
    event.preventDefault();
    onSelect(option.value);
    setIsOpen(false);
  }

  function handleBlur() {
    setIsOpen(false);
    onCommit();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") setIsOpen(false);
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
        {...errorProps(id, error)}
        required
      />
      {showList && (
        <ul id={listId} className="autocomplete-dropdown" role="listbox" aria-label={listLabel}>
          {options.length > 0 ? (
            options.map((option) => (
              <li key={option.key} role="option" aria-selected={selectedKey === option.key}>
                <button
                  type="button"
                  tabIndex={-1}
                  className="autocomplete-item"
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
