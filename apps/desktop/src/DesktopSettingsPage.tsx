import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

export function DesktopSettingsPage() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  return (
    <section className="settings-card">
      <div className="settings-heading">
        <h2>About Skriv</h2>
      </div>
      <div className="settings-note">
        <div>
          <strong>Version {version ?? "loading…"}</strong>
          <p>A private, offline-first workspace for planning and writing long-form fiction.</p>
        </div>
      </div>
      <div className="settings-note">
        <div>
          <strong>Updates are installed manually</strong>
          <p>Download new installers only from the official Skriv GitHub Releases page.</p>
        </div>
      </div>
    </section>
  );
}
