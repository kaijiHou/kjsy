/** Fail early with a Node.js version supported by the current build stack. */
const [major, minor] = process.versions.node.split('.').map(Number)
const supported = major > 22 || (major === 22 && minor >= 12)

if (!supported) {
  console.error(`EasySSH build requires Node.js 22.12+ (current: ${process.versions.node}).`)
  process.exit(1)
}
