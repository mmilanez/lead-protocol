import { useEffect, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronDown, CircleDot, ClipboardCheck, Code2, FileCode2, FileText, GitBranch, GitCommitHorizontal, Handshake, LayoutDashboard, LockKeyhole, Menu, RefreshCw, ShieldCheck, Users, X } from 'lucide-react'

type View = 'Dashboard' | 'Agents' | 'Active Sessions' | 'Handoff' | 'Decisions' | 'Rules' | 'Validator'
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

const nav: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Agents', icon: Bot },
  { label: 'Active Sessions', icon: Activity }, { label: 'Handoff', icon: Handshake },
  { label: 'Decisions', icon: GitCommitHorizontal }, { label: 'Rules', icon: FileCode2 },
  { label: 'Validator', icon: ClipboardCheck },
]

function Panel({ title, path, children }: { title: string; path?: string; children: ReactNode }) {
  return <section className="panel"><header><h2>{title}</h2>{path && <small>{path}</small>}</header>{children}</section>
}
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: string }) {
  return <article className="metric"><div className={tone}><Icon /></div><span>{label}<strong>{value}</strong><button>Dados atuais</button></span></article>
}
function Empty({ children }: { children: ReactNode }) { return <div className="empty"><CircleDot />{children}</div> }
function displayStatus(status: string) {
  if (status === 'IN_PROGRESS') return 'Ativo'
  if (status === 'BLOCKED') return 'Pausado'
  if (status === 'STABLE') return 'Finalizado'
  return status
}
function SessionTable({ data, agents = false }: { data: ProtocolData; agents?: boolean }) {
  const rows = agents
    ? data.agents.map(a => [a.agent, a.actor, a.scope, a.activity, displayStatus(a.status)])
    : data.sessions.map(s => [s.agent, '—', s.topic, s.checkpoint || s.started, s.status])
  if (!rows.length) return <Empty>{agents ? 'Nenhum handoff de agente encontrado.' : 'Nenhuma sessão ativa registrada.'}</Empty>
  return <div className="table"><table><thead><tr><th>Agent ID</th><th>Actor</th><th>Escopo</th><th>Última atividade</th><th>Status</th></tr></thead><tbody>{rows.map((s, i) => <tr key={`${s[0]}-${i}`}><td><Code2 />{s[0]}</td><td>{s[1]}</td><td title={s[2]}>{s[2]}</td><td>{s[3]}</td><td><em className={String(s[4]).toLowerCase()}><i />{s[4]}</em></td></tr>)}</tbody></table></div>
}
function Timeline({ data }: { data: ProtocolData }) {
  if (!data.decisions.length) return <Empty>Nenhuma decisão registrada.</Empty>
  return <div className="timeline">{data.decisions.slice(0, 8).map(d => <div key={d.id}><i /><time>{d.time}</time><code>{d.id}</code><span title={d.rationale}>{d.decision}</span><em>{d.agent}</em></div>)}</div>
}
function Conflict({ data, go }: { data: ProtocolData; go?: (v: View) => void }) {
  if (!data.conflicts.length) return <div className="ok-banner"><CheckCircle2 /><div><b>Nenhum conflito detectado</b><span>Não há escopos concorrentes nas sessões ativas.</span></div></div>
  const conflict = data.conflicts[0]
  return <div className="warning"><AlertTriangle /><div><b>Atenção: conflito no escopo “{conflict.topic}”</b><span>Agentes envolvidos: {conflict.agents.join(', ')}.</span></div>{go && <button onClick={() => go('Active Sessions')}>Ver detalhes</button>}</div>
}

function Dashboard({ data, go, reload }: { data: ProtocolData; go: (v: View) => void; reload: () => void }) {
  const h = data.handoff
  return <>
    <div className="metrics"><Metric icon={Users} label="Sessões ativas" value={String(data.metrics.activeSessions)} tone="violet" /><Metric icon={GitCommitHorizontal} label="Decisões hoje" value={String(data.metrics.todayDecisions)} tone="blue" /><Metric icon={ShieldCheck} label="Protocolos OK" value={`${data.metrics.protocolPercent}%`} tone="green" /><Metric icon={AlertTriangle} label="Alertas" value={String(data.metrics.alerts)} tone="amber" /></div>
    <div className="grid"><div className="stack"><Panel title="Último handoff" path={h?.path ?? '.agents/local/*/*/handoff.md'}>{h ? <><div className="markdown"><b>Última ação:</b><p>{h.lastAction}</p><b>Próximo passo:</b><p>{h.pendingStep}</p><b>Bloqueios/Contexto:</b><p>{h.blockers}</p><b>Threads abertas:</b><p>{h.openThreads}</p></div><footer><span>Atualizado {h.updated} por {h.agent}</span><button className="primary" onClick={() => go('Handoff')}>Abrir handoff</button></footer></> : <Empty>Nenhum handoff encontrado.</Empty>}</Panel><Panel title="Decisões recentes" path=".agents/decisions.jsonl"><Timeline data={data} /><button className="link" onClick={() => go('Decisions')}>Ver todas as decisões <ArrowRight /></button></Panel></div>
      <div className="stack"><Panel title="Sessões ativas" path=".agents/sessions/active_sessions.md"><SessionTable data={data} /><button className="link" onClick={() => go('Active Sessions')}>Ver todas as sessões <ArrowRight /></button></Panel><Panel title="Arquivos do protocolo"><div className="files">{data.files.map(file => <div key={file.path}><FileText /><b>{file.path}</b><span>{file.updated}</span><em className={file.exists ? '' : 'missing'}><CircleDot /> {file.status}</em></div>)}</div><button className="link" onClick={() => go('Rules')}>Ver regras <ArrowRight /></button></Panel></div></div>
    <Conflict data={data} go={go} /><button className="validate" onClick={reload}><RefreshCw /> Atualizar dados agora</button>
  </>
}

