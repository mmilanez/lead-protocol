import { useEffect, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, CircleDot, ClipboardCheck, Code2, FileCode2, FileText, GitBranch, GitCommitHorizontal, Handshake, LayoutDashboard, LockKeyhole, Menu, Network, PanelLeftClose, PanelLeftOpen, RefreshCw, ShieldCheck, Users, X } from 'lucide-react'
import GraphView from './GraphView'
import './graph-launcher.css'
import './sidebar-collapse.css'
import './graph-full-area.css'

type View = 'Dashboard' | 'Graph' | 'Agents' | 'Active Sessions' | 'Handoff' | 'Decisions' | 'Rules' | 'Validator'
type GraphLayout = 'directed' | 'organic' | 'radial'
type ProtocolData = {
  generatedAt: string
  metrics: { activeSessions: number; todayDecisions: number; protocolPercent: number; alerts: number }
  protocolValid: boolean
  sessions: { id: string; agent: string; started: string; topic: string; checkpoint: string; status: string }[]
  agents: { agent: string; actor: string; activity: string; status: string; scope: string }[]
  handoff: null | { actor: string; agent: string; path: string; timestamp: string; status: string; lastAction: string; pendingStep: string; blockers: string; openThreads: string; updated: string; raw: string }
  decisions: { timestamp: string; time: string; id: string; decision: string; rationale: string; agent: string; files: string[]; status: string }[]
  files: { path: string; exists: boolean; status: string; updated: string }[]
  conflicts: { topic: string; agents: string[] }[]
  rules: { name: string; precedence: number; exists: boolean; modules?: string[] }[]
  validator: { passed: number; errors: number; checks: { path: string; exists: boolean; status: string; updated: string }[] }
}

const viewLabels: Record<View, string> = { Dashboard: 'Overview', Graph: 'Graph', Agents: 'Agents', 'Active Sessions': 'Sessions', Handoff: 'Handoff', Decisions: 'Decisions', Rules: 'Rules', Validator: 'Validator' }
const viewSlugs: Record<View, string> = { Dashboard: 'dashboard', Graph: 'graph', Agents: 'agents', 'Active Sessions': 'sessions', Handoff: 'handoff', Decisions: 'decisions', Rules: 'rules', Validator: 'validator' }
const initialView = () => (Object.keys(viewSlugs) as View[]).find(view => viewSlugs[view] === window.location.hash.slice(1)) ?? 'Dashboard'
const initialSidebar = () => new URLSearchParams(window.location.search).get('sidebar') === 'collapsed' || window.localStorage.getItem('lead-protocol-sidebar') === 'collapsed'
const nav: { view: View; icon: typeof LayoutDashboard }[] = [
  { view: 'Dashboard', icon: LayoutDashboard }, { view: 'Graph', icon: Network }, { view: 'Agents', icon: Bot },
  { view: 'Active Sessions', icon: Activity }, { view: 'Handoff', icon: Handshake },
  { view: 'Decisions', icon: GitCommitHorizontal }, { view: 'Rules', icon: FileCode2 },
  { view: 'Validator', icon: ClipboardCheck },
]

