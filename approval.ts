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

  // Build options
  const options = ["Allow", "Deny"];
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
