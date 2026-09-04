# THIRD-PARTY NOTICES

EasySSH Desktop includes software derived from or incorporating open-source components,
including **electerm** and its dependencies.

## electerm

- Project: https://github.com/electerm/electerm
- License: MIT (see `LICENSE` in this repository, retained from upstream)
- Copyright: Copyright (c) 2017-present electerm contributors
- Usage: EasySSH is a fork of electerm. The electerm MIT License text and its
  copyright notice are preserved verbatim in this repository's `LICENSE` file.
  Git history (upstream baseline branches and EasySSH commits) is retained as-is
  for provenance and license compliance.

## npm dependencies

All npm packages used by this project are licensed by their respective authors.
Full license texts are available in `node_modules/<package>/LICENSE` (or
equivalent) for each dependency. Key runtime dependencies include:

- `@electerm/ssh2` — MIT — SSH/SFTP protocol implementation (used unmodified as a
  stable underlying dependency; its name is retained for compatibility and
  maintenance reasons and is not visible in the product UI)
- `@xterm/xterm` and addons — MIT — terminal emulation
- `react` / `react-dom` — MIT
- `antd` — MIT
- `codemirror` / `@codemirror/*` — MIT
- `node-pty` — MIT — PTY support
- Electron — MIT (Chromium/Node.js components under their own licenses)

## Product / internal naming

- **Product name**: EasySSH (user-facing)
- **Internal namespace for EasySSH-authored code**: `kjsy` / `easyssh`
- **Upstream**: electerm — retained for upstream tracking, license compliance
  and merge reference only; not promoted in the product UI.

See `docs/upstream.md` for the internal engineering provenance document.
