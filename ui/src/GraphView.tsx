import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, useNodesState, type Edge, type Node, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Activity, AlertTriangle, Bot, CheckCircle2, FileText, GitCommitHorizontal, Maximize2, Network, RefreshCw, ScrollText, Waypoints } from 'lucide-react'
import './graph.css'
import './graph-timeline.css'

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

const kindLabels: Record<Kind, string> = { agent: 'Agent', session: 'Session', decision: 'Decision', file: 'File', task: 'Task', rule: 'Rule', alert: 'Alert' }
const kindColors: Record<Kind, string> = { agent: '#4d8dff', session: '#8b63ff', decision: '#43d996', file: '#f4b63f', task: '#ff9f6e', rule: '#b56cff', alert: '#ff6b72' }
const relationLabels: Record<Relation, string> = { created: 'created', updated: 'updated', depends: 'depends on', blocks: 'blocks', relates: 'relates to' }
const relationColors: Record<Relation, string> = { created: '#4d8dff', updated: '#56cfe1', depends: '#f4b63f', blocks: '#ff6b72', relates: '#8b7cff' }
const kindIcons: Record<Kind, typeof Bot> = { agent: Bot, session: Network, decision: GitCommitHorizontal, file: FileText, task: CheckCircle2, rule: ScrollText, alert: AlertTriangle }
const initialLayout = (): Layout => {
  const value = new URLSearchParams(window.location.search).get('layout')
  return value === 'organic' || value === 'radial' ? value : 'directed'
}

function id(kind: Kind, key: string) { return `${kind}:${encodeURIComponent(key)}` }
function meaningful(value?: string) { return Boolean(value && !['none', 'n/a', 'not provided', 'não informado', '—'].includes(value.trim().toLocaleLowerCase('en-US'))) }
function label(kind: Kind, title: string, subtitle: string) {
  const Icon = kindIcons[kind]
  return <div className="graph-node-label"><span><Icon /></span><div><b>{title}</b><small>{subtitle}</small></div></div>
}

function ProtocolNode({ data }: NodeProps<GraphNode>) {
  return <><Handle type="target" position={Position.Left} /><Handle type="source" position={Position.Right} />{data.label}</>
}

