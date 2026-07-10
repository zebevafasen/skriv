import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ModelSelect({
  value,
  onChange,
  models,
}: {
  value: string;
  onChange: (value: string) => void;
  models: Array<{ id: string; name: string }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  const sortedModels = [...models].sort((a, b) => {
    const providerA = a.id.split("/")[0] ?? "";
    const providerB = b.id.split("/")[0] ?? "";
    if (providerA !== providerB) return providerA.localeCompare(providerB);
    return a.name.localeCompare(b.name);
  });

  const filteredModels = sortedModels.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedName = models.find((m) => m.id === value)?.name ?? value;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          background: "#12110f",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          padding: "10px 12px",
          cursor: "pointer",
          color: "var(--text)",
          fontSize: "13px",
          textAlign: "left",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selectedName || "Select a model..."}
        </span>
        <ChevronDown size={16} style={{ opacity: 0.5, marginLeft: "8px", flexShrink: 0 }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#201e1a",
            border: "1px solid #534736",
            borderRadius: "10px",
            boxShadow: "0 24px 70px #000c",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "8px", borderBottom: "1px solid var(--border-soft)" }}>
            <input
              ref={searchRef}
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                background: "#12110f",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "8px 10px",
                fontSize: "12px",
                color: "var(--text)",
                outline: "none",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          <div style={{ maxHeight: "250px", overflowY: "auto", padding: "4px" }}>
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => {
                const isSelected = model.id === value;
                return (
                  <button
                    type="button"
                    key={model.id}
                    onClick={() => {
                      onChange(model.id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      border: 0,
                      textAlign: "left",
                      background: isSelected ? "#2a2117" : "transparent",
                      color: isSelected ? "var(--accent-bright)" : "var(--text)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "#211e1a";
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <span
                      style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {model.name}
                    </span>
                    {isSelected && <Check size={14} style={{ flexShrink: 0, marginLeft: "8px" }} />}
                  </button>
                );
              })
            ) : (
              <div
                style={{
                  padding: "8px 10px",
                  fontSize: "12px",
                  color: "var(--muted)",
                  textAlign: "center",
                }}
              >
                No models found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
