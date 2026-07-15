import { createContext, useContext, useState, type ReactNode } from "react";
import { SettingsModal } from "../pages/SettingsModal.js";
import { PromptsModal } from "../pages/PromptsModal.js";

const SettingsContext = createContext<{ openSettings: () => void; openPrompts: () => void }>({
  openSettings: () => {},
  openPrompts: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);

  return (
    <SettingsContext.Provider value={{ openSettings: () => setIsOpen(true), openPrompts: () => setIsPromptsOpen(true) }}>
      {children}
      {isOpen ? <SettingsModal onClose={() => setIsOpen(false)} /> : null}
      {isPromptsOpen ? <PromptsModal onClose={() => setIsPromptsOpen(false)} /> : null}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
