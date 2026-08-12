import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";

export interface KoradioSelectOption<T extends string> {
  disabled?: boolean;
  label: string;
  value: T;
}

interface KoradioSelectProps<T extends string> {
  "aria-label": string;
  disabled?: boolean;
  onChange: (value: T) => void;
  options: readonly KoradioSelectOption<T>[];
  value: T;
}

function nextEnabledIndex<T extends string>(
  options: readonly KoradioSelectOption<T>[],
  start: number,
  direction: 1 | -1,
): number {
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (start + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return start;
}

export function KoradioSelect<T extends string>({
  "aria-label": ariaLabel,
  disabled = false,
  onChange,
  options,
  value,
}: KoradioSelectProps<T>): ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimer = useRef<number | undefined>(undefined);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((item) => item.value === value),
    ),
  );
  const selected = options.find((item) => item.value === value) ?? options[0];

  useEffect(() => {
    const nextIndex = options.findIndex((item) => item.value === value);
    if (nextIndex >= 0) setActiveIndex(nextIndex);
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent): void => {
      if (
        !buttonRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", dismiss);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (typeaheadTimer.current !== undefined) window.clearTimeout(typeaheadTimer.current);
    },
    [],
  );

  function choose(index: number): void {
    const option = options[index];
    if (option === undefined || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }

  function updateActive(index: number): void {
    setActiveIndex(index);
    window.requestAnimationFrame(() => {
      menuRef.current
        ?.querySelector<HTMLElement>(`[data-select-index="${String(index)}"]`)
        ?.scrollIntoView({
          block: "nearest",
        });
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (disabled) return;
    const selectedIndex = Math.max(
      0,
      options.findIndex((item) => item.value === value),
    );
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const index = nextEnabledIndex(
        options,
        open ? activeIndex : selectedIndex,
        event.key === "ArrowDown" ? 1 : -1,
      );
      setOpen(true);
      updateActive(index);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const candidates = event.key === "Home" ? options : [...options].reverse();
      const match = candidates.find((option) => !option.disabled);
      if (match !== undefined) {
        setOpen(true);
        updateActive(options.indexOf(match));
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else setOpen(true);
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key.length === 1 && /\S/u.test(event.key)) {
      typeaheadRef.current += event.key.toLocaleLowerCase();
      if (typeaheadTimer.current !== undefined) window.clearTimeout(typeaheadTimer.current);
      typeaheadTimer.current = window.setTimeout(() => {
        typeaheadRef.current = "";
        typeaheadTimer.current = undefined;
      }, 500);
      const found = options.findIndex(
        (option) =>
          !option.disabled && option.label.toLocaleLowerCase().startsWith(typeaheadRef.current),
      );
      if (found >= 0) {
        setOpen(true);
        updateActive(found);
      }
    }
  }

  return (
    <span className="koradio-select">
      <button
        ref={buttonRef}
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="koradio-select__trigger"
        disabled={disabled}
        type="button"
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selected?.label}</span>
        <span className="koradio-select__chevron" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="koradio-select__menu"
              id={listboxId}
              role="listbox"
              aria-label={ariaLabel}
              style={(() => {
                const rect = buttonRef.current?.getBoundingClientRect();
                return rect === undefined
                  ? undefined
                  : { left: rect.left, top: rect.bottom + 8, width: rect.width };
              })()}
            >
              {options.map((option, index) => (
                <button
                  aria-disabled={option.disabled || undefined}
                  aria-selected={option.value === value}
                  className={index === activeIndex ? "is-active" : ""}
                  data-select-index={index}
                  disabled={option.disabled}
                  key={option.value}
                  role="option"
                  tabIndex={-1}
                  type="button"
                  onMouseMove={() => {
                    setActiveIndex(index);
                  }}
                  onClick={() => {
                    choose(index);
                  }}
                >
                  {option.label}
                  {option.value === value ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
