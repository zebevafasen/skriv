export type DesktopUpdateState =
  | { status: "disabled" }
  | { status: "idle" }
  | { status: "checking" }
  | { status: "unavailable"; checkedAt: string }
  | { status: "available"; version: string; body: string | null }
  | { status: "downloading"; version: string; downloaded: number; total: number | null }
  | { status: "ready"; version: string }
  | { status: "failed"; message: string };

export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished"; data?: Record<string, never> };

export type UpdateCandidate = {
  version: string;
  currentVersion?: string | undefined;
  body?: string | undefined;
  download(onEvent: (event: DownloadEvent) => void): Promise<void>;
  install(): Promise<void>;
};

export type UpdateAdapter = {
  check(options: { allowDowngrades: false }): Promise<UpdateCandidate | null>;
  relaunch(): Promise<void>;
  log(level: "info" | "warn" | "error", message: string): void;
};

type Listener = () => void;

const releaseVersion =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseReleaseVersion(value: string) {
  const match = releaseVersion.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((part) => /^\d+$/u.test(part) && part.length > 1 && part.startsWith("0"))) {
    return null;
  }
  return { core: match.slice(1, 4).map(Number), prerelease };
}

function compareReleaseVersions(left: string, right: string): number {
  const leftVersion = parseReleaseVersion(left);
  const rightVersion = parseReleaseVersion(right);
  if (!leftVersion || !rightVersion) throw new Error("Cannot compare malformed release versions.");
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftVersion.core[index] ?? 0) - (rightVersion.core[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0;
  if (leftVersion.prerelease.length === 0) return 1;
  if (rightVersion.prerelease.length === 0) return -1;
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function safeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().slice(0, 500) || "The update operation failed.";
}

export class DesktopUpdateService {
  private state: DesktopUpdateState;
  private candidate: UpdateCandidate | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly enabled: boolean,
    private readonly adapter: UpdateAdapter,
    private readonly beforeInstall: () => Promise<void>,
  ) {
    this.state = enabled ? { status: "idle" } : { status: "disabled" };
  }

  getState = (): DesktopUpdateState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private setState(state: DesktopUpdateState) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  async checkForUpdates(): Promise<void> {
    if (!this.enabled || this.state.status === "checking" || this.state.status === "downloading") {
      return;
    }
    this.setState({ status: "checking" });
    this.adapter.log("info", "Checking the stable desktop update channel.");
    try {
      const candidate = await this.adapter.check({ allowDowngrades: false });
      if (!candidate) {
        this.candidate = null;
        this.setState({ status: "unavailable", checkedAt: new Date().toISOString() });
        this.adapter.log("info", "No desktop update is available.");
        return;
      }
      if (!parseReleaseVersion(candidate.version)) {
        throw new Error("The update channel returned an invalid release version.");
      }
      if (
        candidate.currentVersion &&
        parseReleaseVersion(candidate.currentVersion) &&
        compareReleaseVersions(candidate.version, candidate.currentVersion) <= 0
      ) {
        this.candidate = null;
        this.setState({ status: "unavailable", checkedAt: new Date().toISOString() });
        this.adapter.log(
          "warn",
          "Ignored an update that was not newer than the installed version.",
        );
        return;
      }
      this.candidate = candidate;
      this.setState({
        status: "available",
        version: candidate.version,
        body: candidate.body?.trim() || null,
      });
      this.adapter.log("info", `Desktop update ${candidate.version} is available.`);
    } catch (error) {
      const message = safeMessage(error);
      this.setState({ status: "failed", message });
      this.adapter.log("error", `Desktop update check failed: ${message}`);
    }
  }

  async download(): Promise<void> {
    if (!this.candidate || this.state.status !== "available") return;
    const candidate = this.candidate;
    let downloaded = 0;
    let total: number | null = null;
    this.setState({ status: "downloading", version: candidate.version, downloaded, total });
    this.adapter.log("info", `Downloading desktop update ${candidate.version}.`);
    try {
      await candidate.download((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? null;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        this.setState({ status: "downloading", version: candidate.version, downloaded, total });
      });
      this.setState({ status: "ready", version: candidate.version });
      this.adapter.log("info", `Desktop update ${candidate.version} is ready to install.`);
    } catch (error) {
      const message = safeMessage(error);
      this.setState({ status: "failed", message });
      this.adapter.log("error", `Desktop update download failed: ${message}`);
    }
  }

  async installAndRelaunch(confirmed: boolean): Promise<boolean> {
    if (!confirmed) {
      this.adapter.log("info", "Desktop update installation was cancelled by the user.");
      return false;
    }
    if (!this.candidate || this.state.status !== "ready") return false;
    try {
      this.adapter.log("info", `Preparing to install desktop update ${this.candidate.version}.`);
      await this.beforeInstall();
      await this.candidate.install();
      this.adapter.log("info", `Desktop update ${this.candidate.version} installed; relaunching.`);
      await this.adapter.relaunch();
      return true;
    } catch (error) {
      const message = safeMessage(error);
      this.setState({ status: "failed", message });
      this.adapter.log("error", `Desktop update installation failed: ${message}`);
      return false;
    }
  }
}
