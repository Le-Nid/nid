// PreToolUse guard (Read, Bash): a whole-file read of a big project file is refused, so the agent
// locates the lines with graphify first and reads only them (offset+limit). Fails open on any error.
const fs = require('fs')
const path = require('path')

const MAX_LINES = 300
const BINARY = /\.(png|jpe?g|gif|webp|svg|ico|pdf|ipynb|woff2?|ttf|zip|gz)$/i

function lineCount(file) {
  try {
    if (BINARY.test(file) || !fs.statSync(file).isFile()) return 0
    const buf = fs.readFileSync(file)
    let n = 0
    for (const b of buf) if (b === 10) n++
    return n
  } catch {
    return 0
  }
}

/** Project file targeted by a whole read, or null. */
function wholeReadTarget(input, root) {
  const { tool_name: tool, tool_input: args = {}, cwd = root } = input
  let file = null
  if (tool === 'Read') {
    if (args.offset != null || args.limit != null) return null
    file = args.file_path
  } else if (tool === 'Bash') {
    // `cat file` alone in a command segment, not piped into head/grep/…
    const m = /(?:^|[;&]\s*)cat\s+([^\s|;&<>]+)\s*(?:$|[;&])/.exec(String(args.command || ''))
    if (!m) return null
    file = m[1].replace(/^["']|["']$/g, '')
  }
  if (!file) return null
  const abs = path.resolve(cwd, file)
  const rel = path.relative(root, abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null // scratchpad, tool outputs…
  return { abs, rel }
}

function main(raw) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const target = wholeReadTarget(JSON.parse(raw), root)
  if (!target) return
  const lines = lineCount(target.abs)
  if (lines <= MAX_LINES) return
  const reason =
    `${target.rel} fait ${lines} lignes : lecture complète refusée (règle ponytail + graphify, AGENTS.md). ` +
    `Localisez d'abord avec \`graphify explain "${path.basename(target.rel)}"\` ou \`graphify query "<question>"\`, ` +
    `puis lisez seulement les lignes utiles (Read avec offset+limit, ou sed -n 'A,Bp'). ` +
    `Lecture complète réellement nécessaire : Read avec limit explicite.`
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  }))
}

if (require.main === module) {
  let raw = ''
  process.stdin.on('data', (c) => { raw += c })
  process.stdin.on('end', () => { try { main(raw) } catch { /* fail open */ } })
}

module.exports = { wholeReadTarget, lineCount, MAX_LINES }
