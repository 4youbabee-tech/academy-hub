import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const nodeCommand = process.execPath;
const typeScriptCommand = path.resolve("node_modules", "typescript", "bin", "tsc");
const viteCommand = path.resolve("node_modules", "vite", "bin", "vite.js");

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

await run(nodeCommand, [typeScriptCommand, "--noEmit"]);
await run(nodeCommand, [viteCommand, "build"], {
  ACADEMY_DESKTOP_BUILD: "1",
  NODE_ENV: "production",
});
