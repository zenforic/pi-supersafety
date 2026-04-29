/**
 * pi-supersafety — Comprehensive safety extension
 *
 * Requires approval for:
 * - All bash commands (configurable per-project-folder)
 * - User bash commands (! and !! prefix)
 * - File operations outside the project directory
 *
 * Features:
 * - Sandboxie integration: "Run Sandboxed" option for bash commands
 * - Global + project-level configuration
 * - Master on/off switch
 * - /supersafety command to view status
 *
 * Config (.pi/supersafety.json or ~/.pi/agent/extensions/supersafety.json):
 * ```json
 * {
 *   "enabled": true,
 *   "bash": {
 *     "enabled": true,
 *     "checkProjectFolder": true,
 *     "sandbox": {
 *       "enabled": true,
 *       "boxName": "DefaultBox",
 *       "startPath": "C:\\Program Files\\Sandboxie\\Start.exe"
 *     }
 *   },
 *   "fileOperations": {
 *     "enabled": true,
 *     "outsideProjectOnly": true,
 *     "tools": ["write", "edit", "bash"],
 *     "allowedPaths": []
 *   }
 * }
 * ```
 */

import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createLocalBashOperations } from "@mariozechner/pi-coding-agent";
import { approveBashCommand, approveFileOperation } from "./approval";
import type { SandboxieConfig } from "./config";
import { loadConfig } from "./config";

// ---------------------------------------------------------------------------
// Path resolution helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a path argument to an absolute path, normalizing it.
 * Handles leading @ (some models prepend @ to paths).
 */
function resolvePathArg(argPath: string, cwd: string): string {
  // Strip leading @ that some models add
  let cleaned = argPath.startsWith("@") ? argPath.slice(1) : argPath;
  if (isAbsolute(cleaned)) {
    return normalize(cleaned);
  }
  return normalize(resolve(cwd, cleaned));
}

/**
 * Check if an absolute path is inside the project directory.
 * Ensures we match directory boundaries (C:\foo is not inside C:\f).
 */
function isInsideProject(absolutePath: string, projectDir: string): boolean {
  let normalizedProject = normalize(projectDir).toLowerCase();
  // Ensure project dir ends with path separator for proper prefix matching
  if (!normalizedProject.endsWith("\\") && !normalizedProject.endsWith("/")) {
    normalizedProject += "\\";
  }
  const normalizedPath = normalize(absolutePath).toLowerCase();
  // Exact match (the path IS the project dir) or starts with project dir + separator
  return normalizedPath === normalizedProject.slice(0, -1) || normalizedPath.startsWith(normalizedProject);
}

/**
 * Check if a path matches any of the allowed paths in config.
 */
