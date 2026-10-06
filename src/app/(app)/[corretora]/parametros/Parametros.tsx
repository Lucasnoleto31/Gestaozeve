'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button, IconButton } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
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
import { cn } from '@/lib/utils'

type Dados = Awaited<ReturnType<typeof parametrosDaCorretora>>

// Executa uma ação, avisa o resultado e recarrega a página
function useAcao() {
  const router = useRouter()
  const { avisar } = useToast()
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const rodar = async (fn: () => Promise<Resultado<unknown>>, depois?: () => void, aviso = 'Salvo') => {
    setOcupado(true); setErro(null)
    const r = await fn()
    setOcupado(false)
    if (!r.ok) { setErro(r.erro); return false }
    depois?.()
    avisar({ titulo: aviso, tom: 'gain' })
    router.refresh()
    return true
  }
  return { erro, ocupado, rodar, limpar: () => setErro(null) }
}

export function Parametros({ corretora, label, dados }: { corretora: Corretora; label: string; dados: Dados }) {
  return (
    <div className="space-y-8">
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
    { corr: corretora as string, chave: 'zeragem_padrao', label: 'ZeragemRS — R$ por contrato zerado (assessores com zeragem padrão)', tipo: 'numero' },
    { corr: corretora as string, chave: 'meses_inativo', label: 'MesesInativo — meses sem giro para o cliente virar inativo', tipo: 'numero' },
    { corr: corretora as string, chave: 'modo_zeragem', label: 'ModoZeragem — texto no campo MODO que marca a linha como zeragem', tipo: 'texto' },
    { corr: 'GERAL', chave: 'dias_alerta_lead', label: 'Dias sem contato para alertar um lead em aberto (todas as corretoras)', tipo: 'numero' },
  ]
  const valorDe = (corr: string, chave: string) => (corr === 'GERAL' ? gerais : parametros).find(p => p.chave === chave)?.valor ?? ''
  return (
    <Panel variant="card" title={`Premissas · ${label}`} subtitle="Os mesmos nomes da aba Premissas da planilha.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <div className="space-y-4">
        {campos.map(c => <CampoParametro key={c.chave} label={c.label} valor={valorDe(c.corr, c.chave)} tipo={c.tipo} onSalvar={v => rodar(() => salvarParametro(c.corr, c.chave, v), undefined, 'Parâmetro salvo')} />)}
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
    <Panel variant="card" title="Manutenção" subtitle="Refaz a conta principal de cada cliente, o vínculo dos lotes com o cadastro, os valores derivados e o cruzamento de leads.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <Button variant="secondary" loading={ocupado} onClick={() => rodar(async () => { const r = await recalcularTudo(corretora); if (r.ok) setRes(r.dados); return r }, undefined, 'Recalculado')}>
        <RefreshCw className="h-4 w-4" aria-hidden />Recalcular tudo
      </Button>
      {res && (
        <p className="mt-3 text-label text-fg-muted">
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
  }), () => setForm(null), 'Assessor salvo')
  const editar = (a: AssessorParam) => setForm({ id: a.id, nome: a.nome, id_assessor: a.id_assessor ?? '', corretagem: String(a.corretagem).replace('.', ','), tipo_zeragem: a.tipo_zeragem, zeragem_fixa: String(a.zeragem_fixa).replace('.', ','), responsavel: a.responsavel ?? '', ativo: a.ativo })
  const excluir = (a: AssessorParam) => confirm(`Excluir ${a.nome}? Os lotes dele passam a usar tarifa 0 até ser cadastrado de novo.`) && rodar(() => excluirAssessor(corretora, a.id), undefined, 'Assessor excluído')

  const linhaForm = (
    <tr className="bg-accent-soft">
      <td><input className="field-sm w-full min-w-[200px]" placeholder="Nome como vem no export" value={form?.nome ?? ''} onChange={e => form && setForm({ ...form, nome: e.target.value })} aria-label="Nome" /></td>
      <td className="col-p3"><input className="field-sm w-24" placeholder="ID" value={form?.id_assessor ?? ''} onChange={e => form && setForm({ ...form, id_assessor: e.target.value })} aria-label="ID do assessor" /></td>
      <td><input className="field-sm w-20 text-right" value={form?.corretagem ?? ''} onChange={e => form && setForm({ ...form, corretagem: e.target.value })} aria-label="Corretagem" /></td>
      <td className="col-p2">
        <select className="field-sm" value={form?.tipo_zeragem ?? 'PADRAO'} onChange={e => form && setForm({ ...form, tipo_zeragem: e.target.value as 'PADRAO' | 'FIXA' })} aria-label="Tipo de zeragem">
          <option value="PADRAO">PADRAO</option><option value="FIXA">FIXA</option>
        </select>
      </td>
      <td className="col-p2"><input className="field-sm w-20 text-right" disabled={form?.tipo_zeragem !== 'FIXA'} value={form?.zeragem_fixa ?? ''} onChange={e => form && setForm({ ...form, zeragem_fixa: e.target.value })} aria-label="Zeragem fixa" /></td>
      <td className="col-p2">
        <select className="field-sm" value={form?.responsavel ?? ''} onChange={e => form && setForm({ ...form, responsavel: e.target.value })} aria-label="Responsável">
          <option value="">—</option>{responsaveis.map(r => <option key={r}>{r}</option>)}
        </select>
      </td>
      <td className="col-p3"><input type="checkbox" checked={form?.ativo ?? true} onChange={e => form && setForm({ ...form, ativo: e.target.checked })} aria-label="Ativo" /></td>
      <td className="whitespace-nowrap text-right">
        <IconButton tone="success" aria-label="Salvar" disabled={ocupado} onClick={salvar}><Check className="h-4 w-4" aria-hidden /></IconButton>
        <IconButton aria-label="Cancelar" onClick={() => setForm(null)}><X className="h-4 w-4" aria-hidden /></IconButton>
      </td>
    </tr>
  )

  return (
    <Panel title="Assessores" subtitle="Corretagem em R$ por lote operado. Zeragem padrão usa o ZeragemRS; fixa usa o valor do assessor. O responsável é herdado pelos clientes do assessor."
      action={<Button size="sm" onClick={() => setForm(formVazio())} disabled={!!form}><Plus className="h-4 w-4" aria-hidden />Assessor</Button>}>
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {naoCadastrados.length > 0 && (
        <Alert tone="warn" className="mb-3" title={`${naoCadastrados.length} assessor(es) aparecem nos exports sem cadastro (tarifa 0 e sem responsável)`}>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {naoCadastrados.map(a => (
              <button key={a.assessor_nome} type="button" className="chip" onClick={() => setForm(formVazio(a.assessor_nome))} title={`${fmtNum(a.contas)} contas · ${fmtNum(a.lotes)} lotes`}>
                <Plus className="h-3 w-3" aria-hidden />{a.assessor_nome} <span className="text-fg-subtle">({fmtNum(a.contas)} contas)</span>
              </button>
            ))}
          </div>
        </Alert>
      )}
      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead><tr><th>Assessor</th><th className="col-p3">ID</th><th className="num">R$/lote</th><th className="col-p2">Zeragem</th><th className="num col-p2">Zeragem fixa</th><th className="col-p2">Responsável</th><th className="col-p3">Ativo</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {form && !form.id && linhaForm}
            {assessores.map(a => form?.id === a.id ? <FragmentRow key={a.id}>{linhaForm}</FragmentRow> : (
              <tr key={a.id} className={cn(!a.ativo && 'opacity-50')}>
                <td className="font-medium">{a.nome}</td>
                <td className="muted col-p3">{a.id_assessor ?? TRACO}</td>
                <td className="num">{n2(a.corretagem)}</td>
                <td className="col-p2">{a.tipo_zeragem === 'FIXA' ? <Badge variant="accent">fixa</Badge> : <span className="muted">padrão</span>}</td>
                <td className={cn('num col-p2', a.tipo_zeragem !== 'FIXA' && 'subtle')}>{a.tipo_zeragem === 'FIXA' ? n2(a.zeragem_fixa) : TRACO}</td>
                <td className="col-p2">{a.responsavel ?? TRACO}</td>
                <td className="col-p3">{a.ativo ? 'sim' : 'não'}</td>
                <td className="whitespace-nowrap text-right">
                  <Button variant="ghost" size="xs" onClick={() => editar(a)}>Editar</Button>
                  <IconButton tone="danger" aria-label={`Excluir ${a.nome}`} onClick={() => excluir(a)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</> }

// ── Status da conta ────────────────────────────────────────────────────────
function SecaoStatusConta({ corretora, mapa, naoMapeadas }: { corretora: Corretora; mapa: Dados['statusConta']; naoMapeadas: Dados['situacoesNaoMapeadas'] }) {
  const { erro, ocupado, rodar } = useAcao()
  const [sit, setSit] = useState('')
  const [st, setSt] = useState<'Migrado' | 'Em processamento' | 'Recusou'>('Migrado')
  return (
    <Panel variant="card" title="Status da conta" subtitle="Situação do export → status do controle. Sem mapa conta como Em processamento.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      {naoMapeadas.length > 0 && (
        <Alert tone="warn" className="mb-3" title="Situações sem mapa">
          <div className="mt-2 flex flex-wrap gap-1.5">{naoMapeadas.map(s => <button key={s.situacao} type="button" className="chip" onClick={() => setSit(s.situacao)}>{s.situacao} <span className="text-fg-subtle">({fmtNum(s.contas)})</span></button>)}</div>
        </Alert>
      )}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Situação (export)</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {mapa.map(m => (
            <tr key={m.situacao}>
              <td className="font-medium">{m.situacao}</td>
              <td><Badge variant={m.status === 'Migrado' ? 'gain' : m.status === 'Recusou' ? 'loss' : 'neutral'}>{m.status}</Badge></td>
              <td className="text-right"><IconButton tone="danger" aria-label={`Excluir ${m.situacao}`} onClick={() => rodar(() => excluirStatusConta(corretora, m.situacao), undefined, 'Mapa removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-full" placeholder="ATIVA, INATIVA, BLOQUEADA…" value={sit} onChange={e => setSit(e.target.value.toUpperCase())} aria-label="Situação" /></td>
            <td>
              <select className="field-sm" value={st} onChange={e => setSt(e.target.value as typeof st)} aria-label="Status">
                <option>Migrado</option><option>Em processamento</option><option>Recusou</option>
              </select>
            </td>
            <td className="text-right"><Button size="xs" disabled={!sit || ocupado} onClick={() => rodar(() => salvarStatusConta(corretora, sit, st), () => setSit(''), 'Mapa salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Mapear</Button></td>
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
    <Panel variant="card" title="Multiplicadores do incentivo" subtitle="Pontos por lote operado, pelas 3 primeiras letras do ativo (WINV26 → WIN).">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Produto</th><th className="num">Pontos por lote</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(m => (
            <tr key={m.produto}>
              <td className="font-medium">{m.produto}</td>
              <td className="num">{n2(m.pontos)}</td>
              <td className="text-right"><IconButton tone="danger" aria-label={`Excluir ${m.produto}`} onClick={() => rodar(() => excluirMultiplicador(corretora, m.produto), undefined, 'Multiplicador removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-28" placeholder="WIN" value={produto} onChange={e => setProduto(e.target.value.toUpperCase())} aria-label="Produto" /></td>
            <td className="text-right"><input className="field-sm w-20 text-right" value={pontos} onChange={e => setPontos(e.target.value)} aria-label="Pontos" /></td>
            <td className="text-right"><Button size="xs" disabled={!produto || ocupado} onClick={() => rodar(() => salvarMultiplicador(corretora, produto, numeroBR(pontos)), () => setProduto(''), 'Multiplicador salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
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
    <Panel variant="card" title="Faixas do incentivo" subtitle="O cliente entra na maior faixa cujo mínimo ultrapassou. Pago uma vez por cliente por mês.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Mais de (pontos)</th><th className="num">Incentivo</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(f => (
            <tr key={f.pontos_min}>
              <td className="num font-medium">{n0(f.pontos_min)}</td>
              <td className="num">{r0(f.valor)}</td>
              <td className="text-right"><IconButton tone="danger" aria-label={`Excluir faixa ${f.pontos_min}`} onClick={() => rodar(() => excluirFaixa(corretora, f.pontos_min), undefined, 'Faixa removida')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-28" placeholder="1000" value={min} onChange={e => setMin(e.target.value)} aria-label="Mínimo de pontos" /></td>
            <td className="text-right"><input className="field-sm w-24 text-right" placeholder="200" value={valor} onChange={e => setValor(e.target.value)} aria-label="Valor" /></td>
            <td className="text-right"><Button size="xs" disabled={!min || !valor || ocupado} onClick={() => rodar(() => salvarFaixa(corretora, numeroBR(min), numeroBR(valor)), () => { setMin(''); setValor('') }, 'Faixa salva')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
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
    <Panel variant="card" title="Consolidados" subtitle="Clientes cujas contas somam juntas no incentivo pelo nome, mesmo sem CPF no export.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <ul className="mb-3 flex flex-wrap gap-1.5">
        {itens.length === 0 && <li className="text-label text-fg-subtle">Nenhum consolidado.</li>}
        {itens.map(c => (
          <li key={c.nome} className="chip">
            {c.nome}
            <button type="button" aria-label={`Excluir ${c.nome}`} className="text-fg-subtle hover:text-loss" onClick={() => rodar(() => excluirConsolidado(corretora, c.nome), undefined, 'Consolidado removido')}><X className="h-3 w-3" aria-hidden /></button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="field-sm flex-1" placeholder="Nome do cliente como aparece no relatório" value={nome} onChange={e => setNome(e.target.value)} aria-label="Nome do consolidado" />
        <Button size="sm" disabled={!nome.trim() || ocupado} onClick={() => rodar(() => salvarConsolidado(corretora, nome), () => setNome(''), 'Consolidado salvo')}><Plus className="h-4 w-4" aria-hidden />Adicionar</Button>
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
    <Panel variant="card" title="Status de lead" subtitle="Aberto conta como em andamento; Fechado sai do funil (Ganho / Perdido). Vale para todas.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Status</th><th>Tipo</th><th className="num">Ordem</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(s => (
            <tr key={s.status}>
              <td className="font-medium">{s.status}</td>
              <td className="muted">{s.tipo}</td>
              <td className="num">{s.ordem}</td>
              <td className="text-right">{!['Novo', 'Ganho', 'Perdido'].includes(s.status) && <IconButton tone="danger" aria-label={`Excluir ${s.status}`} onClick={() => rodar(() => excluirStatusLead(s.status), undefined, 'Status removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>}</td>
            </tr>
          ))}
          <tr>
            <td><input className="field-sm w-full" placeholder="Ex.: Reunião marcada" value={status} onChange={e => setStatus(e.target.value)} aria-label="Status" /></td>
            <td><select className="field-sm" value={tipo} onChange={e => setTipo(e.target.value as 'Aberto' | 'Fechado')} aria-label="Tipo"><option>Aberto</option><option>Fechado</option></select></td>
            <td />
            <td className="text-right"><Button size="xs" disabled={!status.trim() || ocupado} onClick={() => rodar(() => salvarStatusLead(status, tipo, itens.length + 1), () => setStatus(''), 'Status salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
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
    <Panel variant="card" title="Responsáveis" subtitle="Quem atende clientes (herdado via assessor) e quem trabalha leads. Vale para todas.">
      {erro && <Alert tone="loss" className="mb-3">{erro}</Alert>}
      <table className="tbl tbl-dense w-full">
        <thead><tr><th>Nome</th><th>Clientes</th><th>Leads</th><th>Ativo</th><th><span className="sr-only">Ações</span></th></tr></thead>
        <tbody>
          {itens.map(r => (
            <tr key={r.nome} className={cn(!r.ativo && 'opacity-50')}>
              <td className="font-medium">{r.nome}</td>
              <td><input type="checkbox" checked={r.atende_clientes} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, atende_clientes: e.target.checked }))} aria-label={`${r.nome} atende clientes`} /></td>
              <td><input type="checkbox" checked={r.atende_leads} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, atende_leads: e.target.checked }))} aria-label={`${r.nome} atende leads`} /></td>
              <td><input type="checkbox" checked={r.ativo} disabled={ocupado} onChange={e => rodar(() => salvarResponsavel({ ...r, ativo: e.target.checked }))} aria-label={`${r.nome} ativo`} /></td>
              <td className="text-right"><IconButton tone="danger" aria-label={`Excluir ${r.nome}`} onClick={() => confirm(`Excluir ${r.nome}?`) && rodar(() => excluirResponsavel(r.nome), undefined, 'Responsável removido')}><Trash2 className="h-4 w-4" aria-hidden /></IconButton></td>
            </tr>
          ))}
          <tr>
            <td colSpan={4}><input className="field-sm w-full" placeholder="Nome" value={nome} onChange={e => setNome(e.target.value)} aria-label="Nome do responsável" /></td>
            <td className="text-right"><Button size="xs" disabled={!nome.trim() || ocupado} onClick={() => rodar(() => salvarResponsavel({ nome, atende_clientes: true, atende_leads: true, ativo: true }), () => setNome(''), 'Responsável salvo')}><Plus className="h-3.5 w-3.5" aria-hidden />Adicionar</Button></td>
          </tr>
        </tbody>
      </table>
    </Panel>
  )
}
