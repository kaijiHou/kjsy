/**
 * EasySSH Feature Flags
 * 收敛与实验室工作流无关的入口（先隐藏，不删底层代码）。
 */
export const features = {
  // 实验室核心能力
  ssh: true,
  sftp: true,
  terminal: true,
  transfer: true,

  // 与本产品无关的协议（先隐藏）
  rdp: false,
  vnc: false,
  telnet: false,
  ftp: false,
  serial: false,
  spice: false,

  // 云/AI 能力（先隐藏）
  cloudSync: false,
  ai: false
}
