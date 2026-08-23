import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const electronPath = (await import("electron")).default;
const devUrl = "http://127.0.0.1:8080";

const vite = spawn(
  npmCommand,
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", "8080", "--strictPort"],
  { stdio: "inherit", shell: false },
);

let electron;
let stopping = false;

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error("Vite stopped before it became ready.");
    try {
      const response = await fetch(devUrl, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Timed out waiting for the Academy Hub development server.");
}

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  if (electron && electron.exitCode === null) electron.kill();
  if (vite.exitCode === null) vite.kill();
  setTimeout(() => process.exit(exitCode), 250).unref();
}

process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
vite.once("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});

try {
  await waitForServer();
  electron = spawn(electronPath, [path.resolve(".")], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      ACADEMY_DEV_SERVER_URL: devUrl,
    },
  });
  electron.once("exit", (code) => stop(code ?? 0));
} catch (error) {
  console.error(error);
  stop(1);
}

