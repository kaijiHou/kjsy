import { Radio, Form } from 'antd'
import { authTypeMap } from '../../../common/constants'
import { formItemLayout, tailFormItemLayout } from '../../../common/form-layout'

const authTypes = Object.keys(authTypeMap).map(k => {
  return k
})
const RadioButton = Radio.Button
const RadioGroup = Radio.Group
const e = window.translate
const FormItem = Form.Item

export default function SshAuthTypeSelector ({ handleChangeAuthType, filterAuthType = a => a, value, simple, ...props }) {
  const authTypesFiltered = authTypes
    .filter(filterAuthType)
    .filter(type => !simple || type !== authTypeMap.profiles)
  return (
    <FormItem
      {...(simple ? formItemLayout : tailFormItemLayout)}
      className='mg1b'
      label={simple ? '认证方式' : undefined}
      name='authType'
      rules={simple ? [{ required: true, message: '请选择认证方式' }] : undefined}
    >
      <RadioGroup
        size='small'
        onChange={handleChangeAuthType}
        buttonStyle='solid'
      >
        {
          authTypesFiltered.map(t => {
            const str = t === 'privateKey'
              ? e(t) + '/' + e('certificate')
              : e(t)
            return (
              <RadioButton value={t} key={t}>
                {str}
              </RadioButton>
            )
          })
        }
      </RadioGroup>
    </FormItem>
  )
}