function Panel({ title, path, children }: { title: string; path?: string; children: ReactNode }) {
  return <section className="panel"><header><h2>{title}</h2>{path && <small>{path}</small>}</header>{children}</section>
}
function Metric({ icon: Icon, label, value, tone, onClick }: { icon: typeof Users; label: string; value: string; tone: string; onClick: () => void }) {
  return <article className="metric"><div className={tone}><Icon /></div><span>{label}<strong>{value}</strong><button onClick={onClick}>View details</button></span></article>
}
function Empty({ children }: { children: ReactNode }) { return <div className="empty"><CircleDot />{children}</div> }
function displayStatus(status: string) {
  if (status === 'IN_PROGRESS') return 'Active'
  if (status === 'BLOCKED') return 'Paused'
  if (status === 'STABLE') return 'Completed'
  return status
}
function SessionTable({ data, agents = false }: { data: ProtocolData; agents?: boolean }) {
  const rows = agents
    ? data.agents.map(a => [a.agent, a.actor, a.scope, a.activity, displayStatus(a.status)])
    : data.sessions.map(s => [s.agent, '—', s.topic, s.checkpoint || s.started, s.status])
  if (!rows.length) return <Empty>{agents ? 'No agent handoffs found.' : 'No active sessions registered.'}</Empty>
  return <div className="table"><table><thead><tr><th>Agent ID</th><th>Actor</th><th>Scope</th><th>Last activity</th><th>Status</th></tr></thead><tbody>{rows.map((s, i) => <tr key={`${s[0]}-${i}`}><td><Code2 />{s[0]}</td><td>{s[1]}</td><td title={s[2]}>{s[2]}</td><td>{s[3]}</td><td><em className={String(s[4]).toLowerCase()}><i />{s[4]}</em></td></tr>)}</tbody></table></div>
}
function Timeline({ decisions, limit }: { decisions: ProtocolData['decisions']; limit?: number }) {
  if (!decisions.length) return <Empty>No decisions found.</Empty>
  const visibleDecisions = limit ? decisions.slice(0, limit) : decisions
  return <div className="timeline">{visibleDecisions.map(d => <div key={d.id}><i /><time>{d.time}</time><code>{d.id}</code><span title={d.rationale}>{d.decision}</span><em>{d.agent}</em></div>)}</div>
}
function Conflict({ data, go }: { data: ProtocolData; go?: (v: View) => void }) {
  if (!data.conflicts.length) return <div className="ok-banner"><CheckCircle2 /><div><b>No conflicts detected</b><span>There are no overlapping scopes in active sessions.</span></div></div>
  const conflict = data.conflicts[0]
  return <div className="warning"><AlertTriangle /><div><b>Warning: conflict in scope “{conflict.topic}”</b><span>Agents involved: {conflict.agents.join(', ')}.</span></div>{go && <button onClick={() => go('Active Sessions')}>View details</button>}</div>
}

function Dashboard({ data, go, reload, openGraph }: { data: ProtocolData; go: (v: View) => void; reload: () => void; openGraph: (layout: GraphLayout) => void }) {
  const h = data.handoff
  const [graphLayout, setGraphLayout] = useState<GraphLayout>(() => {
    const value = new URLSearchParams(window.location.search).get('layout')
    return value === 'organic' || value === 'radial' ? value : 'directed'
  })
  return <>
    <div className="metrics"><Metric icon={Users} label="Active sessions" value={String(data.metrics.activeSessions)} tone="violet" onClick={() => go('Active Sessions')} /><Metric icon={GitCommitHorizontal} label="Decisions today" value={String(data.metrics.todayDecisions)} tone="blue" onClick={() => go('Decisions')} /><Metric icon={ShieldCheck} label="Integrity" value={`${data.metrics.protocolPercent}%`} tone="green" onClick={() => go('Validator')} /><Metric icon={AlertTriangle} label="Alerts" value={String(data.metrics.alerts)} tone="amber" onClick={() => go('Active Sessions')} /></div>
    <section className="graph-launcher"><div><span><Network /></span><p><b>Operational graph</b><small>Explore agents, decisions, files, and relationships using current data.</small></p></div><label>View<select value={graphLayout} onChange={event => setGraphLayout(event.target.value as GraphLayout)}><option value="directed">Directed</option><option value="organic">Organic</option><option value="radial">Radial</option></select></label><button className="primary" onClick={() => openGraph(graphLayout)}>Open graph <ArrowRight /></button></section>
    <div className="grid"><div className="stack"><Panel title="Latest handoff" path={h?.path ?? '.agents/local/*/*/handoff.md'}>{h ? <><div className="markdown"><b>Last action:</b><p>{h.lastAction}</p><b>Next step:</b><p>{h.pendingStep}</p><b>Blockers/Context:</b><p>{h.blockers}</p><b>Open threads:</b><p>{h.openThreads}</p></div><footer><span>Updated {h.updated} by {h.agent}</span><button className="primary" onClick={() => go('Handoff')}>Open handoff</button></footer></> : <Empty>No handoff found.</Empty>}</Panel><Panel title="Recent decisions" path=".agents/decisions.jsonl"><Timeline decisions={data.decisions} limit={8} /><button className="link" onClick={() => go('Decisions')}>View all decisions <ArrowRight /></button></Panel></div>
      <div className="stack"><Panel title="Active sessions" path=".agents/sessions/active_sessions.md"><SessionTable data={data} /><button className="link" onClick={() => go('Active Sessions')}>View all sessions <ArrowRight /></button></Panel><Panel title="Protocol files"><div className="files">{data.files.map(file => <div key={file.path}><FileText /><b>{file.path}</b><span>{file.updated}</span><em className={file.exists ? '' : 'missing'}><CircleDot /> {file.status}</em></div>)}</div><button className="link" onClick={() => go('Rules')}>View rules <ArrowRight /></button></Panel></div></div>
    <Conflict data={data} go={go} /><button className="validate" onClick={reload}><RefreshCw /> Refresh data now</button>
  </>
}