function Page({ view, data, reload }: { view: Exclude<View, 'Dashboard'>; data: ProtocolData; reload: () => void }) {
  if (view === 'Agents') return <Panel title="Agentes encontrados" path=".agents/local/*/*/handoff.md"><SessionTable data={data} agents /></Panel>
  if (view === 'Active Sessions') return <div className="stack"><Conflict data={data} /><Panel title="Sessões concorrentes" path=".agents/sessions/active_sessions.md"><SessionTable data={data} /></Panel></div>
  if (view === 'Handoff') {
    const h = data.handoff
    return <Panel title="Handoff atual" path={h?.path}>{h ? <><div className="editor"><div><small>MARKDOWN REAL</small><pre>{h.raw}</pre></div><div><small>ESTADO INTERPRETADO</small><h2>{h.status}</h2><h3>Última ação</h3><p>{h.lastAction}</p><h3>Próximo passo</h3><p>{h.pendingStep}</p><h3>Bloqueios/Contexto</h3><p>{h.blockers}</p></div></div><footer><span>{h.timestamp} · {h.actor}/{h.agent}</span><button className="primary" onClick={reload}>Recarregar</button></footer></> : <Empty>Nenhum handoff encontrado.</Empty>}</Panel>
  }
  if (view === 'Decisions') return <Panel title="Linha do tempo de decisões" path=".agents/decisions.jsonl"><div className="filters"><input placeholder="Busca visual — dados lidos do JSONL" readOnly /><select><option>Todos os agentes</option>{[...new Set(data.decisions.map(d => d.agent))].map(a => <option key={a}>{a}</option>)}</select><select><option>Todos os status</option><option>completed</option></select></div><Timeline data={data} />{data.decisions[0] && <pre className="json">{JSON.stringify(data.decisions[0], null, 2)}</pre>}</Panel>
  if (view === 'Rules') return <div className="cards">{data.rules.map(rule => <Panel title={rule.name} key={rule.name}><div className="rule">{rule.exists ? <CheckCircle2 /> : <AlertTriangle />}<b>Precedência {rule.precedence}</b><p>{rule.modules?.length ? `Módulos ativos: ${rule.modules.join(', ')}` : rule.name === 'Active modules' ? 'Nenhum módulo ativo declarado.' : rule.exists ? 'Arquivo encontrado.' : 'Arquivo ausente.'}</p></div></Panel>)}</div>
  return <div className="stack"><Panel title="Validator" path="Verificação real da estrutura .agents/"><div className="summary"><div><CheckCircle2 /><strong>{data.validator.passed}</strong><span>Aprovadas</span></div><div><AlertTriangle /><strong>0</strong><span>Recomendações</span></div><div><X /><strong>{data.validator.errors}</strong><span>Erros</span></div></div><footer><span>Gerado em {new Date(data.generatedAt).toLocaleString('pt-BR')}</span><button className="primary" onClick={reload}>Executar novamente</button></footer></Panel><Panel title="Resultados"><div className="checks">{data.validator.checks.map(check => <div key={check.path}>{check.exists ? <CheckCircle2 /> : <X />}{check.path}<span>{check.status}</span></div>)}</div></Panel></div>
}

export default function LiveApp() {
  const [view, setView] = useState<View>('Dashboard'), [menu, setMenu] = useState(false)
  const [data, setData] = useState<ProtocolData | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const load = () => { setLoading(true); setError(''); fetch(`./api/protocol?t=${Date.now()}`, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() }).then(setData).catch(e => setError(`Não foi possível ler .agents: ${e.message}`)).finally(() => setLoading(false)) }
  useEffect(load, [])
  const go = (v: View) => { setView(v); setMenu(false); window.scrollTo(0, 0) }
  const actor = data?.handoff?.actor ?? 'local'
  return <div className="app"><aside className={menu ? 'open' : ''}><div className="brand"><b><GitBranch /></b><span><strong>Lead Protocol</strong><small>Console</small></span><button onClick={() => setMenu(false)}><X /></button></div><nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'active' : ''} onClick={() => go(label)}><Icon />{label}</button>)}</nav><div className="status"><small>STATUS DO PROTOCOLO</small><b className={data?.protocolValid ? '' : 'invalid'}>{data?.protocolValid ? <CheckCircle2 /> : <AlertTriangle />}{data?.protocolValid ? 'Válido' : 'Com erros'}</b><p>Fonte: arquivos reais da pasta .agents.</p><button onClick={load}>Atualizar agora</button></div><footer><LockKeyhole /> Leitura local via Node.js</footer></aside>{menu && <button className="scrim" onClick={() => setMenu(false)} />}
    <main><header className="topbar"><div><button className="menu" onClick={() => setMenu(true)}><Menu /></button><span><h1>{view}</h1><p>Dados reais do Lead Protocol · {loading ? 'atualizando...' : 'sincronizado'}</p></span></div><div className="profile"><span><CircleDot /> Leitura ativa</span><b>{actor.slice(0, 2).toUpperCase()}</b><strong>{actor}</strong><ChevronDown /></div></header><div className="content">{error ? <div className="warning"><AlertTriangle /><div><b>Falha ao carregar dados</b><span>{error}</span></div><button onClick={load}>Tentar novamente</button></div> : !data ? <div className="loading"><RefreshCw /> Lendo arquivos do protocolo...</div> : view === 'Dashboard' ? <Dashboard data={data} go={go} reload={load} /> : <Page view={view} data={data} reload={load} />}</div></main>
  </div>
}
