import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Background, Controls, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, AlertTriangle, Bot, CheckCircle2, FileText, GitCommitHorizontal, Maximize2, Network, RefreshCw, ScrollText, Waypoints } from 'lucide-react'
import './graph.css'

type Kind = 'agent' | 'session' | 'decision' | 'file' | 'task' | 'rule' | 'alert'
type Relation = 'created' | 'updated' | 'depends' | 'blocks' | 'relates'
type Layout = 'directed' | 'radial' | 'organic'
type GraphData = Record<string, unknown> & {
  label: ReactNode
  title: string
  subtitle: string
  kind: Kind
  details: [string, string][]
}
type GraphNode = Node<GraphData>
type GraphEdge = Edge & { data: { relation: Relation } }

export type GraphProtocolData = {
  generatedAt: string
  sessions: { id: string; agent: string; started: string; topic: string; checkpoint: string; status: string }[]
  agents: { agent: string; actor: string; activity: string; status: string; scope: string }[]
  handoff: null | { actor: string; agent: string; path: string; timestamp: string; status: string; lastAction: string; pendingStep: string; blockers: string; openThreads: string; updated: string; raw: string }
  decisions: { timestamp: string; time: string; id: string; decision: string; rationale: string; agent: string; files: string[]; status: string }[]
  files: { path: string; exists: boolean; status: string; updated: string }[]
  conflicts: { topic: string; agents: string[] }[]
  rules: { name: string; precedence: number; exists: boolean; modules?: string[] }[]
}

const kindLabels: Record<Kind, string> = { agent: 'Agente', session: 'Sessão', decision: 'Decisão', file: 'Arquivo', task: 'Tarefa', rule: 'Regra', alert: 'Alerta' }
const kindColors: Record<Kind, string> = { agent: '#4d8dff', session: '#8b63ff', decision: '#43d996', file: '#f4b63f', task: '#ff9f6e', rule: '#b56cff', alert: '#ff6b72' }
const relationLabels: Record<Relation, string> = { created: 'criou', updated: 'atualizou', depends: 'depende', blocks: 'bloqueia', relates: 'relaciona' }
const relationColors: Record<Relation, string> = { created: '#4d8dff', updated: '#56cfe1', depends: '#f4b63f', blocks: '#ff6b72', relates: '#8b7cff' }
const kindIcons: Record<Kind, typeof Bot> = { agent: Bot, session: Network, decision: GitCommitHorizontal, file: FileText, task: CheckCircle2, rule: ScrollText, alert: AlertTriangle }
const initialLayout = (): Layout => {
  const value = new URLSearchParams(window.location.search).get('layout')
  return value === 'organic' || value === 'radial' ? value : 'directed'
}

function id(kind: Kind, key: string) { return `${kind}:${encodeURIComponent(key)}` }
function meaningful(value?: string) { return Boolean(value && !['none', 'n/a', 'não informado', '—'].includes(value.trim().toLocaleLowerCase('pt-BR'))) }
function label(kind: Kind, title: string, subtitle: string) {
  const Icon = kindIcons[kind]
  return <div className="graph-node-label"><span><Icon /></span><div><b>{title}</b><small>{subtitle}</small></div></div>
}