function DecisionsPage({ data }: { data: ProtocolData }) {
  const [query, setQuery] = useState('')
  const [agent, setAgent] = useState('')
  const [status, setStatus] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
  const agents = [...new Set(data.decisions.map(decision => decision.agent))].sort()
  const statuses = [...new Set(data.decisions.map(decision => decision.status))].sort()
  const filtered = data.decisions.filter(decision => {
    const searchable = [decision.id, decision.decision, decision.rationale, decision.agent, decision.status].join(' ').toLocaleLowerCase('pt-BR')
    return (!normalizedQuery || searchable.includes(normalizedQuery)) && (!agent || decision.agent === agent) && (!status || decision.status === status)
  })

  return <Panel title="Decision timeline" path=".agents/decisions.jsonl">
    <div className="filters">
      <input aria-label="Search decisions" placeholder="Search decisions..." value={query} onChange={event => setQuery(event.target.value)} />
      <select aria-label="Filter by agent" value={agent} onChange={event => setAgent(event.target.value)}><option value="">All agents</option>{agents.map(item => <option key={item} value={item}>{item}</option>)}</select>
      <select aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(item => <option key={item} value={item}>{item}</option>)}</select>
    </div>
    <div className="filter-result">{filtered.length} {filtered.length === 1 ? 'decision found' : 'decisions found'}</div>
    <Timeline decisions={filtered} />
    {filtered[0] && <pre className="json">{JSON.stringify(filtered[0], null, 2)}</pre>}
  </Panel>
}

function Page({ view, data, reload }: { view: Exclude<View, 'Dashboard'>; data: ProtocolData; reload: () => void }) {
  if (view === 'Graph') return <GraphView data={data} reload={reload} />
  if (view === 'Agents') return <Panel title="Agents found" path=".agents/local/*/*/handoff.md"><SessionTable data={data} agents /></Panel>
  if (view === 'Active Sessions') return <div className="stack"><Conflict data={data} /><Panel title="Concurrent sessions" path=".agents/sessions/active_sessions.md"><SessionTable data={data} /></Panel></div>
  if (view === 'Handoff') {
    const h = data.handoff
    return <Panel title="Current handoff" path={h?.path}>{h ? <><div className="editor"><div><small>ORIGINAL CONTENT</small><pre>{h.raw}</pre></div><div><small>OPERATIONAL SUMMARY</small><h2>{h.status}</h2><h3>Last action</h3><p>{h.lastAction}</p><h3>Next step</h3><p>{h.pendingStep}</p><h3>Blockers/Context</h3><p>{h.blockers}</p></div></div><footer><span>{h.timestamp} · {h.actor}/{h.agent}</span><button className="primary" onClick={reload}>Reload</button></footer></> : <Empty>No handoff found.</Empty>}</Panel>
  }
  if (view === 'Decisions') return <DecisionsPage data={data} />
  if (view === 'Rules') return <div className="cards">{data.rules.map(rule => <Panel title={rule.name} key={rule.name}><div className="rule">{rule.exists ? <CheckCircle2 /> : <AlertTriangle />}<b>Precedence {rule.precedence}</b><p>{rule.modules?.length ? `Active modules: ${rule.modules.join(', ')}` : rule.name === 'Active modules' ? 'No active modules declared.' : rule.exists ? 'File found.' : 'File missing.'}</p></div></Panel>)}</div>
  return <div className="stack"><Panel title="Validator" path="Operational structure integrity"><div className="summary"><div><ClipboardCheck /><strong>{data.validator.checks.length}</strong><span>Checks</span></div><div><CheckCircle2 /><strong>{data.validator.passed}</strong><span>Passed</span></div><div><X /><strong>{data.validator.errors}</strong><span>Errors</span></div></div><footer><span>Generated at {new Date(data.generatedAt).toLocaleString('en-US')}</span><button className="primary" onClick={reload}>Run again</button></footer></Panel><Panel title="Results"><div className="checks">{data.validator.checks.map(check => <div key={check.path}>{check.exists ? <CheckCircle2 /> : <X />}{check.path}<span>{check.status}</span></div>)}</div></Panel></div>
}