function isAllowedPath(absolutePath: string, allowedPaths: string[]): boolean {
  for (const allowed of allowedPaths) {
    const resolved = isAbsolute(allowed) ? normalize(allowed) : normalize(resolve(process.cwd(), allowed));
    if (absolutePath.toLowerCase().startsWith(resolved.toLowerCase())) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Destructive bash patterns
// ---------------------------------------------------------------------------

const DESTRUCTIVE_PATTERNS = [
  /\brm\s+(-rf?|--recursive)/i,
  /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f/i,     // rm -fr, rm -rf, rm -rfd, etc.
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bsudo\b/i,
  /\b(chmod|chown)\b.*777/i,
  /\bdel\s+\/s/i,                        // Windows del /s
  /\brd\s+\/s\s+\/q/i,                   // Windows rd /s /q
  /\berase\b/i,
  /\bkill\b.*-9/i,
];

function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  // CLI flag to disable entirely
  pi.registerFlag("no-supersafety", {
    description: "Disable pi-supersafety extension",
    type: "boolean",
    default: false,
  });

  let config = loadConfig(process.cwd());
  let sandboxAvailable = !!(config.bash.sandbox.enabled && config.bash.sandbox.startPath);

  // -----------------------------------------------------------------------
  // Status line
  // -----------------------------------------------------------------------

  function updateStatus(ctx: Parameters<Parameters<typeof pi.on>[1]>["0"]) {
    if (!config.enabled) {
      ctx.ui.setStatus("supersafety", ctx.ui.theme.fg("warning", "🛡️ Supersafety: disabled"));
      return;
    }

    const parts: string[] = [];
    if (config.bash.enabled) {
      parts.push("bash");
    }
    if (config.fileOperations.enabled) {
      parts.push("files");
    }
    if (sandboxAvailable) {
      parts.push(`sandbox(${config.bash.sandbox.boxName})`);
    }

    ctx.ui.setStatus(
      "supersafety",
      ctx.ui.theme.fg("success", `🛡️ Supersafety: ${parts.join(", ")}`),
    );
  }

  // -----------------------------------------------------------------------
  // Session start — load config, set status, register skill path
  // -----------------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    const disabled = pi.getFlag("no-supersafety") as boolean;
    if (disabled) {
      config = { ...config, enabled: false };
      ctx.ui.notify("Supersafety disabled via --no-supersafety", "warning");
      ctx.ui.setStatus("supersafety", ctx.ui.theme.fg("warning", "🛡️ Supersafety: disabled (flag)"));
      return;
    }

    config = loadConfig(ctx.cwd);
    sandboxAvailable = !!(config.bash.sandbox.enabled && config.bash.sandbox.startPath);

    if (!config.enabled) {
      ctx.ui.notify("Supersafety disabled via config", "info");
      ctx.ui.setStatus("supersafety", ctx.ui.theme.fg("warning", "🛡️ Supersafety: disabled (config)"));
      return;
    }

    updateStatus(ctx);

    if (config.bash.sandbox.enabled && !config.bash.sandbox.startPath) {
      ctx.ui.notify("Supersafety: Sandboxie Start.exe not found — sandbox option unavailable", "warning");
    }
  });

  // -----------------------------------------------------------------------
  // Resources — register bundled skill
  // -----------------------------------------------------------------------

  pi.on("resources_discover", () => {
    const skillPath = join(__dirname, "skills", "sandboxie-boxing", "SKILL.md");
    return {
      skillPaths: [skillPath],
    };
  });

  // -----------------------------------------------------------------------
  // tool_call — intercept bash, write, edit
  // -----------------------------------------------------------------------

  pi.on("tool_call", async (event, ctx) => {
    if (!config.enabled) return undefined;

    const toolName = event.toolName;

    // ---------------------------------------------------------------------
    // Bash command approval
    // ---------------------------------------------------------------------
    if (toolName === "bash" && config.bash.enabled) {
      const command = (event.input as { command?: string }).command as string | undefined;
      if (!command) return undefined;

      // checkProjectFolder: when true, ALL commands need approval.
      // When false, only destructive commands need approval.
      const checkAll = config.bash.checkProjectFolder;
      const destructive = isDestructiveCommand(command);

      if (!checkAll && !destructive) {
        return undefined; // Non-destructive command, not checking project folder
      }

      const result = await approveBashCommand(ctx, command, config.bash.sandbox, ctx.cwd);

      if (!result.approved) {
        ctx.ui.notify("Bash command denied by user", "warning");
        return { block: true, reason: "Command denied by user" };
      }

      // If sandboxed, wrap the command
      if (result.sandboxed) {
        const wrapped = wrapBashForSandbox(command, config.bash.sandbox);
        if (wrapped) {
          (event.input as { command?: string }).command = wrapped;
          ctx.ui.notify(`Running sandboxed in ${config.bash.sandbox.boxName}`, "info");
        }
      }

      return undefined;
    }

    // ---------------------------------------------------------------------
    // File operation approval (write, edit)
    // ---------------------------------------------------------------------
    if ((toolName === "write" || toolName === "edit") && config.fileOperations.enabled) {
      const includesTool = config.fileOperations.tools.includes(toolName);
      if (!includesTool) return undefined;

      const pathArg = (event.input as { path?: string }).path as string | undefined;
      if (!pathArg) return undefined;

      const absolutePath = resolvePathArg(pathArg, ctx.cwd);
      const insideProject = isInsideProject(absolutePath, ctx.cwd);

      // Skip if outsideProjectOnly is true and the path is inside the project
      if (config.fileOperations.outsideProjectOnly && insideProject) {
        return undefined;
      }

      // Check allowed paths
      if (isAllowedPath(absolutePath, config.fileOperations.allowedPaths)) {
        return undefined;
      }

      const result = await approveFileOperation(ctx, toolName, absolutePath, ctx.cwd);
      if (!result.approved) {
        ctx.ui.notify(`File operation denied: ${absolutePath}`, "warning");
        return { block: true, reason: `File operation denied by user` };
      }

      return undefined;
    }

    return undefined;
  });

  // -----------------------------------------------------------------------
  // user_bash — intercept ! and !! user commands
  // -----------------------------------------------------------------------

  pi.on("user_bash", async (event, ctx) => {
    if (!config.enabled || !config.bash.enabled) return undefined;

    const command = event.command;

    // Same logic: checkProjectFolder true = all commands, false = destructive only
    const checkAll = config.bash.checkProjectFolder;
    const destructive = isDestructiveCommand(command);

    if (!checkAll && !destructive) {
      return undefined; // Non-destructive user command, pass through
    }

    const result = await approveBashCommand(ctx, command, config.bash.sandbox, ctx.cwd);

    if (!result.approved) {
      ctx.ui.notify("User bash command denied", "warning");
      // Block by returning a result directly
      return { result: { output: "Command denied by user", exitCode: 1, cancelled: false, truncated: false } };
    }

    // If sandboxed, wrap via custom operations
    if (result.sandboxed) {
      const localOps = createLocalBashOperations();
      ctx.ui.notify(`Running sandboxed in ${config.bash.sandbox.boxName}`, "info");
      return {
        operations: {
          exec(cmd, cwd, options) {
            const wrapped = wrapBashForSandbox(cmd, config.bash.sandbox);
            return localOps.exec(wrapped ?? cmd, cwd, options);
          },
        },
      };
    }

    return undefined; // Pass through to normal execution
  });

  // -----------------------------------------------------------------------
  // /supersafety command — show current config
  // -----------------------------------------------------------------------

  pi.registerCommand("supersafety", {
    description: "Show supersafety configuration and status",
    handler: async (_args, ctx) => {
      config = loadConfig(ctx.cwd);
      sandboxAvailable = !!(config.bash.sandbox.enabled && config.bash.sandbox.startPath);

      const lines = [
        ctx.ui.theme.fg("accent", ctx.ui.theme.bold("🛡️ Supersafety Configuration")),
        "",
        `Enabled: ${config.enabled ? ctx.ui.theme.fg("success", "Yes") : ctx.ui.theme.fg("error", "No")}`,
        "",
        ctx.ui.theme.fg("accent", "Bash Commands:"),
        `  Enabled: ${config.bash.enabled ? "Yes" : "No"}`,
        `  Check project folder: ${config.bash.checkProjectFolder ? "Yes" : "No"}`,
        "",
        ctx.ui.theme.fg("accent", "Sandboxie:"),
        `  Enabled: ${config.bash.sandbox.enabled ? "Yes" : "No"}`,
        `  Box: ${config.bash.sandbox.boxName}`,
        `  Start.exe: ${config.bash.sandbox.startPath || ctx.ui.theme.fg("warning", "Not found")}`,
        "",
        ctx.ui.theme.fg("accent", "File Operations:"),
        `  Enabled: ${config.fileOperations.enabled ? "Yes" : "No"}`,
        `  Outside project only: ${config.fileOperations.outsideProjectOnly ? "Yes" : "No"}`,
        `  Tools: ${config.fileOperations.tools.join(", ")}`,
        `  Allowed paths: ${config.fileOperations.allowedPaths.length > 0 ? config.fileOperations.allowedPaths.join(", ") : "(none)"}`,
      ];

      ctx.ui.setWidget("supersafety", lines);
      ctx.ui.notify("Supersafety config displayed", "info");
    },
  });

  // -----------------------------------------------------------------------
  // /supersafety-enable / /supersafety-disable commands
  // -----------------------------------------------------------------------

  pi.registerCommand("supersafety-enable", {
    description: "Enable supersafety for this session",
    handler: async (_args, ctx) => {
      config = { ...config, enabled: true };
      sandboxAvailable = !!(config.bash.sandbox.enabled && config.bash.sandbox.startPath);
      updateStatus(ctx);
      ctx.ui.notify("Supersafety enabled", "success");
    },
  });

  pi.registerCommand("supersafety-disable", {
    description: "Disable supersafety for this session",
    handler: async (_args, ctx) => {
      config = { ...config, enabled: false };
      ctx.ui.setStatus("supersafety", ctx.ui.theme.fg("warning", "🛡️ Supersafety: disabled"));
      ctx.ui.notify("Supersafety disabled", "warning");
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a command uses shell features that require cmd.exe /c to interpret.
 * Simple commands (e.g. "notepad.exe", "ping localhost") can run directly.
 */
function needsShell(command: string): boolean {
  // Matches pipes, redirects, &&/||/;, variable expansion, subshells, backticks
  return /[|&<>];`\$/.test(command);
}

/**
 * Wrap a bash command for sandboxed execution.
 */
function wrapBashForSandbox(command: string, sandboxConfig: SandboxieConfig): string | undefined {
  if (!sandboxConfig.enabled || !sandboxConfig.startPath) {
    return undefined;
  }

  const boxFlag = `/box:${sandboxConfig.boxName}`;
  // Convert to Git Bash native path (/c/Program Files/...) so bash resolves it.
  const startPath = sandboxConfig.startPath
    .replace(/^([A-Za-z])\\/, (_, drive) => `/${drive.toLowerCase()}/`)
    .replace(/\\/g, "/");
  // MSYS_NO_PATHCONV=1 prevents Git Bash from converting flags like /wait into
  // paths (e.g. /wait → C:/Program Files/Git/wait) which Start.exe can't resolve.
  const prefix = `MSYS_NO_PATHCONV=1 "${startPath}" ${boxFlag} /wait /silent`;

  if (needsShell(command)) {
    // Shell features need cmd.exe /c to interpret pipes, redirects, etc.
    const escaped = command.replace(/"/g, '""');
    return `${prefix} cmd.exe /c "${escaped}"`;
  }
  // Simple command — run directly, no cmd window flash
  return `${prefix} ${command}`;
}
