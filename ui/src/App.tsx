import { useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, ArrowRight, Bot, CheckCircle2, ChevronDown, CircleDot, ClipboardCheck, Code2, FileCode2, FileText, GitBranch, GitCommitHorizontal, Handshake, LayoutDashboard, LockKeyhole, Menu, RefreshCw, ShieldCheck, Users, X } from 'lucide-react'

type View = 'Dashboard' | 'Agents' | 'Active Sessions' | 'Handoff' | 'Decisions' | 'Rules' | 'Validator'
const nav: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Agents', icon: Bot },
  { label: 'Active Sessions', icon: Activity }, { label: 'Handoff', icon: Handshake },
  { label: 'Decisions', icon: GitCommitHorizontal }, { label: 'Rules', icon: FileCode2 },
  { label: 'Validator', icon: ClipboardCheck },
]
const sessions = [
  ['codex', 'alvaro', 'api-auth', 'há 2 min', 'Ativo'],
  ['gpt-4.1', 'alvaro', 'api-auth', 'há 15 min', 'Ativo'],
  ['claude-3.7', 'marina', 'docs', 'há 1 h', 'Pausado'],
]
const decisions = [
  ['13:45', 'DEC-2026-0042', 'Usar JWT com rotação de refresh token', 'codex'],
  ['12:30', 'DEC-2026-0041', 'Versionar rotas públicas em /api/v1', 'gpt-4.1'],
  ['11:10', 'DEC-2026-0040', 'Padronizar respostas de erro em JSON', 'claude-3.7'],
]
const files = ['CORE_RULES.md', 'PROJECT_RULES.md', 'active_sessions.md', 'decisions.jsonl', 'handoff.md']

function Panel({ title, path, children }: { title: string; path?: string; children: ReactNode }) {
  return <section className="panel"><header><h2>{title}</h2>{path && <small>{path}</small>}</header>{children}</section>
}
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: string }) {
  return <article className="metric"><div className={tone}><Icon /></div><span>{label}<strong>{value}</strong><button>Ver detalhes</button></span></article>
}
function SessionTable({ all = false }: { all?: boolean }) {
  return <div className="table"><table><thead><tr><th>Agent ID</th><th>Actor</th><th>Escopo</th><th>Última atividade</th><th>Status</th></tr></thead><tbody>{sessions.concat(all ? [['cursor', 'renato', 'frontend', 'há 1 dia', 'Finalizado']] : []).map(s => <tr key={s[0]}><td><Code2 />{s[0]}</td><td>{s[1]}</td><td>{s[2]}</td><td>{s[3]}</td><td><em className={s[4].toLowerCase()}><i />{s[4]}</em></td></tr>)}</tbody></table></div>
}
function Timeline() { return <div className="timeline">{decisions.map(d => <div key={d[1]}><i /><time>{d[0]}</time><code>{d[1]}</code><span>{d[2]}</span><em>{d[3]}</em></div>)}</div> }

