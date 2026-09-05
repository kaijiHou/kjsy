<h1 align="center">EasySSH Desktop</h1>

<p align="center">
  面向实验室远程服务器的 SSH/SFTP 桌面工作台
</p>

EasySSH Desktop 是一个面向 Linux / macOS / Windows 的终端 / SSH / SFTP 客户端，围绕科研实验室的日常工作流设计：连接 GPU 服务器、跑长任务、浏览和编辑远程文件、监控 GPU 状态。

为真实实验室环境打造：

- **服务器端零安装** —— 远程机器只需要有 SSH/SFTP。
- **兼容老旧 Linux 服务器** —— 老 OpenSSH、老 glibc 都能连。
- **一个连接一个窗口** —— 每个连接打开独立的工作区窗口，连接另一个服务器绝不会干扰当前连接。

## 功能

- SSH 终端（xterm.js），每个连接支持多个终端 tab
- 远程文件 Explorer：懒加载目录树，跟随当前终端工作目录
- 远程文件编辑（CodeMirror 6），Ctrl+S 通过 SFTP 写回
- 远程日志监控（独立 exec 通道的实时 tail）
- 远程任务面板（启动/停止长运行命令，查看输出）
- GPU 状态面板（基于 nvidia-smi，支持轮询）
- 每个连接独立的工作区窗口：终端、Explorer、编辑器、面板互不干扰
- 连接配置管理：分组、默认远程目录、新用户安全引导
- 连接密钥本地加密存储（系统级 keychain / DPAPI）

## 安装

从 [Releases](https://github.com/kaijiHou/kjsy/releases) 下载最新安装包安装即可。

## 开发

需要 Node.js 22.12+。

```bash
git clone https://github.com/kaijiHou/kjsy.git
cd kjsy
npm config set legacy-peer-deps true
npm i

# 构建前端并把主进程代码复制到 work/app
npm run b

# 运行应用
npm run t
```

## 测试

```bash
# EasySSH 自研模块单元测试
node --test scripts/tests/
```

## 致谢与许可

EasySSH Desktop 基于 [electerm](https://github.com/electerm/electerm)（作者 ZHAO Xudong）fork 而来。
非常感谢 electerm 及其社区 —— SSH/SFTP 会话核心、终端层以及大量 UI 基础来自上游 electerm（MIT）。

基于 MIT 许可证开源。上游版权声明完整保留，见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
