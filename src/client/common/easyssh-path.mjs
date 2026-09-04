export function joinRemotePath (parent, name) {
  const base = String(parent || '')
  const child = String(name || '').replace(/^\/+/, '')
  if (!base || base === '/') return '/' + child
  return base.replace(/\/+$/, '') + '/' + child
}
