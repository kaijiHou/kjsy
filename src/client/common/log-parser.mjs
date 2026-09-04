/**
 * EasySSH Log stream parser — 纯函数（无依赖，可独立单元测试）
 *
 * 覆盖：chunk→lines（partial line buffer）、UTF-8 跨 chunk（TextDecoder streaming）、
 * CRLF 归一、ANSI strip、CR/tqdm 覆盖处理、ring buffer 上限、binary 检测。
 */

/** ANSI 转义序列 strip（\x1b[...m 及常见控制序列） */
export function stripAnsi (text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*(\u0007|\u001b\\)/g, '')
}

/**
 * 流式行拆分器：chunk → 完整行数组（保留 partialLine 跨 chunk 拼接）
 * CRLF 归一为 \n；行内 \r（tqdm 进度条）取最后一段（覆盖语义），
 * 避免一条进度条产生几千行。
 */
export class LineSplitter {
  constructor () {
    this.partial = ''
  }

  /**
   * @param {string} text 已解码的文本 chunk
   * @returns {string[]} 完整行（不含 \n；空行保留）
   */
  push (text) {
    const str = text || ''
    const combined = this.partial + str
    const lines = combined.split('\n')
    this.partial = lines.pop()
    return lines.map(l => this.normalizeLine(l))
  }

  /** 流结束：返回残余 partial（若有内容） */
  flush () {
    const rest = this.partial
    this.partial = ''
    return rest ? [this.normalizeLine(rest)] : []
  }

  clear () {
    this.partial = ''
  }

  normalizeLine (line) {
    let l = line
    if (l.endsWith('\r')) {
      l = l.slice(0, -1)
    }
    // 行内 \r（tqdm）：取最后一段（覆盖语义）
    if (l.includes('\r')) {
      const parts = l.split('\r')
      l = parts[parts.length - 1]
    }
    return stripAnsi(l)
  }
}

/** 流式 UTF-8 解码器（跨 chunk 多字节安全） */
export class Utf8Decoder {
  constructor () {
    this.decoder = new TextDecoder('utf-8')
  }

  push (buffer) {
    return this.decoder.decode(buffer, { stream: true })
  }

  flush () {
    return this.decoder.decode()
  }
}

/**
 * Ring buffer：最多 maxLines 行且最多 maxBytes 字节（从最旧丢弃）
 */
export class RingBuffer {
  constructor (maxLines = 5000, maxBytes = 2 * 1024 * 1024) {
    this.maxLines = maxLines
    this.maxBytes = maxBytes
    this.lines = []
    this.bytes = 0
  }

  push (line) {
    // Enforce the documented byte limit, not UTF-16 code-unit length.
    const size = new TextEncoder().encode(line + '\n').length
    this.lines.push(line)
    this.bytes += size
    while (this.lines.length > this.maxLines || (this.bytes > this.maxBytes && this.lines.length > 1)) {
      const old = this.lines.shift()
      this.bytes -= new TextEncoder().encode(old + '\n').length
    }
  }

  clear () {
    this.lines = []
    this.bytes = 0
  }
}

/**
 * Binary 检测：NUL 字节比例超过阈值 → 判定非文本
 */
export function isBinary (buffer, threshold = 0.02) {
  if (!buffer || !buffer.length) {
    return false
  }
  let nul = 0
  const sample = Math.min(buffer.length, 65536)
  for (let i = 0; i < sample; i++) {
    if (buffer[i] === 0) {
      nul++
    }
  }
  return nul / sample > threshold
}
