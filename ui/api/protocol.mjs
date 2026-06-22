import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDirectory = dirname(fileURLToPath(import.meta.url))
const agentsRoot = resolve(apiDirectory, '..', '..', '.agents')
const requiredFiles = [
  'CORE_RULES.md', 'PROJECT_RULES.md', 'PROTOCOL_RULES.md', 'AGENTS_MAP.md',
  'sessions/active_sessions.md', 'decisions.jsonl', 'schemas/handoff.schema.json',
  'schemas/decisions.entry.schema.json',
]

function readText(path) {
  try { return readFileSync(path, 'utf8').replace(/^\uFEFF/, '') } catch { return '' }
}

function fileExists(path) {
  try { return statSync(path).isFile() } catch { return false }
}

function relativeTime(timestamp) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'agora'
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`
  if (seconds < 86400) return `há ${Math.floor(seconds / 3600)} h`
  return `há ${Math.floor(seconds / 86400)} dias`
}

function markdownField(content, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.match(new RegExp(`^\\*\\*${escaped}:\\*\\*\\s*(.+)$`, 'im'))?.[1].trim() ?? 'Não informado'
}

function cleanAgent(signature) {
  return signature.trim().replace(/^\[|\]$/g, '').split('/')[0].trim()
}

function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

function localDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function createProtocolData() {
  if (!existsSync(agentsRoot) || !statSync(agentsRoot).isDirectory()) throw new Error('Diretório .agents não encontrado.')

  const files = requiredFiles.map(relativePath => {
    const path = join(agentsRoot, ...relativePath.split('/'))
    const exists = fileExists(path)
    return { path: `.agents/${relativePath}`, exists, status: exists ? 'OK' : 'Ausente', updated: exists ? relativeTime(statSync(path).mtimeMs) : '—' }
  })

  const decisions = readText(join(agentsRoot, 'decisions.jsonl')).split(/\r?\n/).map(line => line.trim()).filter(Boolean).flatMap((line, index) => {
    try {
      const entry = JSON.parse(line)
      const date = entry.timestamp ? new Date(entry.timestamp) : null
      const validDate = date && !Number.isNaN(date.getTime())
      return [{
        timestamp: entry.timestamp ?? '',
        time: validDate ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—',
        id: validDate ? `DEC-${localDate(date).replaceAll('-', '')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}` : `DEC-${index}`,
        decision: entry.decision ?? 'Decisão sem descrição', rationale: entry.rationale ?? '',
        agent: cleanAgent(String(entry.agent ?? 'unknown')), files: entry.files_affected ?? [], status: entry.status ?? 'unknown',
      }]
    } catch { return [] }
  }).sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const handoffs = walk(join(agentsRoot, 'local')).filter(path => path.endsWith(`${sep}handoff.md`)).map(path => {
    const relativePath = relative(agentsRoot, path).split(sep).join('/')
    const [, actor = 'unknown', agentFromPath] = relativePath.split('/')
    const content = readText(path)
    const mtimeMs = statSync(path).mtimeMs
    return {
      actor, agent: agentFromPath ?? cleanAgent(markdownField(content, 'Last Agent')), path: `.agents/${relativePath}`,
      timestamp: markdownField(content, 'Timestamp'), status: markdownField(content, 'Status'),
      lastAction: markdownField(content, 'Last Action'), pendingStep: markdownField(content, 'Pending Step'),
      blockers: markdownField(content, 'Blockers/Context'), openThreads: markdownField(content, 'Open Threads'),
      updated: relativeTime(mtimeMs), raw: content, mtimeMs,
    }
  }).sort((a, b) => b.mtimeMs - a.mtimeMs).map(({ mtimeMs: _, ...handoff }) => handoff)

  const sessions = readText(join(agentsRoot, 'sessions', 'active_sessions.md')).split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^\|(.+)\|$/)
    if (!match) return []
    const columns = match[1].split('|').map(column => column.trim())
    if (columns.length !== 5 || columns[0] === 'Session ID' || columns[0].startsWith('---')) return []
    return [{ id: columns[0], agent: cleanAgent(columns[1]), started: columns[2], topic: columns[3], checkpoint: columns[4], status: 'Ativo' }]
  })

  const ownersByTopic = new Map()
  for (const session of sessions) ownersByTopic.set(session.topic, [...(ownersByTopic.get(session.topic) ?? []), session])
  const conflicts = [...ownersByTopic].filter(([, owners]) => owners.length > 1).map(([topic, owners]) => ({ topic, agents: [...new Set(owners.map(owner => owner.agent))] }))

  const projectRules = readText(join(agentsRoot, 'PROJECT_RULES.md'))
  const declaredModules = projectRules.match(/^- \*\*Active modules:\*\*\s*(.+)$/im)?.[1].trim() ?? ''
  const activeModules = declaredModules && declaredModules.toLowerCase() !== 'none' && !declaredModules.startsWith('[') ? declaredModules.split(',').map(module => module.trim()).filter(Boolean) : []
  const validCount = files.filter(file => file.exists).length
  const validPercent = files.length ? Math.round((validCount / files.length) * 100) : 0
  const today = localDate()

  return {
    generatedAt: new Date().toISOString(), root: '.agents',
    metrics: { activeSessions: sessions.length, todayDecisions: decisions.filter(decision => decision.timestamp.startsWith(today)).length, protocolPercent: validPercent, alerts: conflicts.length },
    protocolValid: validPercent === 100, sessions,
    agents: handoffs.map(handoff => ({ agent: handoff.agent, actor: handoff.actor, activity: handoff.updated, status: handoff.status, scope: handoff.pendingStep })),
    handoff: handoffs[0] ?? null, handoffs, decisions, files, conflicts,
    rules: [
      { name: 'PROTOCOL_RULES.md', precedence: 1, exists: fileExists(join(agentsRoot, 'PROTOCOL_RULES.md')) },
      { name: 'Active modules', precedence: 2, exists: true, modules: activeModules },
      { name: 'PROJECT_RULES.md', precedence: 4, exists: fileExists(join(agentsRoot, 'PROJECT_RULES.md')) },
    ],
    validator: { passed: validCount, errors: files.length - validCount, checks: files },
  }
}
