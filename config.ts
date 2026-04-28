/**
 * Configuration types and loading for pi-supersafety
 *
 * Config files (project overrides global):
 * - ~/.pi/agent/extensions/supersafety.json  (global)
 * - <cwd>/.pi/supersafety.json               (project-local)
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SandboxieConfig {
  /** Whether to offer "Run Sandboxed" as an option in the approval flow */
  enabled: boolean;
  /** Name of the Sandboxie box to use (default: "DefaultBox") */
  boxName: string;
  /** Path to Sandboxie Start.exe — auto-detected if omitted */
  startPath?: string;
}

export interface BashSafetyConfig {
  /** Enable bash command approval gating */
  enabled: boolean;
  /**
   * When true, ALL bash commands require approval (Claude Code style).
   * When false, only destructive commands (rm -rf, sudo, format, etc.) require approval.
   */
  checkProjectFolder: boolean;
  /** Sandboxie integration settings */
  sandbox: SandboxieConfig;
}

export interface FileSafetyConfig {
  /** Require approval for file operations outside the project directory */
  enabled: boolean;
  /** If true, only check operations outside project; if false, ALL file ops need approval */
  outsideProjectOnly: boolean;
  /** Which file tools to gate: "write", "edit", and/or "bash" (for destructive bash like rm) */
  tools: ("write" | "edit" | "bash")[];
  /** Paths (relative or absolute) that are always allowed even if they'd be blocked */
  allowedPaths: string[];
}

export interface SupersafetyConfig {
  /** Master switch — disable everything */
  enabled: boolean;
  /** Bash command safety */
  bash: BashSafetyConfig;
  /** File operation safety */
  fileOperations: FileSafetyConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SupersafetyConfig = {
  enabled: true,
  bash: {
    enabled: true,
    // When true, ALL bash commands require approval (Claude Code style).
    // When false, only destructive commands (rm -rf, sudo, etc.) require approval.
    checkProjectFolder: true,
    sandbox: {
      enabled: true,
      boxName: "DefaultBox",
      startPath: undefined,
    },
  },
  fileOperations: {
    enabled: true,
    // When true, only file operations OUTSIDE the project directory require approval.
    // When false, ALL file operations require approval.
    outsideProjectOnly: true,
    tools: ["write", "edit", "bash"],
    allowedPaths: [],
  },
};

// ---------------------------------------------------------------------------
// Auto-detect Sandboxie Start.exe
// ---------------------------------------------------------------------------

function detectSandboxieStartPath(): string | undefined {
  const candidates = [
    "C:\\Program Files\\Sandboxie\\Start.exe",
    "C:\\Program Files\\Sandboxie-Plus\\Start.exe",
    "C:\\Program Files (x86)\\Sandboxie\\Start.exe",
    "C:\\Program Files (x86)\\Sandboxie-Plus\\Start.exe",
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function loadJsonFile(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown> | undefined): T {
  if (!override) return base;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof result[key] === "object" &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value,
      );
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Load configuration from global + project config files.
 * Project config overrides global config.
 */
export function loadConfig(cwd: string): SupersafetyConfig {
  // Try to find global config in common locations
  const homedir = process.env.HOME || process.env.USERPROFILE || "";
  const globalPaths = [
    join(homedir, ".pi", "agent", "extensions", "supersafety.json"),
    join(homedir, ".pi", "supersafety.json"),
  ];

  let globalConfig: Record<string, unknown> | undefined;
  for (const path of globalPaths) {
    const data = loadJsonFile(path);
    if (data) {
      globalConfig = data;
      break;
    }
  }

  // Project config
  const projectConfig = loadJsonFile(join(cwd, ".pi", "supersafety.json"));

  // Merge: defaults < global < project
  const withGlobal = deepMerge(DEFAULT_CONFIG, globalConfig ?? {});
  const final = deepMerge(withGlobal, projectConfig ?? {});

  // Auto-detect Sandboxie path if not configured
  if (
    final.bash.sandbox.enabled &&
    !final.bash.sandbox.startPath
  ) {
    final.bash.sandbox.startPath = detectSandboxieStartPath();
  }

  return final;
}
