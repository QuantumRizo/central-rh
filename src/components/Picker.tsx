import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type Option = { id: string; name: string };

export function Picker({
  options,
  value,
  onChange,
  label,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const selected = options.find((o) => o.id === value);
  const filtered = options.filter((o) =>
    o.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div
      className="picker"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          root.current?.querySelector("button")?.focus();
        }
      }}
    >
      <button
        type="button"
        className="picker-trigger"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
      >
        <span>
          {selected?.name.split(" (")[0] ||
            `Seleccionar ${label.toLowerCase()}`}
        </span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="picker-menu">
          <input
            autoFocus
            aria-label={`Buscar ${label.toLowerCase()}`}
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="picker-options">
            {filtered.map((o) => (
              <button
                type="button"
                key={o.id}
                className={o.id === value ? "selected" : ""}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                  root.current?.querySelector("button")?.focus();
                }}
              >
                <span>
                  <strong>{o.name.split(" (")[0]}</strong>
                  {o.name.includes(" (") && (
                    <small>
                      {o.name
                        .slice(o.name.indexOf(" (") + 2)
                        .replace(/\)$/, "")}
                    </small>
                  )}
                </span>
                {o.id === value && <Check size={16} />}
              </button>
            ))}
            {!filtered.length && <p>Sin resultados</p>}
          </div>
        </div>
      )}
    </div>
  );
}
