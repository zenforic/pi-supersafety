/**
 * Sandboxie integration — wraps commands via Sandboxie Start.exe
 *
 * Uses the /wait flag so Start.exe blocks until the sandboxed process exits,
 * returning the child's exit code. Combined with /box:Name and /silent for
 * clean, non-interactive sandboxed execution.
 */

import { spawn } from "node:child_process";
import type { SandboxieConfig } from "./config";

// ---------------------------------------------------------------------------
// Build the sandboxed command
// ---------------------------------------------------------------------------

/**
 * Wrap a shell command to run inside Sandboxie via Start.exe /wait.
 *
 * Returns the full command string to pass to `cmd /c`, or the original
 * command if sandboxing is not available.
 */
export function wrapWithSandbox(
  command: string,
  config: SandboxieConfig,
): string | undefined {
  if (!config.enabled || !config.startPath) {
    return undefined;
  }

  const boxFlag = `/box:${config.boxName}`;
  // Use /wait so Start.exe blocks and returns the child exit code.
  // Use /silent to suppress Sandboxie pop-up error messages.
  const startArgs = `${boxFlag} /wait /silent`;

  // Wrap: Start.exe /box:Name /wait /silent cmd /c "original command"
  // We use cmd /c to ensure the full shell command (pipes, &&, etc.) works.
  return `cmd /c "${config.startPath}" ${startArgs} cmd /c "${escapeForCmdArg(command)}"`;
}

/**
 * Escape a command for safe embedding inside double quotes in cmd /c.
 * Doubles any internal double quotes.
 */
function escapeForCmdArg(command: string): string {
  return command.replace(/"/g, '""');
}

// ---------------------------------------------------------------------------
// Execute a command (optionally sandboxed)
// ---------------------------------------------------------------------------

export interface SandboxExecResult {
  output: string;
  exitCode: number | null;
  cancelled: boolean;
  sandboxed: boolean;
}

/**
 * Execute a command, optionally wrapped in Sandboxie.
 * Streams output via onData callback.
 */
export function execCommand(
  command: string,
  cwd: string,
  options: {
    sandboxed: boolean;
    sandboxConfig?: SandboxieConfig;
    onData?: (data: string | Buffer) => void;
    signal?: AbortSignal;
    timeout?: number;
  },
): Promise<SandboxExecResult> {
  const { sandboxed, sandboxConfig, onData, signal, timeout } = options;

  let finalCommand = command;
  if (sandboxed && sandboxConfig) {
    const wrapped = wrapWithSandbox(command, sandboxConfig);
    if (wrapped) {
      finalCommand = wrapped;
    }
    // If wrap failed (no startPath), fall through to normal execution
  }

  return new Promise((resolve, reject) => {
    const child = spawn("cmd", ["/c", finalCommand], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    if (timeout !== undefined && timeout > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        tryKill(child);
      }, timeout * 1000);
    }

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onData?.(text);
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      onData?.(text);
    });

    child.on("error", (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      reject(err);
    });

    const onAbort = () => tryKill(child);
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("close", (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);

      if (signal?.aborted) {
        resolve({ output, exitCode: null, cancelled: true, sandboxed });
      } else if (timedOut) {
        resolve({ output, exitCode: null, cancelled: true, sandboxed });
      } else {
        resolve({ output, exitCode: code, cancelled: false, sandboxed });
      }
    });
  });
}

function tryKill(child: ReturnType<typeof spawn>): void {
  if (child.pid) {
    try {
      // On Windows, kill the process tree
      spawn("taskkill", ["/T", "/F", "/PID", String(child.pid)], {
        stdio: "ignore",
      });
    } catch {
      child.kill("SIGKILL");
    }
  }
}
