import { createContext, useContext, useState, type ReactNode, type FunctionComponent } from "react";
import { SettingsModal } from "../pages/SettingsModal.js";
import { PromptsModal } from "../pages/PromptsModal.js";

const SettingsContext = createContext<{ openSettings: () => void; openPrompts: () => void }>({
  openSettings: () => {},
  openPrompts: () => {},
});

export function SettingsProvider({
  children,
  settingsComponent: SettingsComponent,
}: {
  children: ReactNode;
  settingsComponent?: FunctionComponent | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPromptsOpen, setIsPromptsOpen] = useState(false);

  return (
    <SettingsContext.Provider value={{ openSettings: () => setIsOpen(true), openPrompts: () => setIsPromptsOpen(true) }}>
      {children}
      {isOpen ? (
        <SettingsModal
          onClose={() => setIsOpen(false)}
          extraSection={SettingsComponent ? <SettingsComponent /> : null}
        />
      ) : null}
      {isPromptsOpen ? <PromptsModal onClose={() => setIsPromptsOpen(false)} /> : null}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
