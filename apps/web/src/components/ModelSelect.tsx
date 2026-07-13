import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ModelMenuPlacement = "top" | "bottom";
type RequestedModelMenuPlacement = ModelMenuPlacement | "auto";

type ModelMenuLayout = {
  placement: ModelMenuPlacement;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  transform?: string;
};

export function calculateModelMenuLayout(
  anchor: { top: number; bottom: number; left: number; width: number },
  viewport: { top: number; height: number },
  requestedPlacement: RequestedModelMenuPlacement,
): ModelMenuLayout {
  const gap = 4;
  const desiredHeight = 330;
  const viewportBottom = viewport.top + viewport.height;
  const availableAbove = Math.max(0, anchor.top - viewport.top - gap);
  const availableBelow = Math.max(0, viewportBottom - anchor.bottom - gap);
  const placement =
    requestedPlacement === "auto"
      ? availableBelow >= desiredHeight || availableBelow >= availableAbove
        ? "bottom"
        : "top"
      : requestedPlacement;
  const availableHeight = placement === "top" ? availableAbove : availableBelow;
  return {
    placement,
    left: anchor.left,
    top: placement === "top" ? anchor.top - gap : anchor.bottom + gap,
    width: anchor.width,
    maxHeight: Math.max(96, Math.min(desiredHeight, availableHeight)),
    ...(placement === "top" ? { transform: "translateY(-100%)" } : {}),
  };
}

export function ModelSelect({
  value,
  onChange,
  models,
  placement = "bottom",
}: {
  value: string;
  onChange: (value: string) => void;
  models: Array<{ id: string; name: string }>;
  placement?: RequestedModelMenuPlacement;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuLayout, setMenuLayout] = useState<ModelMenuLayout | null>(null);

  const positionMenu = useCallback(() => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const viewport = window.visualViewport;
    setMenuLayout(
      calculateModelMenuLayout(
        anchor,
        {
          top: viewport?.offsetTop ?? 0,
          height: viewport?.height ?? window.innerHeight,
        },
        placement,
      ),
    );
  }, [placement]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  useEffect(() => {
    if (!isOpen) {
      setMenuLayout(null);
      return;
    }
    positionMenu();
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const viewport = window.visualViewport;
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    viewport?.addEventListener("resize", positionMenu);
    viewport?.addEventListener("scroll", positionMenu);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
      viewport?.removeEventListener("resize", positionMenu);
      viewport?.removeEventListener("scroll", positionMenu);
    };
  }, [isOpen, positionMenu]);

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
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
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
        <ChevronDown
          size={16}
          style={{
            opacity: 0.5,
            marginLeft: "8px",
            flexShrink: 0,
            transform: menuLayout?.placement === "top" && isOpen ? "rotate(180deg)" : undefined,
          }}
        />
      </button>

      {isOpen &&
        menuLayout &&
        createPortal(
          <div
            ref={menuRef}
            className="model-select-menu"
            data-placement={menuLayout.placement}
            style={{
              position: "fixed",
              left: menuLayout.left,
              top: menuLayout.top,
              width: menuLayout.width,
              maxHeight: menuLayout.maxHeight,
              transform: menuLayout.transform,
              zIndex: 200,
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

            <div style={{ minHeight: 0, flex: 1, overflowY: "auto", padding: "4px" }}>
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
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {model.name}
                      </span>
                      {isSelected && (
                        <Check size={14} style={{ flexShrink: 0, marginLeft: "8px" }} />
                      )}
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
          </div>,
          document.body,
        )}
    </div>
  );
}
