# pi-supersafety

Comprehensive safety extension for [pi](https://github.com/badlogic/pi-mono) that requires approval before executing commands and file operations.

## Features

- **Bash command approval** — Every bash command requires user approval before execution (Claude Code style)
- **User command approval** — `!` and `!!` user commands are also gated with the same rules
- **File operation gating** — Write/edit operations outside the project directory require approval
- **Sandboxie integration** — "Run Sandboxed" option launches commands inside a Sandboxie sandbox *(Windows only — see [macOS/Linux note](#macos--linux-users))*
- **Destructive command detection** — Commands like `rm -rf`, `sudo`, `format` are always flagged
- **Session-level auto-approval** — "Allow All [Category]" lets you approve a whole tool category (e.g. all `git` or `npm` commands) for the current session
- **Deny with reason** — Type a message that is sent back to the agent explaining why the command was blocked
- **Flexible configuration** — Global + per-project config, master on/off switch
- **Bundled skill** — `sandboxie-boxing` skill teaches the LLM about sandboxed execution

## Installation

Install via pi directly:

```bash
pi install npm:pi-supersafety
```

Or copy this directory to your pi extensions folder:

```
~/.pi/agent/extensions/pi-supersafety/
```

Or reference it directly:

```bash
pi -e "./path/to/pi-supersafety/index.ts"
```

## Configuration

Create a config file at one of these locations (project overrides global):

**Global:** `~/.pi/agent/extensions/supersafety.json`
**Project:** `<project>/.pi/supersafety.json`

```json
{
  "enabled": true,
  "bash": {
    "enabled": true,
    "checkProjectFolder": true,
    "sandbox": {
      "enabled": true,
      "boxName": "DefaultBox",
      "startPath": "C:\\Program Files\\Sandboxie-Plus\\Start.exe"
    }
  },
  "fileOperations": {
    "enabled": true,
    "outsideProjectOnly": true,
    "tools": ["write", "edit"],
    "allowedPaths": []
  }
}
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Master on/off switch for all safety features |
| `bash.enabled` | `true` | Enable bash command approval |
| `bash.checkProjectFolder` | `true` | When `true`, ALL commands need approval. When `false`, only destructive commands are checked |
| `bash.sandbox.enabled` | `true` | Offer "Run Sandboxed" option in approval dialog |
| `bash.sandbox.boxName` | `"DefaultBox"` | Name of the Sandboxie box to use |
| `bash.sandbox.startPath` | auto-detected | Path to Sandboxie `Start.exe` |
| `fileOperations.enabled` | `true` | Enable file operation approval |
| `fileOperations.outsideProjectOnly` | `true` | When `true`, only file ops outside project need approval. When `false`, ALL file ops need approval |
| `fileOperations.tools` | `["write", "edit"]` | Which tools to gate |
| `fileOperations.allowedPaths` | `[]` | Paths that always bypass approval |

## Approval Dialogs

### Bash Commands

When a bash command needs approval you will see up to **five options** (some are conditional):

| Option | When shown | Description |
|--------|-----------|-------------|
| **Allow** | Always | Run the command normally |
| **Deny** | Always | Block the command |
| **Allow All [Category] Commands** | When the command matches a known tool (e.g. `git`, `npm`, `docker`) | Approve all commands of that category for the rest of the session — no more prompts for `git status`, `git push`, etc. |
| **Run Sandboxed (BoxName)** | When `bash.sandbox.enabled` is `true` and `Start.exe` is found | Run the command inside a Sandboxie sandbox |
| **Type reason…** | Always | Opens an inline text editor — your message is sent to the agent as the denial reason, guiding its next step |

### File Operations

When a file write or edit needs approval you will see **three options**:

| Option | Description |
|--------|-------------|
| **Allow** | Proceed with the file operation |
| **Deny** | Block the operation |
| **Type reason…** | Deny and send a typed message back to the agent |

## Commands

| Command | Description |
|---------|-------------|
| `/supersafety` | Show current configuration and status |
| `/supersafety-enable` | Enable supersafety for this session |
| `/supersafety-disable` | Disable supersafety for this session |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--no-supersafety` | Disable supersafety entirely |

## Disabling

To disable the extension:

1. **Per session:** Use `/supersafety-disable`
1. **Per project:** Set `"enabled": false` in `.pi/supersafety.json`
1. **Globally:** Set `"enabled": false` in `~/.pi/agent/extensions/supersafety.json`
1. **Via CLI:** Run `pi --no-supersafety`

## Sandboxie Setup (Windows)

For the sandbox feature to work:

1. Install [Sandboxie-Plus](https://sandboxie-plus.com/)
2. Ensure `Start.exe` is in one of the standard locations (auto-detected)
3. Or specify the path in config: `"startPath": "C:\\Program Files\\Sandboxie-Plus\\Start.exe"`

> **Note:** Sandboxie is a Windows-only tool. See the section below if you are on macOS or Linux.

## macOS / Linux Users

The Sandboxie sandbox integration is **Windows-only**. On macOS or Linux you should disable it to avoid unnecessary warnings:

```json
{
  "bash": {
    "sandbox": {
      "enabled": false
    }
  }
}
```

All other features (command approval, file operation gating, deny-with-reason, session allow-all) work normally on every platform.

For sandboxed execution on macOS or Linux you can use a compatible pi sandbox extension instead.  
The official pi repository includes an [example sandbox extension](https://github.com/badlogic/pi-mono/tree/main/examples/extensions) that you can use as a starting point, or search for a community extension that wraps a platform-native sandbox (e.g. `firejail`, `bubblewrap`, or macOS Sandbox).

## Bundled Skill

The `sandboxie-boxing` skill is automatically registered and available via `/skill:sandboxie-boxing`. It provides the LLM with comprehensive documentation about Sandboxie `Start.exe` commands and usage patterns.
