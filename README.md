<p align="center"><img src="assets/logo.png" width="110" alt="Gantry" /></p>

# Gantry

A desktop code editor with a warm charcoal workbench, amber accents, and room to focus.

Open a real project, edit its files in Monaco, and run your own build commands. The first release targets Windows x64.

## Run locally

Requires Node.js 22.12+ or 24+, npm, and Windows 10/11.

```sh
npm ci
npm run dev
```

To build and launch without the development server:

```sh
npm run build
npm start
```

Create the portable Windows application with `npm run package`. The executable is written to `release/Gantry-0.1.0-x64.exe`; the unpacked application is in `release/win-unpacked/`.

## At the workbench

- Open a folder from the header or press **Ctrl+O**. The Project Index loads folders as you expand them.
- Open several files, edit independently, and save with **Ctrl+S**. **Ctrl+Shift+S** opens Save As. Undo history stays with each tab.
- Find a file with **Ctrl+P**, or a command with **Ctrl+K** / **Ctrl+Shift+P**. Monaco provides **Ctrl+F** for find and **Ctrl+H** for replace.
- Use **Ctrl+N** for a new file and **Ctrl+W** to close the active tab. Unsaved changes offer Save, Discard, and Cancel.
- Toggle the Project Index with **Ctrl+B** and the bottom tray with **Ctrl+J**. Drag their dividers to resize them.
- Open Settings with **Ctrl+,** to change the font size, wrap long lines, and configure Build/Run commands. Commands use the Windows command shell in the selected project folder. They run only when you start them.
- Select Terminal and click **Start terminal** for an interactive PowerShell session. The terminal uses a real PTY. Stopping tasks or closing the app cleans up owned processes.

## Recovery and file safety

Preferences, recent projects, local task commands, and open buffers are saved under Electron's user-data directory (`%APPDATA%/Gantry` on Windows). Unsaved edits are snapshotted after a short idle period and recovered at startup. Graceful close still asks what to do with unsaved files. Recovery is not a substitute for saving or backups: abrupt termination can lose the last fraction of a second of typing.

Saves compare disk revisions before replacing files. External changes to a clean active file are reloaded; conflicts with unsaved edits offer Reload or Save As. Files are UTF-8, with BOM and line endings preserved. Binary files and text files above 8 MiB are rejected.

The tree displays up to 4,000 entries per folder and omits symlinks. Quick Open scans at most 20,000 entries, returns at most 150 matches, and skips common dependency/build folders. Use folder expansion for files outside those search results. Up to 80 tabs and a 64 MiB recovery snapshot are supported.

## Current scope

Monaco supplies syntax coloring and built-in web-language features. Gantry does not yet provide general language servers, VS Code extensions, a debugger, compiler-diagnostic parsing, or Git integration. Build output and exit codes come from the actual process. The Windows build is unsigned. Other operating systems have not been verified.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover file boundaries, UTF-8 preservation, conflicting saves, recovery serialization, and malformed session recovery. `npm run format` formats the source.
