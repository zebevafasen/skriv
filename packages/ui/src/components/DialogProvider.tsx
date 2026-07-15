import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ConfirmOptions = { title: string; body: string; confirmLabel?: string; destructive?: boolean };
type PromptOptions = { title: string; label: string; initialValue: string; confirmLabel?: string };
type Request =
  | ({ kind: "confirm"; resolve: (value: boolean) => void } & ConfirmOptions)
  | ({ kind: "prompt"; resolve: (value: string | null) => void } & PromptOptions);

const DialogContext = createContext<{
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
} | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const close = (result: boolean | string | null) => {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(Boolean(result));
    else request.resolve(typeof result === "string" ? result : null);
    setRequest(null);
  };
  useEffect(() => {
    if (!request) return;
    setValue(request.kind === "prompt" ? request.initialValue : "");
    requestAnimationFrame(() => {
      if (request.kind === "prompt") inputRef.current?.select();
      else confirmRef.current?.focus();
    });
  }, [request]);
  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") close(request?.kind === "confirm" ? false : null);
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>("button, input")].filter(
      (element) => !element.hasAttribute("disabled"),
    );
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? index <= 0
        ? controls.length - 1
        : index - 1
      : (index + 1) % controls.length;
    event.preventDefault();
    controls[next]?.focus();
  };
  return (
    <DialogContext.Provider
      value={{
        confirm: (options) =>
          new Promise((resolve) => setRequest({ kind: "confirm", resolve, ...options })),
        prompt: (options) =>
          new Promise((resolve) => setRequest({ kind: "prompt", resolve, ...options })),
      }}
    >
      {children}
      {request ? (
        <div className="modal-backdrop">
          <form
            className="modal app-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            onKeyDown={trapFocus}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              close(request.kind === "prompt" ? value.trim() : true);
            }}
          >
            <h2 id="app-dialog-title">{request.title}</h2>
            {request.kind === "confirm" ? (
              <p className="dialog-body">{request.body}</p>
            ) : (
              <label className="form-field">
                <span>{request.label}</span>
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => close(request.kind === "confirm" ? false : null)}
              >
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="submit"
                className={`button ${request.kind === "confirm" && request.destructive ? "danger" : "primary"}`}
                disabled={request.kind === "prompt" && !value.trim()}
              >
                {request.confirmLabel ?? (request.kind === "confirm" ? "Confirm" : "Save")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useAppDialog() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("useAppDialog must be used inside DialogProvider.");
  return value;
}
