// SSH config using common fields
import { formItemLayout } from '../../../common/form-layout.js'
import { connectionMap, authTypeMap, defaultEnvLang, newBookmarkIdPrefix } from '../../../common/constants.js'
import defaultSetting from '../../../common/default-setting.js'
import { createBaseInitValues, getTerminalDefaults, getSshDefaults, getTerminalBackgroundDefaults, getAuthTypeDefault } from '../common/init-values.js'
import { commonFields, sshAuthFields, sshSettings, quickCommandsTab, sshTunnelTab, connectionHoppingTab, easysshLabFields } from './common-fields.js'

const e = window.translate

const sshConfig = {
  key: connectionMap.ssh,
  type: connectionMap.ssh,
  initValues: (props) => {
    const { store } = props
    return createBaseInitValues(props, connectionMap.ssh, {
      port: 22,
      authType: authTypeMap.password,
      id: '',
      envLang: defaultEnvLang,
      enableSftp: true,
      sshTunnels: [],
      connectionHoppings: [],
      useSshAgent: true,
      sshAgent: '',
      serverHostKey: [],
      cipher: [],
      compress: [],
      easysshGroup: '',
      easysshGpuModel: '',
      easysshGpuCount: undefined,
      easysshDefaultRemotePath: '',
      easysshTags: [],
      ...getTerminalDefaults(store),
      ...getSshDefaults(),
      ...getTerminalBackgroundDefaults(defaultSetting),
      ...getAuthTypeDefault(props)
    })
  },
  layout: formItemLayout,
  tabs: (props = {}) => {
    const id = props.formData?.id || ''
    if (id.startsWith(newBookmarkIdPrefix)) {
      const requiredUsername = {
        ...commonFields.username,
        label: '用户名',
        rules: [{ required: true, message: '请输入 SSH 用户名' }],
        props: { placeholder: '例如 root 或 ubuntu' }
      }
      const optionalTitle = {
        ...commonFields.title,
        label: '连接名称（可选）',
        props: { placeholder: '例如 训练服务器；不填时使用主机地址' }
      }
      return [{
        key: 'connection',
        label: '连接信息',
        fields: [
          {
            type: 'info',
            name: '__connection_help__',
            props: {
              showIcon: true,
              message: '先填写带 * 的必填项',
              description: '通常只需要主机地址、用户名和认证信息。SSH 端口默认是 22。'
            }
          },
          optionalTitle,
          { ...commonFields.host, type: 'sshHostSelector' },
          requiredUsername,
          { type: 'sshAuthTypeSelector', name: 'authType', label: '', props: { simple: true } },
          { type: 'sshAuthSelector', name: '__auth__', label: '', formItemName: 'password', props: { required: true } },
          commonFields.port,
          commonFields.type,
          {
            type: 'collapse',
            name: '__advanced__',
            label: '高级选项',
            description: '代理、跳板、终端、SFTP 和实验室元数据',
            fields: [
              commonFields.category,
              { type: 'sshAgent', name: 'useSshAgent' },
              { type: 'switch', name: 'isMFA', label: () => e('MFA/OTP'), valuePropName: 'checked' },
              commonFields.runScripts,
              commonFields.description,
              commonFields.setEnv,
              commonFields.startDirectoryLocal,
              commonFields.startDirectory,
              commonFields.interactiveValues,
              commonFields.envLang,
              commonFields.encode,
              ...sshSettings,
              ...easysshLabFields,
              commonFields.quickCommands,
              commonFields.sshTunnels,
              commonFields.connectionHopping
            ]
          }
        ]
      }]
    }
    return [
      {
        key: 'auth',
        label: e('auth'),
        fields: sshAuthFields
      },
      {
        key: 'settings',
        label: e('settings'),
        fields: sshSettings
      },
      {
        key: 'easyssh',
        label: '实验室',
        fields: easysshLabFields
      },
      quickCommandsTab(),
      sshTunnelTab(),
      connectionHoppingTab()
    ]
  },
  simpleWhenNew: true
}
export default sshConfig