function Dashboard({ go, open, validate }: { go: (v: View) => void; open: () => void; validate: () => void }) {
  return <>
    <div className="metrics"><Metric icon={Users} label="Sessões ativas" value="3" tone="violet" /><Metric icon={GitCommitHorizontal} label="Decisões hoje" value="8" tone="blue" /><Metric icon={ShieldCheck} label="Protocolos OK" value="100%" tone="green" /><Metric icon={AlertTriangle} label="Alertas" value="1" tone="amber" /></div>
    <div className="grid"><div className="stack"><Panel title="Último handoff" path=".agents/local/alvaro/codex/handoff.md"><div className="markdown"><b>Tarefa atual:</b><p>Implementar autenticação JWT no módulo de API</p><b>Próximo passo:</b><p>Criar middleware de autorização</p><b>Bloqueios:</b><p>Aguardando definição de roles e permissões</p><b>Observações:</b><p>Estrutura do banco criada na migration 2026_06_19</p></div><footer><span>Atualizado há 12 min por codex</span><button className="primary" onClick={open}>Abrir handoff</button></footer></Panel><Panel title="Decisões recentes" path=".agents/decisions.jsonl"><Timeline /><button className="link" onClick={() => go('Decisions')}>Ver todas as decisões <ArrowRight /></button></Panel></div>
      <div className="stack"><Panel title="Sessões ativas" path=".agents/sessions/active_sessions.md"><SessionTable /><button className="link" onClick={() => go('Active Sessions')}>Ver todas as sessões <ArrowRight /></button></Panel><Panel title="Arquivos do protocolo"><div className="files">{files.map((file, i) => <div key={file}><FileText /><b>.agents/{file}</b><span>há {i + 2} min</span><em><CircleDot /> OK</em></div>)}</div><button className="link" onClick={() => go('Rules')}>Ver todos os arquivos <ArrowRight /></button></Panel></div></div>
    <div className="warning"><AlertTriangle /><div><b>Atenção: 1 possível conflito detectado</b><span>As sessões “codex” e “gpt-4.1” editaram o módulo auth nas últimas 2 horas.</span></div><button onClick={() => go('Active Sessions')}>Ver detalhes</button></div>
    <button className="validate" onClick={validate}><RefreshCw /> Executar validação do protocolo</button>
  </>
}
function Page({ view, open, validate }: { view: Exclude<View, 'Dashboard'>; open: () => void; validate: () => void }) {
  if (view === 'Agents' || view === 'Active Sessions') return <div className="stack">{view === 'Active Sessions' && <div className="warning"><AlertTriangle /><div><b>Conflito de escopo detectado</b><span>codex e gpt-4.1 estão trabalhando em api-auth.</span></div><button><LockKeyhole /> Bloquear escopo</button></div>}<Panel title={view === 'Agents' ? 'Agentes registrados' : 'Sessões concorrentes'}><SessionTable all /></Panel></div>
  if (view === 'Handoff') return <Panel title="Handoff atual" path=".agents/local/alvaro/codex/handoff.md"><div className="editor"><div><small>MARKDOWN</small><pre>{`# Current handoff\n\n## Current task\nImplementar autenticação JWT.\n\n## Next step\nCriar middleware de autorização.\n\n## Blockers\nDefinir roles e permissões.`}</pre></div><div><small>VISUALIZAÇÃO</small><h2>Current handoff</h2><h3>Current task</h3><p>Implementar autenticação JWT.</p><h3>Next step</h3><p>Criar middleware de autorização.</p></div></div><footer><span>Atualizado há 12 minutos</span><button className="primary" onClick={open}>Registrar novo handoff</button></footer></Panel>
  if (view === 'Decisions') return <Panel title="Linha do tempo de decisões" path=".agents/decisions.jsonl"><div className="filters"><input placeholder="Buscar decisão..." /><select><option>Todos os agentes</option><option>codex</option></select><select><option>Todos os módulos</option><option>auth</option></select></div><Timeline /><pre className="json">{JSON.stringify({ id: 'DEC-2026-0042', agent: 'codex', module: 'auth', decision: 'JWT com refresh token' }, null, 2)}</pre></Panel>
  if (view === 'Rules') return <div className="cards">{['CORE_RULES.md', 'PROJECT_RULES.md', 'modules/git-substrate.md'].map((x, i) => <Panel title={x} key={x}><div className="rule"><CheckCircle2 /><b>Precedência {i + 1}</b><p>Arquivo carregado e consistente.</p></div></Panel>)}</div>
  return <div className="stack"><Panel title="Validator" path="Verificação da estrutura .agents/"><div className="summary"><div><CheckCircle2 /><strong>12</strong><span>Aprovadas</span></div><div><AlertTriangle /><strong>1</strong><span>Recomendação</span></div><div><X /><strong>0</strong><span>Erros</span></div></div><footer><span>Última execução há 5 minutos</span><button className="primary" onClick={validate}>Executar novamente</button></footer></Panel><Panel title="Resultados"><div className="checks">{['Estrutura .agents/ encontrada', 'Arquivos obrigatórios presentes', 'Schema do handoff válido', 'decisions.jsonl válido'].map(x => <div key={x}><CheckCircle2 />{x}<span>Aprovado</span></div>)}</div></Panel></div>
}

export default function App() {
  const [view, setView] = useState<View>('Dashboard'), [menu, setMenu] = useState(false), [modal, setModal] = useState(false), [toast, setToast] = useState(false)
  const go = (v: View) => { setView(v); setMenu(false); window.scrollTo(0, 0) }
  const validate = () => { setToast(true); setTimeout(() => setToast(false), 3000) }
  return <div className="app"><aside className={menu ? 'open' : ''}><div className="brand"><b><GitBranch /></b><span><strong>Lead Protocol</strong><small>Console</small></span><button onClick={() => setMenu(false)}><X /></button></div><nav>{nav.map(({ label, icon: Icon }) => <button key={label} className={view === label ? 'active' : ''} onClick={() => go(label)}><Icon />{label}</button>)}</nav><div className="status"><small>STATUS DO PROTOCOLO</small><b><CheckCircle2 /> Válido</b><p>Todos os arquivos estão consistentes.</p><button onClick={() => go('Validator')}>Executar validação</button></div><footer><LockKeyhole /> Lead Protocol v2.0.0</footer></aside>{menu && <button className="scrim" onClick={() => setMenu(false)} />}
    <main><header className="topbar"><div><button className="menu" onClick={() => setMenu(true)}><Menu /></button><span><h1>{view}</h1><p>Visão operacional do Lead Protocol e sessões de agentes</p></span></div><div className="profile"><span><CircleDot /> Protocolo ativo</span><b>AR</b><strong>alvaro</strong><ChevronDown /></div></header><div className="content">{view === 'Dashboard' ? <Dashboard go={go} open={() => setModal(true)} validate={validate} /> : <Page view={view} open={() => setModal(true)} validate={validate} />}</div></main>
    {modal && <div className="backdrop" onMouseDown={() => setModal(false)}><form onMouseDown={e => e.stopPropagation()} onSubmit={e => { e.preventDefault(); setModal(false); setToast(true); setTimeout(() => setToast(false), 3000) }}><header><h2>Registrar novo handoff</h2><button type="button" onClick={() => setModal(false)}><X /></button></header><label>Tarefa atual<textarea defaultValue="Implementar autenticação JWT no módulo de API" /></label><label>Próximo passo<textarea defaultValue="Criar middleware de autorização" /></label><label>Bloqueios<textarea defaultValue="Aguardando definição de roles" /></label><footer><button type="button" onClick={() => setModal(false)}>Cancelar</button><button className="primary">Registrar handoff</button></footer></form></div>}{toast && <div className="toast"><CheckCircle2 /> Operação concluída com sucesso.</div>}</div>
}
