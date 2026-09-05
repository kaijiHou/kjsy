<h1 align="center">EasySSH Desktop</h1>

<p align="center">
  A focused SSH/SFTP desktop workspace for lab remote servers.
</p>

EasySSH Desktop is a terminal / SSH / SFTP client for Linux, macOS and Windows, designed around the daily workflow of research labs: connect to GPU servers, run long jobs, browse and edit remote files, watch GPU usage.

Built for real-world lab environments:

- **Zero server-side installation** — only SSH/SFTP on the remote host is required.
- **Works with old Linux servers** — old OpenSSH, old glibc.
- **One connection, one window** — every connection opens its own independent workspace window; opening another connection never disturbs the current one.

## Features

- SSH terminal (xterm.js) with multiple terminal tabs per connection
- Remote file Explorer with lazy-loading tree, follows the active terminal's working directory
- Remote file editing (CodeMirror 6) with Ctrl+S save-back over SFTP
- Remote log monitoring (live tail over an isolated exec channel)
- Remote task runner (start/stop long-running commands, view output)
- GPU status panel (nvidia-smi based, polling)
- Per-connection workspace windows with independent terminals, explorers, editors and panels
- Connection profiles with groups, default remote path, and safe onboarding for first-time users
- Encrypted local storage of connection secrets (OS-level keychain / DPAPI)

## Install

Download the latest installer from [Releases](https://github.com/kaijiHou/kjsy/releases) and install it.

## Dev

Requires Node.js 22.12+.

```bash
git clone https://github.com/kaijiHou/kjsy.git
cd kjsy
npm config set legacy-peer-deps true
npm i

# build client + copy main process files into work/app
npm run b

# run the app
npm run t
```

## Test

```bash
# unit tests for the EasySSH modules
node --test scripts/tests/
```

## Credits & License

EasySSH Desktop is a fork of [electerm](https://github.com/electerm/electerm) by ZHAO Xudong.
Huge thanks to electerm and its community — the SSH/SFTP/session core, terminal layer and much of the UI foundation come from upstream electerm (MIT).

Licensed under the MIT License. Upstream copyright notices are kept intact, see [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
