/**
 * Approval dialogs for bash commands and file operations.
 *
 * Provides a unified approval flow with:
 * - Bash commands: Allow / Deny / Run Sandboxed (if configured)
 * - File operations: Allow / Deny
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { SandboxieConfig } from "./config";

// ---------------------------------------------------------------------------
// Bash approval
// ---------------------------------------------------------------------------

export interface BashApprovalResult {
  /** Whether the command was approved */
  approved: boolean;
  /** Whether the user chose to run sandboxed */
  sandboxed: boolean;
  /** If user chose "Allow all X commands", the category to auto-approve for the session */
  allowAllCategory?: string;
}

/**
 * Show approval dialog for a bash command.
 * Returns { approved: true, sandboxed: boolean } or { approved: false, sandboxed: false }
 */
export async function approveBashCommand(
  ctx: ExtensionContext,
  command: string,
  sandboxConfig: SandboxieConfig,
  cwd: string,
): Promise<BashApprovalResult> {
  if (!ctx.hasUI) {
    // In non-interactive mode, block by default
    return { approved: false, sandboxed: false };
  }

  const isOutsideProject = !resolvePath(command, cwd).startsWith(cwd);
  const locationTag = isOutsideProject ? " (outside project)" : "";

  // Detect command category for "Allow all" option
  const category = detectCommandCategory(command);

  // Build options
  const options: string[] = ["Allow", "Deny"];
  if (category) {
    options.push(`Allow All ${category} Commands`);
  }
  if (sandboxConfig.enabled && sandboxConfig.startPath) {
    options.push(`Run Sandboxed (${sandboxConfig.boxName})`);
  }

  // Truncate long commands for display
  const displayCommand = command.length > 200
    ? command.slice(0, 200) + "..."
    : command;

  const title = `🛡️ Supersafety: Bash Command${locationTag}`;
  const message = `Allow execution?\n\n  ${displayCommand}`;

  const choice = await ctx.ui.select(title, options, { timeout: 120000 });

  if (choice === "Allow") {
    return { approved: true, sandboxed: false };
  }
  if (choice?.startsWith("Run Sandboxed")) {
    return { approved: true, sandboxed: true };
  }
  if (category && choice === `Allow All ${category} Commands`) {
    return { approved: true, sandboxed: false, allowAllCategory: category };
  }

  // "Deny" or timeout/cancel
  return { approved: false, sandboxed: false };
}

// ---------------------------------------------------------------------------
// File operation approval
// ---------------------------------------------------------------------------

export interface FileApprovalResult {
  approved: boolean;
}

/**
 * Show approval dialog for a file operation outside the project directory.
 */
export async function approveFileOperation(
  ctx: ExtensionContext,
  toolName: string,
  filePath: string,
  cwd: string,
): Promise<FileApprovalResult> {
  if (!ctx.hasUI) {
    return { approved: false };
  }

  const verb = toolName === "write" ? "Write to" : toolName === "edit" ? "Edit" : "Modify";

  const title = `🛡️ Supersafety: File Operation (outside project)`;
  const message = `Allow ${verb.toLowerCase()}?\n\n  ${verb} ${filePath}`;

  const choice = await ctx.ui.select(title, ["Allow", "Deny"], { timeout: 120000 });

  if (choice === "Allow") {
    return { approved: true };
  }
  return { approved: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Try to extract a file path from a command for display purposes.
 * Not used for actual path checking — just for the location tag.
 */
function resolvePath(_command: string, cwd: string): string {
  // For bash commands, we can't reliably extract paths from arbitrary shell commands.
  // We use the cwd as the reference point.
  return cwd;
}

// ---------------------------------------------------------------------------
// Command category detection
// ---------------------------------------------------------------------------

/**
 * Known command categories that can be auto-approved for a session.
 * These are common development tools that are generally safe to run repeatedly.
 */
const KNOWN_CATEGORIES = new Set([
  "git",
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "bun",
  "pip",
  "pip3",
  "cargo",
  "docker",
  "docker-compose",
  "go",
  "gradle",
  "mvn",
  "make",
  "cmake",
  "dotnet",
  "composer",
  "flutter",
  "dart",
  "vite",
  "webpack",
  "next",
  "nuxt",
  "astro",
]);

/**
 * Detect the command category (e.g. "git", "npm") from a bash command.
 * Returns the category name (capitalized) or undefined if not recognized.
 */
export function detectCommandCategory(command: string): string | undefined {
  // Extract the first word/token from the command
  const firstToken = command.trim().split(/\s+/)[0];
  // Strip any path prefix (e.g. "/usr/bin/git" or "./node_modules/.bin/next")
  const basename = firstToken.split(/[\\/]/).pop() ?? firstToken;
  const lower = basename.toLowerCase();
  if (KNOWN_CATEGORIES.has(lower)) {
    return lower === "npm" || lower === "npx" || lower === "yarn" || lower === "pnpm" || lower === "pip" || lower === "pip3" || lower === "mvn" || lower === "go"
      ? lower
      : lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return undefined;
}
