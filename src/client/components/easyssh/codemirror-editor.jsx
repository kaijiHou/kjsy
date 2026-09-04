import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, highlightActiveLineGutter } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'

// ============ EasySSH Dark Editor Theme ============
// 背景与 EasySSH UI 一致（#1c1d21），文字浅灰白，柔和语法色（非霓虹）
const easySshDarkTheme = EditorView.theme({
  '&': {
    backgroundColor: '#1c1d21',
    color: '#c8c9cc',
    fontSize: '14px',
    height: '100%'
  },
  '.cm-content': {
    fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
    lineHeight: '1.5',
    padding: '10px 12px'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#c8c9cc'
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#2e3c54'
  },
  '.cm-activeLine': {
    backgroundColor: '#22242a'
  },
  '.cm-gutters': {
    backgroundColor: '#1c1d21',
    color: '#4a4b52',
    border: 'none',
    borderRight: '1px solid #2a2b31'
  },
  '.cm-activeLineGutter': {
    backgroundColor: '#22242a',
    color: '#9a9ba3'
  },
  '.cm-matchingBracket': {
    backgroundColor: '#33353e',
    outline: '1px solid #4a4b52'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: '#282a31',
    color: '#9a9ba3'
  },
  '.cm-searchMatch': {
    backgroundColor: '#3d3a26'
  }
}, { dark: true })

// 柔和语法高亮（非霓虹）：keyword 柔和蓝紫 / string 柔和绿 / fn 蓝 / number 橙
// 显式 HighlightStyle：tag → 颜色（不依赖 defaultHighlightStyle 的浏览器行为）
const easySshHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#7aa2f7' },
  { tag: [tags.string, tags.special(tags.string)], color: '#9ece6a' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: '#5c5e66', fontStyle: 'italic' },
  { tag: [tags.number, tags.integer, tags.float], color: '#e0af68' },
  { tag: [tags.function(tags.variableName), tags.definition(tags.variableName)], color: '#73b7e6' },
  { tag: [tags.typeName, tags.className], color: '#bb9af7' },
  { tag: [tags.bool, tags.null], color: '#bb9af7' },
  { tag: [tags.propertyName, tags.definition(tags.propertyName)], color: '#7dcfff' },
  { tag: tags.heading, color: '#7aa2f7', fontWeight: '600' },
  { tag: tags.link, color: '#7dcfff' },
  { tag: tags.operator, color: '#c8c9cc' }
])

// ============ 语言按扩展名（动态 import：vite 正确处理 ESM interop + 按需加载） ============
async function loadLang (name) {
  const lower = (name || '').toLowerCase()
  const dot = lower.lastIndexOf('.')
  const ext = dot >= 0 ? lower.slice(dot) : ''
  try {
    switch (ext) {
      case '.py':
        return (await import('@codemirror/lang-python')).python()
      case '.yaml':
      case '.yml':
        return (await import('@codemirror/lang-yaml')).yaml()
      case '.json':
        return (await import('@codemirror/lang-json')).json()
      case '.js':
        return (await import('@codemirror/lang-javascript')).javascript()
      case '.jsx':
        return (await import('@codemirror/lang-javascript')).javascript({ jsx: true })
      case '.ts':
        return (await import('@codemirror/lang-javascript')).javascript({ typescript: true })
      case '.tsx':
        return (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true })
      case '.md':
        return (await import('@codemirror/lang-markdown')).markdown()
      default:
        return null
    }
  } catch (e) {
    console.error('[EasySSH CodeMirror] lang load fail:', ext, e.message)
    return null
  }
}

/**
 * EasySSH CodeMirror 6 编辑器（替换 textarea）
 * 编辑 UI 仅此组件；SFTP 读写/Ctrl+S 保存链路由外部（editor-panel）负责。
 */
export default function CodeMirrorEditor (props) {
  const { value, onChange, onDirtyChange, onSave, onError, fileName } = props
  const viewRef = useRef(null)
  const containerRef = useRef(null)
  const langComp = useRef(new Compartment())
  const valueRef = useRef(value)
  valueRef.current = value

  // 初始化（动态加载语言）
  useEffect(() => {
    let disposed = false
    async function init () {
      try {
        const lang = await loadLang(fileName)
        if (disposed) {
          return
        }
        const exts = [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          bracketMatching(),
          indentOnInput(),
          highlightSelectionMatches(),
          syntaxHighlighting(easySshHighlight),
          EditorView.lineWrapping,
          easySshDarkTheme,
          langComp.current.of(lang ? [lang] : []),
          keymap.of([
            ...defaultKeymap,
            ...historyKeymap,
            ...searchKeymap,
            indentWithTab,
            {
              key: 'Mod-s',
              run: () => {
                if (onSave) {
                  onSave()
                }
                return true
              }
            }
          ]),
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              if (onChange) {
                onChange(update.state.doc.toString())
              }
              if (onDirtyChange) {
                onDirtyChange(true)
              }
            }
          })
        ]
        const state = EditorState.create({
          doc: valueRef.current,
          extensions: exts
        })
        const view = new EditorView({
          state,
          parent: containerRef.current
        })
        viewRef.current = view
      } catch (e) {
        console.error('[EasySSH CodeMirror] init error:', e)
        if (onError) {
          onError(e.message || String(e))
        }
      }
    }
    init()
    return () => {
      disposed = true
      if (viewRef.current) {
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
  }, [])
  // 外部内容更新（warm open 切换/保存后）：仅在非编辑状态下同步
  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    if (view.state.doc.toString() !== value) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value }
      })
    }
  }, [value])

  // 语言随文件切换
  useEffect(() => {
    const view = viewRef.current
    if (!view) {
      return
    }
    let cancelled = false
    loadLang(fileName).then(lang => {
      if (!cancelled && viewRef.current) {
        viewRef.current.dispatch({
          effects: langComp.current.reconfigure(lang ? [lang] : [])
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [fileName])

  return <div ref={containerRef} className='easyssh-codemirror' />
}
