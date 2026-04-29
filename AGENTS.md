# pi-supersafety

Comprehensive safety extension for [pi](https://github.com/badlogic/pi-mono) that requires user approval before executing commands and file operations, with Sandboxie integration for sandboxed execution.

## Architecture

```
pi-supersafety/
├── index.ts                          # Main extension entry point
├── config.ts                         # Config types, defaults, loading (global + project merge)
├── approval.ts                       # Approval dialogs (bash: Allow/Deny/Sandboxed, files: Allow/Deny)
├── sandbox.ts                        # Sandboxie Start.exe wrapper (wrapWithSandbox, execCommand)
├── AGENTS.md                         # This file
├── README.md                         # User-facing documentation
├── sandstart.html                    # Reference: Sandboxie Start.exe command-line docs
└── skills/
    └── sandboxie-boxing/
        └── SKILL.md                  # Bundled skill teaching the LLM about Sandboxie
```

## Module Responsibilities

- **`config.ts`** — Defines `SupersafetyConfig`, `BashSafetyConfig`, `FileSafetyConfig`, `SandboxieConfig`. Loads from `~/.pi/agent/extensions/supersafety.json` (global) and `<cwd>/.pi/supersafety.json` (project). Auto-detects Sandboxie `Start.exe` path. Deep-merges configs (defaults < global < project).

- **`approval.ts`** — `approveBashCommand()` shows Allow/Deny/Run Sandboxed dialog. `approveFileOperation()` shows Allow/Deny dialog. Both use `ctx.ui.select()` with 2-minute timeout. Non-interactive mode blocks by default.

- **`sandbox.ts`** — `wrapWithSandbox()` wraps a command string via `Start.exe /box:Name /wait /silent cmd /c "..."`. Converts Windows paths to Git Bash native format (`/c/...`). `execCommand()` is a standalone executor (not currently used by the extension, available for future use). Handles process tree killing on Windows via `taskkill /T /F`.

- **`index.ts`** — Main extension. Registers:
  - `tool_call` handler: intercepts `bash`, `write`, `edit` tools
  - `user_bash` handler: intercepts `!` and `!!` user commands
  - `session_start` handler: loads config, sets status bar
  - `resources_discover` handler: registers bundled skill
  - Commands: `/supersafety`, `/supersafety-enable`, `/supersafety-disable`
  - Flag: `--no-supersafety`

## Configuration

Default config (all features enabled, Claude Code style):

```json
{
  "enabled": true,
  "bash": {
    "enabled": true,
    "checkProjectFolder": true,
    "sandbox": {
      "enabled": true,
      "boxName": "DefaultBox",
      "startPath": null
    }
  },
  "fileOperations": {
    "enabled": true,
    "outsideProjectOnly": true,
    "tools": ["write", "edit", "bash"],
    "allowedPaths": []
  }
}
```

Key flags:
- `bash.checkProjectFolder: true` → ALL commands need approval (Claude Code style)
- `bash.checkProjectFolder: false` → Only destructive commands (`rm -rf`, `sudo`, `format`, etc.) need approval
- `fileOperations.outsideProjectOnly: true` → Only paths outside the project directory need approval
- `fileOperations.outsideProjectOnly: false` → ALL file writes/edits need approval

## Destructive Command Patterns

These patterns always trigger approval regardless of `checkProjectFolder`:
- `rm -rf`, `rm --recursive`
- `format`, `diskpart`, `mkfs`
- `shutdown`, `reboot`
- `sudo`
- `chmod/chown 777`
- `del /s`, `rd /s /q` (Windows)
- `kill -9`

## Development Workflow

### Git

- Git is already configured globally (commit signing, user settings, etc.)
- There is **no remote** configured yet
- **`main`** — Stable releases
- **`dev`** — Feature work and experimentation

### Branching Strategy

1. Start feature work on `dev`
2. When a feature is complete and tested, merge `dev` → `main`
3. Keep `dev` and `main` in sync after merges

### Testing

Test the extension with:
```bash
pi -e "./index.ts"
```

Or install to global extensions for auto-discovery:
```
~/.pi/agent/extensions/pi-supersafety/
```

### Key Implementation Notes

- The extension uses `jiti` for TypeScript loading — no compilation needed
- The `tool_call` event handler mutates `event.input.command` in-place for sandboxed execution
- The `user_bash` handler wraps `createLocalBashOperations()` to inject sandboxing
- Path resolution strips leading `@` (some LLMs prepend `@` to paths)
- `isInsideProject()` uses directory-boundary matching to avoid false positives
- Approval dialogs have a 2-minute timeout that auto-denies on expiry
- Status bar shows active protections: `🛡️ Supersafety: bash, files, sandbox(DefaultBox)`

### Sandboxing Implementation

The bash tool uses Git Bash (`/usr/bin/bash`), which requires special handling for Sandboxie:

- **Path conversion** — Windows paths (`C:\Program Files\...`) are converted to Git Bash native format (`/c/Program Files/...`) so bash can resolve them
- **`MSYS_NO_PATHCONV=1`** — Must be set to prevent Git Bash's MSYS layer from converting Start.exe flags like `/wait` into bogus paths (e.g. `/wait` → `C:/Program Files/Git/wait`)
- **Smart shell detection** — `needsShell()` checks for pipes, redirects, `&&`, `||`, `;`, `$`, backticks. Simple commands (e.g. `notepad.exe`) run directly through Start.exe (no cmd window flash). Shell-heavy commands get the `cmd.exe /c` wrapper
- **`wrapBashForSandbox()`** (in `index.ts`) is the actual wrapper used by the extension. `wrapWithSandbox()` in `sandbox.ts` is an equivalent standalone version for `execCommand()`
- **Sandboxie-Plus** — The config `startPath` must point to the correct install (`Sandboxie-Plus\Start.exe`, not just `Sandboxie\Start.exe`)
