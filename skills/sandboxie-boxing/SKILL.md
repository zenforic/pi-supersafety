---
name: sandboxie-boxing
description: Run programs inside a Sandboxie sandbox for isolated, safe execution. Use when you need to run untrusted programs, test potentially destructive commands, or isolate processes from the host system. Requires Sandboxie-Plus to be installed.
---

# Sandboxie Boxing

Run programs inside a Sandboxie sandbox using the `Start.exe` command-line tool.

## Overview

Sandboxie isolates programs in a contained environment, preventing them from making permanent changes to the host system. Files created by sandboxed programs are stored in the sandbox folder and can be recovered or deleted.

## Start.exe Command Reference

The Sandboxie Start program (`Start.exe`) launches programs under sandbox supervision.

### Basic Usage

```cmd
"C:\Program Files\Sandboxie\Start.exe" program.exe
"C:\Program Files\Sandboxie\Start.exe" notepad.exe
```

### Specify a Sandbox Box

```cmd
"C:\Program Files\Sandboxie\Start.exe" /box:MyBox program.exe
```

If `/box` is omitted, the default sandbox `DefaultBox` is used.

### Wait for Completion

Use `/wait` to have Start.exe block until the program exits, returning its exit code:

```cmd
"C:\Program Files\Sandboxie\Start.exe" /wait cmd.exe /c "my_script.bat"
```

To chain with Windows `start /wait` for proper exit code propagation:

```cmd
start /wait "C:\Program Files\Sandboxie\Start.exe" /wait cmd /c exit 9
echo %ERRORLEVEL%
```

### Silent Mode

Use `/silent` to suppress pop-up error messages:

```cmd
"C:\Program Files\Sandboxie\Start.exe" /silent program.exe
```

### Elevated Privileges

Use `/elevate` to run with Administrator privileges (when UAC is enabled):

```cmd
"C:\Program Files\Sandboxie\Start.exe" /elevate cmd.exe
```

### Environment Variables

Pass environment variables with `/env`:

```cmd
"C:\Program Files\Sandboxie\Start.exe" /env:MY_VAR=value program.exe
"C:\Program Files\Sandboxie\Start.exe" /env:PATH="C:\custom\bin;%PATH%" program.exe
```

### Hide Window

Start a program without displaying its window:

```cmd
"C:\Program Files\Sandboxie\Start.exe" /hide_window cmd.exe /c automated_script.bat
```

### Combined Parameters

Parameters can be combined in any order:

```cmd
"C:\Program Files\Sandboxie\Start.exe" /box:TestBox /silent /wait myprogram.exe --arg1 --arg2
```

### Special Program Names

```cmd
"C:\Program Files\Sandboxie\Start.exe" default_browser
"C:\Program Files\Sandboxie\Start.exe" mail_agent
"C:\Program Files\Sandboxie\Start.exe" run_dialog
"C:\Program Files\Sandboxie\Start.exe" start_menu
```

### Prompt for Sandbox Selection

Use `/box:__ask__` to show the sandbox selection dialog:

```cmd
"C:\Program Files\Sandboxie\Start.exe" /box:__ask__ program.exe
```

## Other Start.exe Commands

### List Running Programs

```cmd
"C:\Program Files\Sandboxie\Start.exe" /listpids
"C:\Program Files\Sandboxie\Start.exe" /box:MyBox /listpids
```

Output: number of programs, then one PID per line.

### Terminate Programs

```cmd
"C:\Program Files\Sandboxie\Start.exe" /terminate           # DefaultBox
"C:\Program Files\Sandboxie\Start.exe" /box:MyBox /terminate # Specific box
"C:\Program Files\Sandboxie\Start.exe" /terminate_all        # All boxes
```

### Delete Sandbox Contents

```cmd
"C:\Program Files\Sandboxie\Start.exe" delete_sandbox
"C:\Program Files\Sandboxie\Start.exe" /box:MyBox delete_sandbox
"C:\Program Files\Sandboxie\Start.exe" delete_sandbox_silent
```

### Reload Configuration

```cmd
"C:\Program Files\Sandboxie\Start.exe" /reload
```

## Common Start.exe Paths

Sandboxie Start.exe is typically installed at one of:

- `C:\Program Files\Sandboxie\Start.exe`
- `C:\Program Files\Sandboxie-Plus\Start.exe`
- `C:\Program Files (x86)\Sandboxie\Start.exe`
- `C:\Program Files (x86)\Sandboxie-Plus\Start.exe`

## Exit Codes

- `0` — Success
- Non-zero — Failure

In batch files, check with `IF ERRORLEVEL`.

## Security Notes

- Sandboxie prevents sandboxed programs from modifying the host filesystem outside the sandbox
- Network access depends on Sandboxie configuration (can be restricted)
- Sandboxed programs can still see host resources (registry, drives) unless configured otherwise
- Files created in the sandbox are stored in `%PROGRAMDATA%\Sandbox\[BoxName]\`

## Tips for Automation

When running commands that need to wait for completion and capture exit codes:

```cmd
start /wait "C:\Program Files\Sandboxie\Start.exe" /box:DefaultBox /wait /silent cmd /c "your_command_here"
echo Exit code: %ERRORLEVEL%
```

The double `start /wait` + `/wait` pattern ensures:
1. The outer `start /wait` waits for Start.exe to finish
2. The `/wait` flag makes Start.exe wait for the child process
3. The exit code propagates all the way back
