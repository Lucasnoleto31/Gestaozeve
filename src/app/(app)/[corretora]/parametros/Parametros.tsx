'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import {
  excluirAssessor, excluirConsolidado, excluirFaixa, excluirMultiplicador, excluirResponsavel, excluirStatusConta, excluirStatusLead,
  recalcularTudo, salvarAssessor, salvarConsolidado, salvarFaixa, salvarMultiplicador, salvarParametro, salvarResponsavel, salvarStatusConta, salvarStatusLead,
} from '@/lib/gestao/acoes'
import type { parametrosDaCorretora } from '@/lib/gestao/consultas'
import type { AssessorParam, Resultado } from '@/lib/gestao/tipos'
import type { Corretora } from '@/lib/corretoras'
import { numeroBR } from '@/lib/gestao/planilhas'
import { n0, n2, r0, TRACO } from '@/components/gestao/Celulas'
import { fmtNum } from '@/lib/format'

type Dados = Awaited<ReturnType<typeof parametrosDaCorretora>>

// Executa uma ação, mostra erro e recarrega a página
function useAcao() {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const rodar = async (fn: () => Promise<Resultado<unknown>>, depois?: () => void) => {
    setOcupado(true); setErro(null)
    const r = await fn()
    setOcupado(false)
    if (!r.ok) { setErro(r.erro); return false }
    depois?.()
    router.refresh()
    return true
  }
  return { erro, ocupado, rodar, limpar: () => setErro(null) }
}

export function Parametros({ corretora, label, dados }: { corretora: Corretora; label: string; dados: Dados }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <SecaoGerais corretora={corretora} label={label} parametros={dados.parametros} gerais={dados.gerais} />
        <SecaoManutencao corretora={corretora} />
      </div>
      <SecaoAssessores corretora={corretora} assessores={dados.assessores} naoCadastrados={dados.assessoresNaoCadastrados} responsaveis={dados.responsaveis.filter(r => r.ativo && r.atende_clientes).map(r => r.nome)} />
      <div className="grid gap-5 xl:grid-cols-2">
        <SecaoStatusConta corretora={corretora} mapa={dados.statusConta} naoMapeadas={dados.situacoesNaoMapeadas} />
        <SecaoConsolidados corretora={corretora} itens={dados.consolidados} />
        <SecaoMultiplicadores corretora={corretora} itens={dados.multiplicadores} />
        <SecaoFaixas corretora={corretora} itens={dados.faixas} />
        <SecaoStatusLead itens={dados.statusLead} />
        <SecaoResponsaveis itens={dados.responsaveis} />
      </div>
    </div>
  )
}

// ── Gerais ─────────────────────────────────────────────────────────────────
function SecaoGerais({ corretora, label, parametros, gerais }: { corretora: Corretora; label: string; parametros: Dados['parametros']; gerais: Dados['gerais'] }) {
  const { erro, rodar } = useAcao()
  const campos = [
    { corr: corretora as string, chave: 'zeragem_padrao', label: 'ZeragemRS (R$ por contrato zerado · assessores com zeragem PADRAO)', tipo: 'numero' },
    { corr: corretora as string, chave: 'meses_inativo', label: 'MesesInativo (meses sem giro para o cliente virar Inativo)', tipo: 'numero' },
    { corr: corretora as string, chave: 'modo_zeragem', label: 'ModoZeragem (texto no campo MODO que marca a linha como zeragem)', tipo: 'texto' },
    { corr: 'GERAL', chave: 'dias_alerta_lead', label: 'Dias sem contato para alertar um lead em aberto (vale para todas)', tipo: 'numero' },
  ]
  const valorDe = (corr: string, chave: string) => (corr === 'GERAL' ? gerais : parametros).find(p => p.chave === chave)?.valor ?? ''
  return (
    <Panel title={`Premissas gerais · ${label}`} subtitle="Os mesmos nomes da aba Premissas da planilha.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <div className="space-y-3">
        {campos.map(c => <CampoParametro key={c.chave} label={c.label} valor={valorDe(c.corr, c.chave)} tipo={c.tipo} onSalvar={v => rodar(() => salvarParametro(c.corr, c.chave, v))} />)}
      </div>
    </Panel>
  )
}

