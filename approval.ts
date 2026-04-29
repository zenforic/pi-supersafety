/**
 * Approval dialogs for bash commands and file operations.
 *
 * Provides a unified approval flow with:
 * - Bash commands: Allow / Deny / Deny with reason / Run Sandboxed (if configured)
 * - File operations: Allow / Deny / Deny with reason
 * - "Deny with reason" lets user type a message sent to the agent before blocking
 */

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, truncateToWidth } from "@mariozechner/pi-tui";
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
  /** Optional reason message when user denied with a note */
  message?: string;
}

/**
 * Show approval dialog for a bash command.
 * Returns { approved: true, sandboxed: boolean } or { approved: false, sandboxed: false }
 * Optionally includes a message when user denies with a reason.
 */
export async function approveBashCommand(
  ctx: ExtensionContext,
  command: string,
  sandboxConfig: SandboxieConfig,
  cwd: string,
): Promise<BashApprovalResult> {
  if (!ctx.hasUI) {
    return { approved: false, sandboxed: false };
  }

  const isOutsideProject = !resolvePath(command, cwd).startsWith(cwd);
  const locationTag = isOutsideProject ? " (outside project)" : "";

  const category = detectCommandCategory(command);

  // Build display options (without "Type reason..." — that's handled in the component)
  const displayOptions: ApprovalOption[] = [
    { label: "Allow", action: "allow" },
    { label: "Deny", action: "deny" },
  ];
  if (category) {
    displayOptions.push({ label: `Allow All ${category} Commands`, action: `allow-all:${category}` });
  }
  if (sandboxConfig.enabled && sandboxConfig.startPath) {
    displayOptions.push({ label: `Run Sandboxed (${sandboxConfig.boxName})`, action: "sandbox" });
  }
  // "Type reason..." always last
  displayOptions.push({ label: "Type reason...", action: "reason" });

  const displayCommand = command.length > 200
    ? command.slice(0, 200) + "..."
    : command;

  const title = `Bash Command${locationTag}`;
  const subtitle = `Allow execution?\n\n  ${displayCommand}`;

  const result = await showApprovalDialog(ctx, title, subtitle, displayOptions);
  return processApprovalResult(result);
}

// ---------------------------------------------------------------------------
// File operation approval
// ---------------------------------------------------------------------------

export interface FileApprovalResult {
  approved: boolean;
  /** Optional reason message when user denied with a note */
  message?: string;
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

  const title = `File Operation (outside project)`;
  const subtitle = `Allow ${verb.toLowerCase()}?\n\n  ${verb} ${filePath}`;

  const displayOptions: ApprovalOption[] = [
    { label: "Allow", action: "allow" },
    { label: "Deny", action: "deny" },
    { label: "Type reason...", action: "reason" },
  ];

  const result = await showApprovalDialog(ctx, title, subtitle, displayOptions);
  return processFileApprovalResult(result);
}

// ---------------------------------------------------------------------------
// Shared approval dialog component
// ---------------------------------------------------------------------------

interface ApprovalOption {
  label: string;
  action: string;
}

interface ApprovalDialogResult {
  action: string;
  message?: string;
}

/**
 * Shared approval dialog with optional "Type reason..." input mode.
 * Mirrors Claude Code's deny-with-reason UX.
 */