const nodeTypes = { protocol: ProtocolNode }

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
    if (!nodeMap.has(nodeId)) nodeMap.set(nodeId, { id: nodeId, type: 'protocol', position: { x: 0, y: 0 }, width: layout === 'organic' ? 215 : 190, height: layout === 'organic' ? 58 : 55, className: `protocol-node node-${kind}`, data: { label: label(kind, title, subtitle), title, subtitle, kind, details } })
    return nodeId
  }
  const addEdge = (source: string, target: string, relation: Relation) => {
    const key = `${source}|${target}|${relation}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ id: key, source, target, type: layout === 'organic' ? 'bezier' : 'smoothstep', animated: relation === 'updated', data: { relation }, label: relationLabels[relation], labelStyle: { fill: '#8d98a8', fontSize: 9 }, style: { stroke: relationColors[relation], strokeWidth: 1.4 }, markerEnd: { type: MarkerType.ArrowClosed, color: relationColors[relation] } })
  }

  const agentIds = new Map<string, string>()
  const ensureAgent = (agent: string, actor = 'Not provided', activity = 'No recent activity', status = 'Found') => {
    if (agentIds.has(agent)) return agentIds.get(agent)!
    const nodeId = addNode('agent', agent, agent, 'Agent', [['Actor', actor], ['Status', status], ['Activity', activity]])
    agentIds.set(agent, nodeId)
    return nodeId
  }
  data.agents.forEach(item => ensureAgent(item.agent, item.actor, item.activity, item.status))
  data.sessions.forEach(session => {
    const agentId = ensureAgent(session.agent)
    const sessionId = addNode('session', session.id, session.id, session.status, [['Start', session.started], ['Agent', session.agent], ['Scope', session.topic], ['Checkpoint', session.checkpoint || 'None']])
    addEdge(agentId, sessionId, 'relates')
    if (meaningful(session.topic)) {
      const taskId = addNode('task', session.topic, session.topic, 'Session task', [['Session', session.id], ['Status', session.status]])
      addEdge(sessionId, taskId, 'depends')
    }
  })
  data.decisions.forEach(decision => {
    const agentId = ensureAgent(decision.agent)
    const decisionId = addNode('decision', decision.id, decision.decision, decision.status, [['ID', decision.id], ['Time', decision.time], ['Agent', decision.agent], ['Rationale', decision.rationale || 'Not provided']])
    addEdge(agentId, decisionId, 'created')
    decision.files.forEach(path => {
      const fileId = addNode('file', path, path.split('/').at(-1) ?? path, 'Affected file', [['Path', path], ['Decision', decision.id]])
      addEdge(decisionId, fileId, 'updated')
    })
  })
  data.files.forEach(file => addNode('file', file.path, file.path.split('/').at(-1) ?? file.path, file.status, [['Path', file.path], ['Integrity', file.status], ['Updated', file.updated]]))
  data.rules.forEach(rule => {
    const ruleId = addNode('rule', rule.name, rule.name, `Precedence ${rule.precedence}`, [['Precedence', String(rule.precedence)], ['Status', rule.exists ? 'Found' : 'Missing'], ['Modules', rule.modules?.join(', ') || 'None']])
    const matchingFile = [...nodeMap.values()].find(node => node.data.kind === 'file' && node.data.title === rule.name)
    if (matchingFile) addEdge(ruleId, matchingFile.id, 'relates')
  })
  data.conflicts.forEach(conflict => {
    const alertId = addNode('alert', conflict.topic, `Conflict: ${conflict.topic}`, `${conflict.agents.length} agents`, [['Scope', conflict.topic], ['Agents', conflict.agents.join(', ')]])
    conflict.agents.forEach(agent => addEdge(ensureAgent(agent), alertId, 'blocks'))
  })
  if (data.handoff) {
    const agentId = ensureAgent(data.handoff.agent, data.handoff.actor, data.handoff.updated, data.handoff.status)
    const fileId = addNode('file', data.handoff.path, 'handoff.md', data.handoff.updated, [['Path', data.handoff.path], ['Last action', data.handoff.lastAction], ['Next step', data.handoff.pendingStep]])
    addEdge(agentId, fileId, 'updated')
    if (meaningful(data.handoff.pendingStep)) {
      const taskId = addNode('task', data.handoff.pendingStep, data.handoff.pendingStep, 'Next step', [['Agent', data.handoff.agent], ['Source', 'Current handoff']])
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
  const [renderedNodes, setRenderedNodes, onNodesChange] = useNodesState<GraphNode>(nodes)
  const nodeIds = useMemo(() => new Set(nodes.map(node => node.id)), [nodes])
  const edges = useMemo(() => graph.edges.filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target) && (relation === 'all' || edge.data.relation === relation)), [graph.edges, nodeIds, relation])
  const selected = graph.nodes.find(node => node.id === selectedId) ?? null

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => { void reload() }, 5000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, reload])
  useEffect(() => { setRenderedNodes(nodes) }, [nodes, setRenderedNodes])
  useEffect(() => {
    if (selectedId && graph.nodes.some(node => node.id === selectedId)) return
    setSelectedId(graph.nodes.find(node => node.data.kind === 'session')?.id ?? graph.nodes[0]?.id ?? null)
  }, [graph.nodes, selectedId])

  const updatedAt = new Date(data.generatedAt).toLocaleTimeString('en-US')
  const recent = data.decisions.slice(0, 6)
  const timelineEvents = useMemo(() => [...data.decisions].sort((left, right) => left.timestamp.localeCompare(right.timestamp)).slice(-30), [data.decisions])
  const fullscreen = async () => { if (document.fullscreenElement) await document.exitFullscreen(); else if (containerRef.current) await containerRef.current.requestFullscreen() }
  const changeLayout = (value: Layout) => { setLayout(value); const url = new URL(window.location.href); if (value === 'directed') url.searchParams.delete('layout'); else url.searchParams.set('layout', value); window.history.replaceState(null, '', url) }

  return <div className="graph-page" ref={containerRef}>
    <header className="graph-toolbar"><div><Network /><span><b>Operational graph</b><small><i /> Updated at {updatedAt}</small></span></div><div className="graph-actions"><label>Auto refresh <button className={`switch ${autoRefresh ? 'on' : ''}`} aria-label="Toggle auto refresh" onClick={() => setAutoRefresh(value => !value)}><span /></button></label><select aria-label="Select layout" value={layout} onChange={event => changeLayout(event.target.value as Layout)}><option value="directed">Directed</option><option value="organic">Organic</option><option value="radial">Radial</option></select><button aria-label="Refresh graph" onClick={() => void reload()}><RefreshCw /></button><button aria-label="Full screen" onClick={() => void fullscreen()}><Maximize2 /></button></div></header>
    <div className="graph-grid">
      <div className="graph-filters"><h3>Filters</h3><label>Scope<select value={scope} onChange={event => setScope(event.target.value as 'summary' | 'complete')}><option value="summary">Operational summary</option><option value="complete">Complete graph</option></select></label><label>Node type<select value={kind} onChange={event => setKind(event.target.value as Kind | 'all')}><option value="all">All</option>{Object.entries(kindLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label>Relation type<select value={relation} onChange={event => setRelation(event.target.value as Relation | 'all')}><option value="all">All</option>{Object.entries(relationLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><div className="graph-legend"><h3>Node types</h3>{Object.entries(kindLabels).map(([value, text]) => <span key={value}><i style={{ background: kindColors[value as Kind] }} />{text}</span>)}<h3>Relationships</h3>{Object.entries(relationLabels).map(([value, text]) => <span key={value}><i className="line" style={{ background: relationColors[value as Relation] }} />{text}</span>)}</div><div className="graph-stats"><h3>Statistics</h3><span>Visible nodes <b>{nodes.length}</b></span><span>Total nodes <b>{graph.nodes.length}</b></span><span>Relationships <b>{edges.length}</b></span><span>Decisions <b>{data.decisions.length}</b></span><span>Updated <b>{updatedAt}</b></span></div></div>
      <section className={`graph-canvas layout-${layout}`}>{renderedNodes.length ? <><ReactFlow key={`${layout}-${scope}-${kind}`} nodes={renderedNodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onNodeClick={(_, node) => setSelectedId(node.id)} fitView fitViewOptions={{ padding: layout === 'organic' ? .12 : .18, maxZoom: layout === 'organic' ? 1 : .9 }} minZoom={.2} maxZoom={2} proOptions={{ hideAttribution: true }}><Background color="#263347" gap={28} size={1} /><MiniMap nodeColor={node => kindColors[(node.data as GraphData).kind]} nodeStrokeColor="#f4f7fb" nodeStrokeWidth={3} bgColor="#111a26" maskColor="#08101b66" maskStrokeColor="#9c8cff" maskStrokeWidth={2} pannable zoomable /><Controls /></ReactFlow><div className="graph-navigation"><p>Drag to navigate · use the mouse wheel to zoom</p><b>{renderedNodes.length} nodes · {edges.length} relationships</b></div></> : <div className="graph-empty"><Waypoints />No data matches the selected filters.</div>}</section>
      <div className="graph-insights"><section><h3><Activity /> Recent activity</h3>{recent.length ? recent.map(item => <article key={item.id}><time>{item.time}</time><i style={{ background: kindColors.decision }} /><p><b>{item.agent}</b><span>{item.decision}</span></p></article>) : <div className="graph-empty small">No decisions recorded.</div>}</section><section className="node-details"><h3>Selected node details</h3>{selected ? <><header><b>{selected.data.title}</b><em style={{ color: kindColors[selected.data.kind] }}>{kindLabels[selected.data.kind]}</em></header><p>{selected.data.subtitle}</p>{selected.data.details.map(([name, value]) => <dl key={name}><dt>{name}</dt><dd>{value}</dd></dl>)}</> : <div className="graph-empty small">Select a node in the graph.</div>}</section></div>
    </div>
    <section className="graph-timeline"><header><h3>Timeline</h3><b>{timelineEvents.length} {timelineEvents.length === 1 ? 'event' : 'events'}</b></header><div className="timeline-scroll">{timelineEvents.length ? <div className="timeline-events">{timelineEvents.map(item => <article key={item.id}><time>{item.time}</time><i style={{ background: kindColors.decision }} /><p><b title={item.decision}>{item.decision}</b><em>{item.agent}</em></p></article>)}</div> : <p className="timeline-empty">No events recorded.</p>}</div></section>
  </div>
}