function positionNodes(nodes: GraphNode[], layout: Layout) {
  if (layout === 'organic') {
    const presets: Record<Kind, { x: number; y: number }[]> = {
      agent: [{ x: 80, y: 45 }, { x: 20, y: 355 }, { x: 300, y: 20 }],
      session: [{ x: 300, y: 190 }, { x: 300, y: 390 }],
      task: [{ x: 535, y: 345 }, { x: 520, y: 545 }],
      decision: [{ x: 685, y: 155 }, { x: 390, y: 610 }, { x: 805, y: 560 }, { x: 560, y: 40 }, { x: 990, y: 350 }, { x: 145, y: 610 }],
      file: [{ x: 970, y: 65 }, { x: 1050, y: 245 }, { x: 970, y: 455 }, { x: 1180, y: 570 }, { x: 1190, y: 120 }, { x: 1220, y: 350 }],
      rule: [{ x: 970, y: 650 }, { x: 755, y: 705 }, { x: 1180, y: 710 }],
      alert: [{ x: 710, y: 700 }, { x: 475, y: 720 }],
    }
    const counts = new Map<Kind, number>()
    return nodes.map(node => {
      const index = counts.get(node.data.kind) ?? 0
      counts.set(node.data.kind, index + 1)
      const positions = presets[node.data.kind]
      const preset = positions[index % positions.length]
      const overflow = Math.floor(index / positions.length)
      return { ...node, position: { x: preset.x + overflow * 150, y: preset.y + overflow * 85 } }
    })
  }
  if (layout === 'radial') {
    const center = { x: 530, y: 320 }
    return nodes.map((node, index) => {
      if (!index) return { ...node, position: center }
      const angle = ((index - 1) / Math.max(1, nodes.length - 1)) * Math.PI * 2
      const radius = 210 + (index % 3) * 90
      return { ...node, position: { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius } }
    })
  }
  const groups: Record<Kind, { x: number; y: number; rows: number }> = {
    agent: { x: 20, y: 30, rows: 5 }, session: { x: 250, y: 30, rows: 5 },
    task: { x: 480, y: 30, rows: 5 }, decision: { x: 710, y: 30, rows: 6 },
    file: { x: 940, y: 30, rows: 6 }, rule: { x: 940, y: 720, rows: 3 },
    alert: { x: 710, y: 720, rows: 3 },
  }
  const counts = new Map<Kind, number>()
  return nodes.map(node => {
    const row = counts.get(node.data.kind) ?? 0
    counts.set(node.data.kind, row + 1)
    const group = groups[node.data.kind]
    return { ...node, position: { x: group.x + Math.floor(row / group.rows) * 220, y: group.y + (row % group.rows) * 115 } }
  })
}