export default function LiveApp() {
  const [view, setView] = useState<View>(initialView), [menu, setMenu] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebar)
  const [data, setData] = useState<ProtocolData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`./api/protocol?t=${Date.now()}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`)
      setData(payload as ProtocolData)
    } catch (reason) {
      setError(`Unable to load operational data: ${reason instanceof Error ? reason.message : 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])
  const go = (v: View) => { setView(v); setMenu(false); window.history.replaceState(null, '', `#${viewSlugs[v]}`); window.scrollTo(0, 0) }
  const openGraph = (layout: GraphLayout) => { const url = new URL(window.location.href); if (layout === 'directed') url.searchParams.delete('layout'); else url.searchParams.set('layout', layout); window.history.replaceState(null, '', url); go('Graph') }
  const toggleSidebar = () => setSidebarCollapsed(value => { const next = !value; const url = new URL(window.location.href); if (next) url.searchParams.set('sidebar', 'collapsed'); else url.searchParams.delete('sidebar'); window.history.replaceState(null, '', url); window.localStorage.setItem('lead-protocol-sidebar', next ? 'collapsed' : 'expanded'); return next })
  const actor = data?.handoff?.actor ?? 'local'
  return <div className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${view === 'Graph' ? 'graph-active' : ''}`}><aside className={menu ? 'open' : ''}><div className="brand"><b><GitBranch /></b><span><strong>Lead Protocol</strong><small>Console</small></span><button className="sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleSidebar}>{sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button><button className="mobile-close" aria-label="Close menu" onClick={() => setMenu(false)}><X /></button></div><nav>{nav.map(({ view: target, icon: Icon }) => <button key={target} title={sidebarCollapsed ? viewLabels[target] : undefined} className={view === target ? 'active' : ''} onClick={() => go(target)}><Icon /><span>{viewLabels[target]}</span></button>)}</nav><div className="status"><small>PROTOCOL STATUS</small><b className={data?.protocolValid ? '' : 'invalid'}>{data?.protocolValid ? <CheckCircle2 /> : <AlertTriangle />}{data?.protocolValid ? 'Valid' : 'Has errors'}</b><p>Monitoring updated on demand.</p><button onClick={load} disabled={loading}>{loading ? 'Updating...' : 'Refresh now'}</button></div><footer><LockKeyhole /><span>Secure local environment</span></footer></aside>{menu && <button className="scrim" aria-label="Close menu" onClick={() => setMenu(false)} />}
    <main><header className="topbar"><div><button className="menu" aria-label="Open menu" onClick={() => setMenu(true)}><Menu /></button><span><h1>{viewLabels[view]}</h1><p>Operational view · {loading ? 'updating...' : 'synchronized'}</p></span></div><div className="profile"><span><CircleDot /> {loading ? 'Updating' : 'Synchronized'}</span><b>{actor.slice(0, 2).toUpperCase()}</b><strong>{actor}</strong></div></header><div className="content">{error ? <div className="warning"><AlertTriangle /><div><b>Failed to load data</b><span>{error}</span></div><button onClick={load}>Try again</button></div> : !data ? <div className="loading"><RefreshCw /> Loading operational data...</div> : view === 'Dashboard' ? <Dashboard data={data} go={go} reload={load} openGraph={openGraph} /> : <Page view={view} data={data} reload={load} />}</div></main>
  </div>
}
