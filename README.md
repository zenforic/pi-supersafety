# pi-supersafety

Comprehensive safety extension for [pi](https://github.com/badlogic/pi-mono) that requires approval before executing commands and file operations.

## Features

- **Bash command approval** — Every bash command requires user approval before execution (Claude Code style)
- **User command approval** — `!` and `!!` user commands are also gated with the same rules
- **File operation gating** — Write/edit operations outside the project directory require approval
- **Sandboxie integration** — "Run Sandboxed" option launches commands inside a Sandboxie sandbox
- **Destructive command detection** — Commands like `rm -rf`, `sudo`, `format` are always flagged
- **Flexible configuration** — Global + per-project config, master on/off switch
- **Bundled skill** — `sandboxie-boxing` skill teaches the LLM about sandboxed execution

## Installation

Copy this directory to your pi extensions folder:

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
      "startPath": "C:\\Program Files\\Sandboxie\\Start.exe"
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
| `bash.sandbox.startPath` | auto-detected | Path to Sandboxie Start.exe |
| `fileOperations.enabled` | `true` | Enable file operation approval |
| `fileOperations.outsideProjectOnly` | `true` | When `true`, only file ops outside project need approval. When `false`, ALL file ops need approval |
| `fileOperations.tools` | `["write", "edit"]` | Which tools to gate |
| `fileOperations.allowedPaths` | `[]` | Paths that always bypass approval |

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

## Sandboxie Setup

For the sandbox feature to work:

1. Install [Sandboxie-Plus](https://sandboxie-plus.com/)
2. Ensure `Start.exe` is in one of the standard locations (auto-detected)
3. Or specify the path in config: `"startPath": "C:\\Program Files\\Sandboxie\\Start.exe"`

When a command needs approval, you'll see three options:
- **Allow** — Run normally
- **Deny** — Block the command
- **Run Sandboxed (BoxName)** — Run inside Sandboxie

## Bundled Skill

The `sandboxie-boxing` skill is automatically registered and available via `/skill:sandboxie-boxing`. It provides the LLM with comprehensive documentation about Sandboxie Start.exe commands and usage patterns.