function CampoParametro({ label, valor, tipo, onSalvar }: { label: string; valor: string; tipo: string; onSalvar: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState(valor)
  const [salvando, setSalvando] = useState(false)
  const mudou = v !== valor
  return (
    <div className="flex items-end gap-2">
      <label className="flex-1">
        <span className="label block">{label}</span>
        <input className="field-sm mt-1 w-full" value={v} inputMode={tipo === 'numero' ? 'decimal' : undefined} onChange={e => setV(e.target.value)} />
      </label>
      <Button size="sm" variant={mudou ? 'primary' : 'secondary'} disabled={!mudou} loading={salvando} onClick={async () => { setSalvando(true); await onSalvar(v); setSalvando(false) }}>Salvar</Button>
    </div>
  )
}

// ── Manutenção ─────────────────────────────────────────────────────────────
function SecaoManutencao({ corretora }: { corretora: Corretora }) {
  const { erro, ocupado, rodar } = useAcao()
  const [res, setRes] = useState<Record<string, number> | null>(null)
  return (
    <Panel title="Manutenção" subtitle="Refaz a conta principal de cada cliente, o vínculo dos lotes com o cadastro, os valores derivados (tarifa, zeragem, pontos) e o cruzamento de leads.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <Button variant="secondary" loading={ocupado} onClick={() => rodar(async () => { const r = await recalcularTudo(corretora); if (r.ok) setRes(r.dados); return r })}>
        <RefreshCw className="h-4 w-4" />Recalcular tudo
      </Button>
      {res && (
        <p className="mt-3 text-xs text-fg-muted">
          Contas principais ajustadas: {fmtNum(res.marcar_contas_principais ?? 0)} · lotes vinculados: {fmtNum(res.vincular_lotes ?? 0)} · lotes recalculados: {fmtNum(res.recalcular_lotes ?? 0)} · leads cruzados: {fmtNum(res.vincular_leads ?? 0)}
        </p>
      )}
    </Panel>
  )
}

// ── Assessores ─────────────────────────────────────────────────────────────
type FormAssessor = { id: string | null; nome: string; id_assessor: string; corretagem: string; tipo_zeragem: 'PADRAO' | 'FIXA'; zeragem_fixa: string; responsavel: string; ativo: boolean }
const formVazio = (nome = ''): FormAssessor => ({ id: null, nome, id_assessor: '', corretagem: '0,25', tipo_zeragem: 'PADRAO', zeragem_fixa: '0', responsavel: '', ativo: true })

function SecaoAssessores({ corretora, assessores, naoCadastrados, responsaveis }: { corretora: Corretora; assessores: AssessorParam[]; naoCadastrados: Dados['assessoresNaoCadastrados']; responsaveis: string[] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [form, setForm] = useState<FormAssessor | null>(null)

  const salvar = () => form && rodar(() => salvarAssessor(corretora, {
    id: form.id, nome: form.nome, id_assessor: form.id_assessor || null, corretagem: numeroBR(form.corretagem), tipo_zeragem: form.tipo_zeragem,
    zeragem_fixa: numeroBR(form.zeragem_fixa), responsavel: form.responsavel || null, ativo: form.ativo,
  }), () => setForm(null))
  const editar = (a: AssessorParam) => setForm({ id: a.id, nome: a.nome, id_assessor: a.id_assessor ?? '', corretagem: String(a.corretagem).replace('.', ','), tipo_zeragem: a.tipo_zeragem, zeragem_fixa: String(a.zeragem_fixa).replace('.', ','), responsavel: a.responsavel ?? '', ativo: a.ativo })
  const excluir = (a: AssessorParam) => confirm(`Excluir ${a.nome}? Os lotes dele passam a usar tarifa 0 até ser cadastrado de novo.`) && rodar(() => excluirAssessor(corretora, a.id))

  const linhaForm = (
    <tr className="bg-accent-soft/40">
      <td><input className="field-sm w-full" placeholder="Nome como vem no export" value={form?.nome ?? ''} onChange={e => form && setForm({ ...form, nome: e.target.value })} /></td>
      <td><input className="field-sm w-24" placeholder="ID" value={form?.id_assessor ?? ''} onChange={e => form && setForm({ ...form, id_assessor: e.target.value })} /></td>
      <td><input className="field-sm w-20 text-right" value={form?.corretagem ?? ''} onChange={e => form && setForm({ ...form, corretagem: e.target.value })} /></td>
      <td>
        <select className="field-sm" value={form?.tipo_zeragem ?? 'PADRAO'} onChange={e => form && setForm({ ...form, tipo_zeragem: e.target.value as 'PADRAO' | 'FIXA' })}>
          <option value="PADRAO">PADRAO</option><option value="FIXA">FIXA</option>
        </select>
      </td>
      <td><input className="field-sm w-20 text-right" disabled={form?.tipo_zeragem !== 'FIXA'} value={form?.zeragem_fixa ?? ''} onChange={e => form && setForm({ ...form, zeragem_fixa: e.target.value })} /></td>
      <td>
        <select className="field-sm" value={form?.responsavel ?? ''} onChange={e => form && setForm({ ...form, responsavel: e.target.value })}>
          <option value="">—</option>{responsaveis.map(r => <option key={r}>{r}</option>)}
        </select>
      </td>
      <td><input type="checkbox" checked={form?.ativo ?? true} onChange={e => form && setForm({ ...form, ativo: e.target.checked })} /></td>
      <td className="whitespace-nowrap text-right">
        <IconButton tone="success" aria-label="Salvar" disabled={ocupado} onClick={salvar}><Check className="h-4 w-4" /></IconButton>
        <IconButton aria-label="Cancelar" onClick={() => setForm(null)}><X className="h-4 w-4" /></IconButton>
      </td>
    </tr>
  )

  return (
    <Panel title="Assessores" subtitle="Corretagem em R$ por lote operado. Zeragem: PADRAO usa o ZeragemRS geral; FIXA usa o valor do assessor. O responsável interno (Artur/Lucas) é herdado pelos clientes do assessor." flush
      action={<Button size="sm" onClick={() => setForm(formVazio())} disabled={!!form}><Plus className="h-3.5 w-3.5" />Assessor</Button>}>
      {erro && <div className="px-5 pt-4"><Alert tone="danger">{erro}</Alert></div>}
      {naoCadastrados.length > 0 && (
        <div className="px-5 pt-4">
          <Alert tone="warning" title={`${naoCadastrados.length} assessor(es) aparecem nos exports mas não estão cadastrados (tarifa 0 e sem responsável)`}>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {naoCadastrados.map(a => (
                <button key={a.assessor_nome} type="button" className="chip" onClick={() => setForm(formVazio(a.assessor_nome))} title={`${fmtNum(a.contas)} contas · ${fmtNum(a.lotes)} lotes`}>
                  <Plus className="h-3 w-3" />{a.assessor_nome} <span className="text-fg-subtle">({fmtNum(a.contas)} contas)</span>
                </button>
              ))}
            </div>
          </Alert>
        </div>
      )}
      <div className="tbl-wrap rounded-none border-0 mt-3">
        <table className="tbl tbl-dense">
          <thead><tr><th>Assessor</th><th>ID</th><th className="num">Corretagem (R$/lote)</th><th>Tipo zeragem</th><th className="num">Zeragem fixa (R$)</th><th>Responsável</th><th>Ativo</th><th /></tr></thead>
          <tbody>
            {form && !form.id && linhaForm}
            {assessores.map(a => form?.id === a.id ? <FragmentRow key={a.id}>{linhaForm}</FragmentRow> : (
              <tr key={a.id} className={!a.ativo ? 'opacity-50' : ''}>
                <td className="font-medium">{a.nome}</td>
                <td className="muted">{a.id_assessor ?? TRACO}</td>
                <td className="num">{n2(a.corretagem)}</td>
                <td><Badge variant={a.tipo_zeragem === 'FIXA' ? 'info' : 'default'}>{a.tipo_zeragem}</Badge></td>
                <td className={`num ${a.tipo_zeragem !== 'FIXA' ? 'subtle' : ''}`}>{a.tipo_zeragem === 'FIXA' ? n2(a.zeragem_fixa) : TRACO}</td>
                <td>{a.responsavel ?? TRACO}</td>
                <td>{a.ativo ? 'sim' : 'não'}</td>
                <td className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="xs" onClick={() => editar(a)}>Editar</Button>
                  <IconButton tone="danger" aria-label="Excluir" onClick={() => excluir(a)}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function FragmentRow({ children }: { children: ReactNode }) { return <>{children}</> }

// ── Status da conta ────────────────────────────────────────────────────────
function SecaoStatusConta({ corretora, mapa, naoMapeadas }: { corretora: Corretora; mapa: Dados['statusConta']; naoMapeadas: Dados['situacoesNaoMapeadas'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [sit, setSit] = useState('')
  const [st, setSt] = useState<'Migrado' | 'Em processamento' | 'Recusou'>('Migrado')
  return (
    <Panel title="Status da conta" subtitle="SITUACAO_CONTA do export → status do controle. Situação sem mapa conta como Em processamento.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      {naoMapeadas.length > 0 && (
        <Alert tone="warning" className="mb-3" title="Situações sem mapa">
          <div className="mt-1 flex flex-wrap gap-1.5">{naoMapeadas.map(s => <button key={s.situacao} type="button" className="chip" onClick={() => setSit(s.situacao)}>{s.situacao} <span className="text-fg-subtle">({fmtNum(s.contas)})</span></button>)}</div>
        </Alert>
      )}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Situação (export)</th><th>Status</th><th /></tr></thead>
        <tbody>
          {mapa.map(m => (
            <tr key={m.situacao}>
              <td className="font-medium">{m.situacao}</td>
              <td><Badge variant={m.status === 'Migrado' ? 'success' : m.status === 'Recusou' ? 'danger' : 'warning'}>{m.status}</Badge></td>
              <td className="text-right"><IconButton tone="danger" aria-label="Excluir" onClick={() => rodar(() => excluirStatusConta(corretora, m.situacao))}><Trash2 className="h-3.5 w-3.5" /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-full" placeholder="ATIVA, INATIVA, BLOQUEADA…" value={sit} onChange={e => setSit(e.target.value.toUpperCase())} /></td>
            <td>
              <select className="field-sm" value={st} onChange={e => setSt(e.target.value as typeof st)}>
                <option>Migrado</option><option>Em processamento</option><option>Recusou</option>
              </select>
            </td>
            <td className="text-right"><Button size="xs" disabled={!sit || ocupado} onClick={() => rodar(() => salvarStatusConta(corretora, sit, st), () => setSit(''))}><Plus className="h-3 w-3" />Mapear</Button></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}

// ── Multiplicadores ────────────────────────────────────────────────────────
function SecaoMultiplicadores({ corretora, itens }: { corretora: Corretora; itens: Dados['multiplicadores'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [produto, setProduto] = useState('')
  const [pontos, setPontos] = useState('1')
  return (
    <Panel title="Multiplicadores do incentivo" subtitle="Pontos por lote operado, pelas 3 primeiras letras do ativo (WINV26 → WIN). Produto sem multiplicador não pontua.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Produto</th><th className="num">Pontos por lote</th><th /></tr></thead>
        <tbody>
          {itens.map(m => (
            <tr key={m.produto}>
              <td className="font-medium">{m.produto}</td>
              <td className="num">{n2(m.pontos)}</td>
              <td className="text-right"><IconButton tone="danger" aria-label="Excluir" onClick={() => rodar(() => excluirMultiplicador(corretora, m.produto))}><Trash2 className="h-3.5 w-3.5" /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-28" placeholder="WIN" value={produto} onChange={e => setProduto(e.target.value.toUpperCase())} /></td>
            <td className="text-right"><input className="field-sm w-20 text-right" value={pontos} onChange={e => setPontos(e.target.value)} /></td>
            <td className="text-right"><Button size="xs" disabled={!produto || ocupado} onClick={() => rodar(() => salvarMultiplicador(corretora, produto, numeroBR(pontos)), () => setProduto(''))}><Plus className="h-3 w-3" />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}

// ── Faixas ─────────────────────────────────────────────────────────────────
function SecaoFaixas({ corretora, itens }: { corretora: Corretora; itens: Dados['faixas'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [min, setMin] = useState('')
  const [valor, setValor] = useState('')
  return (
    <Panel title="Faixas do incentivo" subtitle="O cliente entra na maior faixa cujo mínimo ultrapassou (pontos > mínimo). Valor pago uma vez por cliente por mês.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Mais de (pontos)</th><th className="num">Incentivo (R$)</th><th /></tr></thead>
        <tbody>
          {itens.map(f => (
            <tr key={f.pontos_min}>
              <td className="num font-medium">{n0(f.pontos_min)}</td>
              <td className="num">{r0(f.valor)}</td>
              <td className="text-right"><IconButton tone="danger" aria-label="Excluir" onClick={() => rodar(() => excluirFaixa(corretora, f.pontos_min))}><Trash2 className="h-3.5 w-3.5" /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-28" placeholder="1000" value={min} onChange={e => setMin(e.target.value)} /></td>
            <td className="text-right"><input className="field-sm w-24 text-right" placeholder="200" value={valor} onChange={e => setValor(e.target.value)} /></td>
            <td className="text-right"><Button size="xs" disabled={!min || !valor || ocupado} onClick={() => rodar(() => salvarFaixa(corretora, numeroBR(min), numeroBR(valor)), () => { setMin(''); setValor('') })}><Plus className="h-3 w-3" />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}

// ── Consolidados ───────────────────────────────────────────────────────────
function SecaoConsolidados({ corretora, itens }: { corretora: Corretora; itens: Dados['consolidados'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [nome, setNome] = useState('')
  return (
    <Panel title="Consolidados" subtitle="Clientes cujas contas somam juntas no incentivo pelo nome (mesmo sem CPF no export). Ex.: FABRICIO DA SILVA GONCALVES.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {itens.length === 0 && <li className="text-xs text-fg-subtle">Nenhum consolidado.</li>}
        {itens.map(c => (
          <li key={c.nome} className="chip">
            {c.nome}
            <button type="button" aria-label="Excluir" className="text-fg-subtle hover:text-danger" onClick={() => rodar(() => excluirConsolidado(corretora, c.nome))}><X className="h-3 w-3" /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="field-sm flex-1" placeholder="Nome do cliente como aparece no relatório" value={nome} onChange={e => setNome(e.target.value)} />
        <Button size="sm" disabled={!nome.trim() || ocupado} onClick={() => rodar(() => salvarConsolidado(corretora, nome), () => setNome(''))}><Plus className="h-3.5 w-3.5" />Adicionar</Button>
      </div>
    </Panel>
  )
}

// ── Status de lead ─────────────────────────────────────────────────────────
function SecaoStatusLead({ itens }: { itens: Dados['statusLead'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [status, setStatus] = useState('')
  const [tipo, setTipo] = useState<'Aberto' | 'Fechado'>('Aberto')
  return (
    <Panel title="Status de lead" subtitle="Aberto conta no funil como em andamento; Fechado sai (Ganho / Perdido). Vale para todas as corretoras.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Status</th><th>Tipo</th><th className="num">Ordem</th><th /></tr></thead>
        <tbody>
          {itens.map(s => (
            <tr key={s.status}>
              <td className="font-medium">{s.status}</td>
              <td><Badge variant={s.tipo === 'Aberto' ? 'info' : 'default'}>{s.tipo}</Badge></td>
              <td className="num">{s.ordem}</td>
              <td className="text-right">{!['Novo', 'Ganho', 'Perdido'].includes(s.status) && <IconButton tone="danger" aria-label="Excluir" onClick={() => rodar(() => excluirStatusLead(s.status))}><Trash2 className="h-3.5 w-3.5" /></IconButton>}</td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-full" placeholder="Ex.: Reunião marcada" value={status} onChange={e => setStatus(e.target.value)} /></td>
            <td><select className="field-sm" value={tipo} onChange={e => setTipo(e.target.value as 'Aberto' | 'Fechado')}><option>Aberto</option><option>Fechado</option></select></td>
            <td />
            <td className="text-right"><Button size="xs" disabled={!status.trim() || ocupado} onClick={() => rodar(() => salvarStatusLead(status, tipo, itens.length + 1), () => setStatus(''))}><Plus className="h-3 w-3" />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}

// ── Responsáveis ───────────────────────────────────────────────────────────
function SecaoResponsaveis({ itens }: { itens: Dados['responsaveis'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [nome, setNome] = useState('')
  return (
    <Panel title="Responsáveis" subtitle="Quem atende clientes (herdado via assessor) e quem trabalha leads. Vale para todas as corretoras.">
      {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Nome</th><th>Clientes</th><th>Leads</th><th>Ativo</th><th /></tr></thead>
        <tbody>
          {itens.map(r => (
            <tr key={r.nome} className={!r.ativo ? 'opacity-50' : ''}>
              <td className="font-medium">{r.nome}</td>
              <td><input type="checkbox" checked={r.atende_clientes} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, atende_clientes: e.target.checked }))} /></td>
              <td><input type="checkbox" checked={r.atende_leads} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, atende_leads: e.target.checked }))} /></td>
              <td><input type="checkbox" checked={r.ativo} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, ativo: e.target.checked }))} /></td>
              <td className="text-right"><IconButton tone="danger" aria-label="Excluir" onClick={() => confirm(`Excluir ${r.nome}?`) && rodar(() => excluirResponsavel(r.nome))}><Trash2 className="h-3.5 w-3.5" /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}><input className="field-sm w-full" placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} /></td>
            <td className="text-right"><Button size="xs" disabled={!nome.trim() || ocupado} onClick={() => rodar(() => salvarResponsavel({ nome, atende_clientes: true, atende_leads: true, ativo: true }), () => setNome(''))}><Plus className="h-3 w-3" />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}