async function showApprovalDialog(
  ctx: ExtensionContext,
  title: string,
  subtitle: string,
  options: ApprovalOption[],
): Promise<ApprovalDialogResult> {
  return await ctx.ui.custom<ApprovalDialogResult | null>((tui, theme, _kb, done) => {
    let optionIndex = 0;
    let editMode = false;
    let cachedLines: string[] | undefined;

    const editorTheme: EditorTheme = {
      borderColor: (s) => theme.fg("accent", s),
    };
    const editor = new Editor(tui, editorTheme);

    editor.onSubmit = (value) => {
      const trimmed = value.trim();
      if (trimmed) {
        done({ action: "deny", message: trimmed });
      } else {
        // Empty submit — just deny without message
        done({ action: "deny" });
      }
    };

    function refresh() {
      cachedLines = undefined;
      tui.requestRender();
    }

    function handleInput(data: string) {
      if (editMode) {
        if (matchesKey(data, Key.escape)) {
          editMode = false;
          editor.setText("");
          refresh();
          return;
        }
        editor.handleInput(data);
        refresh();
        return;
      }

      if (matchesKey(data, Key.up)) {
        optionIndex = Math.max(0, optionIndex - 1);
        refresh();
        return;
      }
      if (matchesKey(data, Key.down)) {
        optionIndex = Math.min(options.length - 1, optionIndex + 1);
        refresh();
        return;
      }

      if (matchesKey(data, Key.enter)) {
        const selected = options[optionIndex];
        if (selected && selected.action === "reason") {
          editMode = true;
          refresh();
        } else if (selected) {
          done({ action: selected.action });
        }
        return;
      }

      if (matchesKey(data, Key.escape)) {
        done(null);
      }
    }

    function render(width: number): string[] {
      if (cachedLines) return cachedLines;

      const lines: string[] = [];
      const add = (s: string) => lines.push(truncateToWidth(s, width));

      // Top border
      add(theme.fg("accent", "\u2500".repeat(width)));
      // Title with shield icon
      add(theme.fg("accent", theme.bold(` 🛡️ Supersafety: ${title}`)));
      // Subtitle (may be multi-line)
      const subtitleLines = subtitle.split("\n");
      for (const line of subtitleLines) {
        add(theme.fg("text", ` ${line}`));
      }
      lines.push("");

      // Options
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const selected = i === optionIndex;
        const isReason = opt.action === "reason";
        const prefix = selected ? theme.fg("accent", "> ") : "  ";

        if (isReason && editMode) {
          add(prefix + theme.fg("accent", `${i + 1}. ${opt.label} \u270e`));
        } else if (selected) {
          add(prefix + theme.fg("accent", `${i + 1}. ${opt.label}`));
        } else {
          add(`  ${theme.fg("text", `${i + 1}. ${opt.label}`)}`);
        }
      }

      // Editor area
      if (editMode) {
        lines.push("");
        add(theme.fg("muted", " Reason (sent to agent):"));
        for (const line of editor.render(width - 2)) {
          add(` ${line}`);
        }
      }

      lines.push("");
      // Help text
      if (editMode) {
        add(theme.fg("dim", " Enter to submit \u2022 Esc to go back"));
      } else {
        add(theme.fg("dim", " \u2191\u2193 navigate \u2022 Enter to select \u2022 Esc to cancel"));
      }
      // Bottom border
      add(theme.fg("accent", "\u2500".repeat(width)));

      cachedLines = lines;
      return cachedLines;
    }

    return {
      render,
      invalidate: () => { cachedLines = undefined; },
      handleInput,
    };
  });
}

/**
 * Process raw dialog result into BashApprovalResult.
 */
function processApprovalResult(result: ApprovalDialogResult | null): BashApprovalResult {
  if (!result) {
    return { approved: false, sandboxed: false };
  }

  if (result.action === "allow") {
    return { approved: true, sandboxed: false };
  }
  if (result.action === "sandbox") {
    return { approved: true, sandboxed: true };
  }
  if (result.action.startsWith("allow-all:")) {
    const category = result.action.slice("allow-all:".length);
    return { approved: true, sandboxed: false, allowAllCategory: category };
  }
  // "deny" or "deny" with message
  return { approved: false, sandboxed: false, message: result.message || undefined };
}

/**
 * Process raw dialog result into FileApprovalResult.
 */
function processFileApprovalResult(result: ApprovalDialogResult | null): FileApprovalResult {
  if (!result) {
    return { approved: false };
  }

  if (result.action === "allow") {
    return { approved: true };
  }
  // "deny" or "deny" with message
  return { approved: false, message: result.message || undefined };
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
  // version control
  "git",
  // package managers / runtimes
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "bun",
  "pip",
  "pip3",
  "cargo",
  "composer",
  // containers / build
  "docker",
  "docker-compose",
  "go",
  "gradle",
  "mvn",
  "make",
  "cmake",
  "dotnet",
  // mobile / frameworks
  "flutter",
  "dart",
  "vite",
  "webpack",
  "next",
  "nuxt",
  "astro",
  // common read-only / utility commands
  "ls",
  "cat",
  "echo",
  "pwd",
  "find",
  "grep",
  "head",
  "tail",
  "wc",
  "tree",
  "which",
  "where",
  "type",
  "dir",
  "dir /b",
  "stat",
  "file",
  "df",
  "du",
  "uname",
  "hostname",
  "whoami",
  "date",
  "time",
  "env",
  "printenv",
  "set",
  "ver",
  "systeminfo",
  "tasklist",
  "netstat",
  "ping",
  "curl",
  "wget",
  "open",
  "code",
  "code-insiders",
  "nvim",
  "vim",
  "nano",
  "notepad",
  "notepad++",
  "node",
  "python",
  "python3",
  "ruby",
  "php",
  "java",
  "javac",
  "psql",
  "mysql",
  "sqlite3",
  "mongosh",
  "tsc",
  "eslint",
  "prettier",
  "jest",
  "vitest",
  "playwright",
  "cypress",
  "turborepo",
  "turbo",
  "nx",
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
