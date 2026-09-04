# EasySSH — Upstream Information

```
Product:            EasySSH（用户可见产品名）
Internal namespace: kjsy（EasySSH 自研代码内部命名空间）
Upstream Project:   electerm（仅保留用于溯源/合规/合并参考，不在产品 UI 展示）
Repository:         https://github.com/electerm/electerm
Upstream Version:   5.0.8 (master tarball, 2026-08-10; newer than release v5.0.6)
Upstream Commit:    790767e (local baseline commit of the pristine upstream source)
License:            MIT (see LICENSE, kept intact)
Fork Start Date:    2026-08-10
```

## Naming Model

```
EasySSH UI (easyssh-*)
     ↓
kjsy adapter/bridge 层（自研新增代码统一 kjsy 命名）
     ↓
existing upstream session/ssh/sftp/xterm core（技术 identifier 保留，不重命名）
```

- 产品 UI：`EasySSH`；自研组件类名：`easyssh-*`
- 自研桥接/兼容代码：`kjsy-*`；自研日志前缀：`[EasySSH]` / `[kjsy:*]`
- 底层稳定标识（`@electerm/ssh2`、npm 包名、DB key、IPC 名称、userData 路径）保留原样，
  避免破坏兼容性与后续 upstream cherry-pick 能力

## Branch Map

```
master              electerm 原版源码（baseline commit 790767e，未修改）
upstream-baseline   原版基线的保护分支（= master）
easyssh/main        EasySSH 开发主线
feature/lab-home    Phase 1 工作分支（实验室服务器首页 + 产品化骨架）
```

## Rules

1. MIT License 与 upstream 版权声明**不得删除**（见仓库 LICENSE）。
2. 内部兼容标识（`@electerm/ssh2`、`electerm` npm 包名、DB key、IPC 名称）保持原样，避免破坏功能。
3. 用户可见品牌（窗口标题、About、打包名、主界面）逐步切换为 EasySSH。
4. 任何改动必须能通过 `git diff` 与原版清晰区分。
