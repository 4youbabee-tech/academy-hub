import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const viteCommand = path.resolve(
  "node_modules",
  ".bin",
  isWindows ? "vite.cmd" : "vite",
);

function run(command, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...extraEnv },
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code ?? "unknown"})`));
    });
  });
}

await run(npmCommand, ["run", "typecheck"]);
await run(viteCommand, ["build"], {
  ACADEMY_DESKTOP_BUILD: "1",
  NODE_ENV: "production",
});

