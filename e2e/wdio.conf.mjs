import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tempRoot = path.join(root, ".tmp", "e2e");
mkdirSync(tempRoot, { recursive: true });
process.env.TEMP = tempRoot;
process.env.TMP = tempRoot;
const dataDirectory = path.join(tempRoot, "skriv-data");
if (!dataDirectory.startsWith(`${tempRoot}${path.sep}`)) {
  throw new Error("E2E data directory must remain inside the workspace test directory.");
}
process.env.SKRIV_DATA_DIR = dataDirectory;

const application = path.join(
  root,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "debug",
  "skriv.exe",
);
const installedTauriDriver = path.join(os.homedir(), ".cargo", "bin", "tauri-driver.exe");
const tauriDriverPort = 4544;
const nativeDriverPort = 4545;
let tauriDriver;
let shuttingDown = false;

function stopDriver() {
  shuttingDown = true;
  tauriDriver?.kill();
  tauriDriver = undefined;
}

async function waitForDriver(port, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(500, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`tauri-driver did not become ready on port ${port}.`);
}

export const config = {
  host: "127.0.0.1",
  port: tauriDriverPort,
  logLevel: "warn",
  specs: ["./specs/**/*.e2e.mjs"],
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      "tauri:options": {
        application,
      },
    },
  ],
  reporters: ["spec"],
  framework: "mocha",
  mochaOpts: { ui: "bdd", timeout: 90_000 },
  onPrepare() {
    rmSync(dataDirectory, { recursive: true, force: true });
    const result = spawnSync(
      "powershell",
      ["-ExecutionPolicy", "Bypass", "-File", path.join(root, "scripts", "tauri.ps1"), "e2e-build"],
      { cwd: root, env: process.env, stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error("The E2E desktop build failed.");

    const edgeDriver = spawnSync(
      "powershell",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "e2e", "ensure-msedgedriver.ps1"),
        "-CacheRoot",
        path.join(tempRoot, "msedgedriver"),
      ],
      { cwd: root, encoding: "utf8" },
    );
    if (edgeDriver.status !== 0) {
      throw new Error(`Microsoft Edge WebDriver setup failed.\n${edgeDriver.stderr}`);
    }
    const edgeDriverDirectory = edgeDriver.stdout.trim().split(/\r?\n/).at(-1);
    if (!edgeDriverDirectory || !existsSync(path.join(edgeDriverDirectory, "msedgedriver.exe"))) {
      throw new Error("Microsoft Edge WebDriver setup returned an invalid directory.");
    }
    process.env.PATH = `${edgeDriverDirectory}${path.delimiter}${process.env.PATH ?? ""}`;
  },
  async beforeSession() {
    if (!existsSync(installedTauriDriver)) {
      throw new Error("tauri-driver is not installed. Run `cargo install tauri-driver --locked`.");
    }
    shuttingDown = false;
    tauriDriver = spawn(
      installedTauriDriver,
      ["--port", String(tauriDriverPort), "--native-port", String(nativeDriverPort)],
      {
        env: process.env,
        stdio: ["ignore", "inherit", "inherit"],
      },
    );
    tauriDriver.on("error", (error) => {
      console.error("tauri-driver failed:", error);
      process.exitCode = 1;
    });
    tauriDriver.on("exit", (code) => {
      if (!shuttingDown && code !== 0) process.exitCode = 1;
    });
    await waitForDriver(tauriDriverPort);
  },
  afterSession: stopDriver,
  onComplete: stopDriver,
};
