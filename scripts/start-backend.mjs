import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const windows = process.platform === "win32";
const activePython = process.env.VIRTUAL_ENV
  ? resolve(process.env.VIRTUAL_ENV, windows ? "Scripts/python.exe" : "bin/python")
  : null;
const candidates = windows
  ? [activePython, ".venv/Scripts/python.exe", "venv/Scripts/python.exe"]
  : [activePython, ".venv/bin/python", "venv/bin/python"];
const python = candidates
  .filter((candidate) => candidate !== null)
  .map((candidate) => resolve(projectRoot, candidate))
  .find(existsSync);
const executable = python ?? (windows ? "python" : "python3");

console.log(`Starting FastAPI with ${executable}`);

const child = spawn(
  executable,
  [
    "-m",
    "uvicorn",
    "backend_fastapi.main:app",
    "--host",
    "127.0.0.1",
    "--port",
    process.env.PORT || "4001",
  ],
  { cwd: projectRoot, env: process.env, stdio: "inherit" },
);

child.on("error", (error) => {
  console.error(`Could not start the FastAPI backend: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