function buildGraph(data: GraphProtocolData, layout: Layout) {
  const nodeMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const edgeKeys = new Set<string>()
  const addNode = (kind: Kind, key: string, title: string, subtitle: string, details: [string, string][]) => {
    const nodeId = id(kind, key)
    if (!nodeMap.has(nodeId)) nodeMap.set(nodeId, { id: nodeId, position: { x: 0, y: 0 }, sourcePosition: Position.Right, targetPosition: Position.Left, className: `protocol-node node-${kind}`, data: { label: label(kind, title, subtitle), title, subtitle, kind, details } })
    return nodeId
  }
  const addEdge = (source: string, target: string, relation: Relation) => {
    const key = `${source}|${target}|${relation}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ id: key, source, target, type: layout === 'organic' ? 'bezier' : 'smoothstep', animated: relation === 'updated', data: { relation }, label: relationLabels[relation], labelStyle: { fill: '#8d98a8', fontSize: 9 }, style: { stroke: relationColors[relation], strokeWidth: 1.4 }, markerEnd: { type: MarkerType.ArrowClosed, color: relationColors[relation] } })
  }

  const agentIds = new Map<string, string>()
  const ensureAgent = (agent: string, actor = 'Não informado', activity = 'Sem atividade recente', status = 'Encontrado') => {
    if (agentIds.has(agent)) return agentIds.get(agent)!
    const nodeId = addNode('agent', agent, agent, 'Agente', [['Actor', actor], ['Status', status], ['Atividade', activity]])
    agentIds.set(agent, nodeId)
    return nodeId
  }
  data.agents.forEach(item => ensureAgent(item.agent, item.actor, item.activity, item.status))
  data.sessions.forEach(session => {
    const agentId = ensureAgent(session.agent)
    const sessionId = addNode('session', session.id, session.id, session.status, [['Início', session.started], ['Agente', session.agent], ['Escopo', session.topic], ['Checkpoint', session.checkpoint || 'Nenhum']])
    addEdge(agentId, sessionId, 'relates')
    if (meaningful(session.topic)) {
      const taskId = addNode('task', session.topic, session.topic, 'Tarefa da sessão', [['Sessão', session.id], ['Status', session.status]])
      addEdge(sessionId, taskId, 'depends')
    }
  })
  data.decisions.forEach(decision => {
    const agentId = ensureAgent(decision.agent)
    const decisionId = addNode('decision', decision.id, decision.decision, decision.status, [['ID', decision.id], ['Horário', decision.time], ['Agente', decision.agent], ['Justificativa', decision.rationale || 'Não informada']])
    addEdge(agentId, decisionId, 'created')
    decision.files.forEach(path => {
      const fileId = addNode('file', path, path.split('/').at(-1) ?? path, 'Arquivo afetado', [['Caminho', path], ['Decisão', decision.id]])
      addEdge(decisionId, fileId, 'updated')
    })
  })
  data.files.forEach(file => addNode('file', file.path, file.path.split('/').at(-1) ?? file.path, file.status, [['Caminho', file.path], ['Integridade', file.status], ['Atualização', file.updated]]))
  data.rules.forEach(rule => {
    const ruleId = addNode('rule', rule.name, rule.name, `Precedência ${rule.precedence}`, [['Precedência', String(rule.precedence)], ['Status', rule.exists ? 'Encontrada' : 'Ausente'], ['Módulos', rule.modules?.join(', ') || 'Nenhum']])
    const matchingFile = [...nodeMap.values()].find(node => node.data.kind === 'file' && node.data.title === rule.name)
    if (matchingFile) addEdge(ruleId, matchingFile.id, 'relates')
  })
  data.conflicts.forEach(conflict => {
    const alertId = addNode('alert', conflict.topic, `Conflito: ${conflict.topic}`, `${conflict.agents.length} agentes`, [['Escopo', conflict.topic], ['Agentes', conflict.agents.join(', ')]])
    conflict.agents.forEach(agent => addEdge(ensureAgent(agent), alertId, 'blocks'))
  })
  if (data.handoff) {
    const agentId = ensureAgent(data.handoff.agent, data.handoff.actor, data.handoff.updated, data.handoff.status)
    const fileId = addNode('file', data.handoff.path, 'handoff.md', data.handoff.updated, [['Caminho', data.handoff.path], ['Última ação', data.handoff.lastAction], ['Próximo passo', data.handoff.pendingStep]])
    addEdge(agentId, fileId, 'updated')
    if (meaningful(data.handoff.pendingStep)) {
      const taskId = addNode('task', data.handoff.pendingStep, data.handoff.pendingStep, 'Próximo passo', [['Agente', data.handoff.agent], ['Origem', 'Handoff atual']])
      addEdge(agentId, taskId, 'depends')
    }
  }
  return { nodes: positionNodes([...nodeMap.values()], layout), edges }
}

export default function GraphView({ data, reload }: { data: GraphProtocolData; reload: () => void | Promise<void> }) {
  const [layout, setLayout] = useState<Layout>(initialLayout)
  const [scope, setScope] = useState<'summary' | 'complete'>('summary')
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [relation, setRelation] = useState<Relation | 'all'>('all')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const graph = useMemo(() => buildGraph(data, layout), [data, layout])
  const scopedNodes = useMemo(() => scope === 'complete' ? graph.nodes : [...graph.nodes.filter(node => node.data.kind !== 'file'), ...graph.nodes.filter(node => node.data.kind === 'file').slice(0, layout === 'organic' ? 8 : 12)], [graph.nodes, layout, scope])
  const nodes = useMemo(() => kind === 'all' ? scopedNodes : scopedNodes.filter(node => node.data.kind === kind), [scopedNodes, kind])
  const nodeIds = useMemo(() => new Set(nodes.map(node => node.id)), [nodes])
  const edges = useMemo(() => graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && (relation === 'all' || edge.data.relation === relation)), [graph.edges, nodeIds, relation])
  const selected = graph.nodes.find(node => node.id === selectedId) ?? null

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => { void reload() }, 5000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, reload])
  useEffect(() => {
    if (selectedId && graph.nodes.some(node => node.id === selectedId)) return
    setSelectedId(graph.nodes.find(node => node.data.kind === 'session')?.id ?? graph.nodes[0]?.id ?? null)
  }, [graph.nodes, selectedId])

  const updatedAt = new Date(data.generatedAt).toLocaleTimeString('pt-BR')
  const recent = data.decisions.slice(0, 6)
  const fullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else if (containerRef.current) await containerRef.current.requestFullscreen() }
  const changeLayout = (value: Layout) => { setLayout(value); const url = new URL(window.location.href); if (value === 'directed') url.searchParams.delete('layout'); else url.searchParams.set('layout', value); window.history.replaceState(null, '', url) }

  return <div className="graph-page" ref={containerRef}>
    <header className="graph-toolbar"><div><Network /><span><b>Grafo operacional</b><small><i /> Atualizado às {updatedAt}</small></span></div><div className="graph-actions"><label>Atualização automática <button className={`switch ${autoRefresh ? 'on' : ''}`} aria-label="Alternar atualização automática" onClick={() => setAutoRefresh(value => !value)}><span /></button></label><select aria-label="Selecionar layout" value={layout} onChange={event => changeLayout(event.target.value as Layout)}><option value="directed">Direcionado</option><option value="organic">Orgânico</option><option value="radial">Radial</option></select><button aria-label="Atualizar grafo" onClick={() => void reload()}><RefreshCw /></button><button aria-label="Tela cheia" onClick={() => void fullscreen()}><Maximize2 /></button></div></header>
    <div className="graph-grid">
      <div className="graph-filters"><h3>Filtros</h3><label>Escopo<select value={scope} onChange={event => setScope(event.target.value as 'summary' | 'complete')}><option value="summary">Resumo operacional</option><option value="complete">Grafo completo</option></select></label><label>Tipo de nó<select value={kind} onChange={event => setKind(event.target.value as Kind | 'all')}><option value="all">Todos</option>{Object.entries(kindLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label>Tipo de relação<select value={relation} onChange={event => setRelation(event.target.value as Relation | 'all')}><option value="all">Todas</option>{Object.entries(relationLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><div className="graph-legend"><h3>Tipos de nó</h3>{Object.entries(kindLabels).map(([value, text]) => <span key={value}><i style={{ background: kindColors[value as Kind] }} />{text}</span>)}<h3>Relações</h3>{Object.entries(relationLabels).map(([value, text]) => <span key={value}><i className="line" style={{ background: relationColors[value as Relation] }} />{text}</span>)}</div><div className="graph-stats"><h3>Estatísticas</h3><span>Nós visíveis <b>{nodes.length}</b></span><span>Nós totais <b>{graph.nodes.length}</b></span><span>Relações <b>{edges.length}</b></span><span>Decisões <b>{data.decisions.length}</b></span><span>Atualizado <b>{updatedAt}</b></span></div></div>
      <section className={`graph-canvas layout-${layout}`}>{nodes.length ? <ReactFlow key={`${layout}-${scope}-${kind}`} nodes={nodes} edges={edges} onNodeClick={(_, node) => setSelectedId(node.id)} fitView fitViewOptions={{ padding: layout === 'organic' ? .12 : .18, maxZoom: layout === 'organic' ? 1 : .9 }} minZoom={.2} maxZoom={2} proOptions={{ hideAttribution: true }}><Background color="#263347" gap={28} size={1} /><MiniMap nodeColor={node => kindColors[(node.data as GraphData).kind]} maskColor="#08101bd9" pannable zoomable /><Controls /></ReactFlow> : <div className="graph-empty"><Waypoints />Nenhum dado corresponde aos filtros selecionados.</div>}</section>
      <div className="graph-insights"><section><h3><Activity /> Atividades recentes</h3>{recent.length ? recent.map(item => <article key={item.id}><time>{item.time}</time><i style={{ background: kindColors.decision }} /><p><b>{item.agent}</b><span>{item.decision}</span></p></article>) : <div className="graph-empty small">Nenhuma decisão registrada.</div>}</section><section className="node-details"><h3>Detalhes do nó selecionado</h3>{selected ? <><header><b>{selected.data.title}</b><em style={{ color: kindColors[selected.data.kind] }}>{kindLabels[selected.data.kind]}</em></header><p>{selected.data.subtitle}</p>{selected.data.details.map(([name, value]) => <dl key={name}><dt>{name}</dt><dd>{value}</dd></dl>)}</> : <div className="graph-empty small">Selecione um nó no grafo.</div>}</section></div>
    </div>
    <section className="graph-timeline"><h3>Linha do tempo</h3><div>{data.decisions.length ? data.decisions.slice().reverse().slice(-30).map((item, index, list) => <span key={item.id} style={{ left: `${list.length === 1 ? 50 : 4 + (index / (list.length - 1)) * 92}%`, background: kindColors.decision }} title={`${item.time} — ${item.decision}`} />) : <small>Nenhum evento registrado.</small>}</div></section>
  </div>
}
