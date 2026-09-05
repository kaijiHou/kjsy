/**
 * Default EasySSH lab connection.
 *
 * Keep the password out of the shipped application. The SSH session asks for
 * it interactively on first connect, and users can save it through the normal
 * bookmark editor if they choose to.
 */

const DEFAULT_EASYSSH_BOOKMARK_ID = 'easyssh-default-demo'

const DEFAULT_EASYSSH_BOOKMARK = {
  _id: DEFAULT_EASYSSH_BOOKMARK_ID,
  title: 'demo / lab-server',
  type: 'ssh',
  host: '203.0.113.10',
  port: 2222,
  username: 'demo',
  authType: 'password',
  enableSsh: true,
  enableSftp: true,
  useSshAgent: false,
  term: 'xterm-256color',
  encode: 'utf-8',
  envLang: 'en_US.UTF-8',
  color: '#0088cc',
  description: '首次连接时输入 SSH 密码；程序不会内置密码。',
  easysshGroup: 'demo',
  easysshGpuModel: 'RTX 3090',
  easysshGpuCount: 2,
  // The lab container is mounted from this host directory.  /home/demo is
  // intentionally not used as the Explorer start page because it is empty on
  // the target host while the useful files live below /home/demo/llm.
  easysshDefaultRemotePath: '/home/demo/llm',
  easysshFavorite: true,
  easysshTags: ['demo', 'llm-container'],
  easysshMonitorEnabled: true
}

module.exports = {
  DEFAULT_EASYSSH_BOOKMARK_ID,
  DEFAULT_EASYSSH_BOOKMARK
}
