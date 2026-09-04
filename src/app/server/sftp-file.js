/**
 * sftp read/write file
 */

const { Readable, Writable } = require('stream')

function createReadStreamFromString (str) {
  const s = new Readable()
  s._read = () => {}
  s.push(str)
  s.push(null)
  return s
}

class FakeWrite extends Writable {
  constructor (opts) {
    super(opts)
    this.opts = opts
  }

  _write (data, encoding, done) {
    this.opts.onData(data)
    done()
  }
}

function writeRemoteFile (sftp, path, str, mode) {
  return new Promise((resolve, reject) => {
    const writeStream = sftp.createWriteStream(path, {
      highWaterMark: 64 * 1024 * 4 * 4,
      mode
    })
    writeStream.on('close', () => {
      resolve('ok')
    })
    writeStream.on('error', (e) => {
      reject(e)
    })
    createReadStreamFromString(str).pipe(writeStream)
  })
}

function readRemoteFile (sftp, path) {
  return new Promise((resolve, reject) => {
    let final = Buffer.alloc(0)
    const writeStream = new FakeWrite({
      onData: data => {
        final = Buffer.concat(
          [final, data]
        )
      }
    })
    writeStream.on('finish', () => {
      resolve(final.toString())
    })
    writeStream.on('error', (e) => {
      reject(e)
    })
    const readStream = sftp.createReadStream(path, {
      highWaterMark: 64 * 1024 * 4 * 4
    })
    // A missing/unreadable remote path emits on the readable side. Without
    // this handler Node treats it as an uncaught EventEmitter error and the
    // entire per-connection session process exits, taking Terminal and SFTP
    // down together.
    readStream.on('error', (e) => {
      reject(e)
    })
    readStream.pipe(writeStream)
  })
}

module.exports = {
  readRemoteFile,
  writeRemoteFile
}
