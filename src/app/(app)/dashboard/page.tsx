export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  Activity, ArrowRight, Award, BarChart2, Building2, DollarSign, FileStack, Layers, Monitor,
  Target, TrendingDown, Upload, Users,
} from 'lucide-react'
import { getProfile } from '@/lib/auth/getProfile'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { Panel } from '@/components/ui/Panel'
import { KpiCard, KpiRow, DeltaText } from '@/components/ui/Kpi'
import { Alert } from '@/components/ui/Alert'
import { CorretoraBadge } from '@/components/ui/CorretoraBadge'
import { MetaProgress, ProgressBar } from '@/components/ui/Progress'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { EvolucaoMensalChart } from '@/app/(app)/admin/contratos-dashboard/Charts'
import { getAvisos, getResumoContratos, type Aviso, type ResumoContratos } from '@/app/(app)/admin/contratos-dashboard/actions'
import { AssessorHome } from './AssessorHome'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { fmtNum, fmtBRL, fmtBRL2, fmtDataPt, fmtDataHoraPt, labelMesLongo } from '@/lib/format'
import { CORRETORA_COLOR, isCorretora } from '@/lib/corretoras'
import { cn } from '@/lib/utils'

function getSaudacao() {
  const h = (new Date().getUTCHours() - 3 + 24) % 24
  if (h >= 18) return 'Boa noite'
  if (h >= 12) return 'Boa tarde'
  return 'Bom dia'
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-fg-subtle">{children}</p>
}

function LinkAcao({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="link inline-flex items-center gap-1 text-xs">
      {children} <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

// ── page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const firstName = profile.nome.split(' ')[0]
  const saudacao = getSaudacao()

  // Assessor: só as barras ligadas ao usuário. Outros perfis: aviso.
  if (profile.role === 'vendedor') {
    return <AssessorHome saudacao={saudacao} nome={firstName} />
  }
  if (profile.role !== 'admin') {
    return (
      <>
        <PageHeader eyebrow="Visão geral" title={`${saudacao}, ${firstName}`} description="Bem-vindo ao ZeveAI." />
        <PageBody>
          <Alert tone="info">Os painéis de lotes são exclusivos do administrador e dos assessores. Fale com o administrador se precisar de acesso.</Alert>
        </PageBody>
      </>
    )
  }

  const [r, avisos] = await Promise.all([
    getResumoContratos(),
    getAvisos().catch(() => [] as Aviso[]),
  ])
  const k = r.kpis
  const pctZeragem = k && k.volume_operados > 0 ? (k.volume_zerados / k.volume_operados) * 100 : null

  return (
    <>
      <PageHeader
        eyebrow={`Visão geral · ${labelMesLongo(r.mes.inicio)}`}
        title={`${saudacao}, ${firstName}`}
        description={
          <>
            Lotes girados de {fmtDataPt(r.mes.inicio)} a {fmtDataPt(r.mes.fim)} nas três corretoras
            {k?.dataset_max ? ` · dados até ${fmtDataPt(k.dataset_max)}` : ''}
            {k?.ultimo_dia_data ? ` · último pregão (${fmtDataPt(k.ultimo_dia_data)}): ${fmtNum(k.ultimo_dia_lotes)} lotes` : ''}.
          </>
        }
        actions={
          <>
            <Link href="/admin/contratos" className={buttonClasses('secondary')}>
              <Upload className="h-4 w-4" /> Importar planilha
            </Link>
            <Link href="/admin/contratos-dashboard" className={buttonClasses('primary')}>
              <BarChart2 className="h-4 w-4" /> Painel de lotes
            </Link>
          </>
        }
      />

      <PageBody>
        {r.erros.length > 0 && (
          <Alert tone="warning">Parte dos dados não carregou: {r.erros[0]}</Alert>
        )}

        {avisos.length > 0 && <AvisosPanel avisos={avisos} />}

        <KpiRow cols={4}>
          <KpiCard icon={Activity} tone="accent" label="Lotes operados no mês"
            value={k ? fmtNum(k.volume_operados) : '—'}
            sub={k ? `${k.num_dias_com_dado} pregões · ${fmtNum(k.media_diaria)} lotes/pregão` : 'sem dados no mês'} />
          <KpiCard icon={TrendingDown} tone="danger" label="Lotes zerados no mês"
            value={k ? fmtNum(k.volume_zerados) : '—'}
            sub={pctZeragem != null ? `${pctZeragem.toFixed(1)}% do operado` : undefined} />
          <KpiCard icon={Users} tone="violet" label="Clientes ativos"
            value={k ? fmtNum(k.num_clientes_ativos) : '—'} sub="contas que operaram no mês" />
          <KpiCard icon={DollarSign} tone="success" label="Receita estimada no mês"
            value={r.receitaBL ? fmtBRL2(r.receitaBL.receita_liquida) : '—'}
            sub={r.receitaProj
              ? `projeção do mês ${fmtBRL(r.receitaProj.projecao_total)} · só WIN/WDO`
              : 'líquida · só WIN/WDO'} />
        </KpiRow>

        {/* Por corretora — Genial, XP e BTG lado a lado */}
        <Panel icon={Building2} title="Por corretora no mês"
          subtitle="Lotes, participação, clientes e receita líquida estimada pela tarifa de cada corretora."
          action={<LinkAcao href="/admin/contratos-dashboard">Comparar</LinkAcao>}>
          <CorretorasResumo corretoras={r.corretoras} />
        </Panel>

        {/* Linha 1: evolução mensal + top barras + meta */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Evolução mensal"
              subtitle="Lotes operados e zerados por mês + clientes ativos (linha). Últimos 12 meses · * = mês em andamento.">
              <EvolucaoMensalChart data={r.evolucao} />
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel flush icon={Award} title="Top 5 barras do mês" subtitle="Lotes operados vs mês anterior"
              action={<LinkAcao href="/admin/contratos-dashboard/barras">Ranking</LinkAcao>}>
              <TopBarrasLista barras={r.topBarras} />
            </Panel>
            <MetaCard meta={r.meta} />
          </div>
        </div>

        {/* Linha 2: top clientes + produtos + plataformas (mês atual) */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Panel flush icon={Users} title="Top 10 clientes do mês" subtitle="Por lotes operados · % acumulado">
            {r.topClientes.length === 0 ? <Vazio>Sem operações no mês.</Vazio> : (
              <div className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="w-10">#</th>
                      <th>Cliente</th>
                      <th className="num">Lotes</th>
                      <th className="num">% acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.topClientes.map(c => (
                      <tr key={`${c.cliente_nome}-${c.rank}`}>
                        <td className="subtle font-semibold tabular-nums">{c.rank}</td>
                        <td>
                          <p className="max-w-[180px] truncate font-medium">{c.cliente_nome}</p>
                          {c.assessor_nome && <p className="max-w-[180px] truncate text-[10.5px] text-fg-subtle">{c.assessor_nome}</p>}
                        </td>
                        <td className="num font-medium">{fmtNum(c.lotes_operados)}</td>
                        <td className="num muted">{c.pct_acumulado.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel flush icon={Layers} title="Lotes por produto no mês" subtitle="Operados, participação e % de zeragem">
            <ProdutosTable produtos={r.produtos} />
          </Panel>

          <Panel flush icon={Monitor} title="Lotes por plataforma no mês" subtitle="Plataforma informada na importação">
            <PlataformasTable plataformas={r.plataformas} />
          </Panel>
        </div>

        <ImportacoesCard importacoes={r.importacoes} />
      </PageBody>
    </>
  )
}

// ── blocos ─────────────────────────────────────────────────────────────────

const AVISO_ICON = { danger: AlertCircle, warning: AlertTriangle, info: Info } as const
const AVISO_CLASS = { danger: 'bg-danger-soft text-danger', warning: 'bg-warning-soft text-warning', info: 'bg-accent-soft text-accent' } as const

function AvisosPanel({ avisos }: { avisos: Aviso[] }) {
  return (
    <Panel flush title="Avisos"
      subtitle="Calculados agora a partir dos lotes: dias sem planilha, barras em queda, clientes grandes que pararam e barras sem tarifa.">
      <ul className="divide-y divide-line">
        {avisos.map((a, i) => {
          const Icon = AVISO_ICON[a.tone]
          return (
            <li key={i} className="flex items-start gap-3 px-5 py-3">
              <span className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md', AVISO_CLASS[a.tone])}>
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{a.titulo}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{a.detalhe}</p>
              </div>
              {a.href && <LinkAcao href={a.href}>Ver</LinkAcao>}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

function CorretorasResumo({ corretoras }: { corretoras: ResumoContratos['corretoras'] }) {
  if (corretoras === null) {
    return (
      <p className="text-sm text-fg-muted">
        Indisponível: rode o arquivo <code className="rounded bg-surface-3 px-1 py-0.5 text-xs">supabase-s13-corretoras.sql</code> no
        SQL Editor do Supabase para separar os lotes por corretora.
      </p>
    )
  }
  const totalOp = corretoras.reduce((s, c) => s + c.lotes_operados, 0)
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {corretoras.map(c => {
        const color = isCorretora(c.corretora) ? CORRETORA_COLOR[c.corretora] : 'var(--fg-subtle)'
        const share = totalOp > 0 ? (c.lotes_operados / totalOp) * 100 : 0
        const pctZe = c.lotes_operados > 0 ? (c.lotes_zerados / c.lotes_operados) * 100 : 0
        return (
          <div key={c.corretora} className="rounded-[10px] border border-line bg-surface-2 p-4" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-center justify-between">
              <CorretoraBadge corretora={c.corretora} size="md" />
              <span className="text-xs tabular-nums text-fg-muted">{share.toFixed(1)}% do mês</span>
            </div>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{fmtNum(c.lotes_operados)}</p>
            <p className="text-xs text-fg-muted">lotes operados</p>
            <ProgressBar pct={share} color={color} className="mt-2" />
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-fg-muted">Zerados</dt>
              <dd className="text-right tabular-nums text-fg">{fmtNum(c.lotes_zerados)} <span className="text-fg-subtle">({pctZe.toFixed(1)}%)</span></dd>
              <dt className="text-fg-muted">Clientes</dt>
              <dd className="text-right tabular-nums text-fg">{fmtNum(c.num_clientes)}</dd>
              <dt className="text-fg-muted">Pregões</dt>
              <dd className="text-right tabular-nums text-fg">{fmtNum(c.num_dias)}</dd>
              <dt className="text-fg-muted">Receita líquida</dt>
              <dd className="text-right font-semibold tabular-nums text-success">{fmtBRL2(c.receita_liquida)}</dd>
            </dl>
          </div>
        )
      })}
    </div>
  )
}

function TopBarrasLista({ barras }: { barras: ResumoContratos['topBarras'] }) {
  if (barras.length === 0) return <Vazio>Sem operações no mês.</Vazio>
  const max = Math.max(...barras.map(b => b.lotes_operados), 1)
  return (
    <ul>
      {barras.map((b, i) => (
        <li key={`${b.corretora}|${b.barra_nome}`} className="border-b border-line px-5 py-2.5 last:border-b-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="w-4 text-xs font-semibold tabular-nums text-fg-subtle">{i + 1}</span>
              <span className={cn('truncate text-sm font-medium', b.barra_nome === 'Sem barra' ? 'italic text-fg-subtle' : 'text-fg')}>{b.barra_nome}</span>
              <CorretoraBadge corretora={b.corretora} />
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span className="font-semibold tabular-nums text-fg">{fmtNum(b.lotes_operados)}</span>
              <span className="text-[11px]"><DeltaText pct={b.delta_lotes_pct} /></span>
            </div>
          </div>
          <ProgressBar pct={(b.lotes_operados / max) * 100} className="ml-6 mt-1.5 h-1" />
        </li>
      ))}
    </ul>
  )
}

function MetaCard({ meta }: { meta: ResumoContratos['meta'] }) {
  const temMeta = meta && (meta.meta_receita > 0 || meta.meta_lotes > 0)
  return (
    <Panel icon={Target} title={meta ? `Meta ${meta.ano} · escritório` : 'Meta anual'}
      action={<LinkAcao href="/admin/metas">{temMeta ? 'Ajustar' : 'Cadastrar'}</LinkAcao>}>
      {!temMeta || !meta ? (
        <p className="text-sm text-fg-subtle">Nenhuma meta cadastrada para o ano. As metas por corretora aparecem no painel de lotes.</p>
      ) : (
        <div className="space-y-4">
          {meta.meta_lotes > 0 && (
            <MetaProgress label="Lotes operados" pct={meta.pct_lotes}
              realizado={fmtNum(meta.realizado_lotes)} alvo={fmtNum(meta.meta_lotes) + ' lotes'} />
          )}
          {meta.meta_receita > 0 && (
            <MetaProgress label="Receita" pct={meta.pct_receita}
              realizado={fmtBRL(meta.realizado_receita)} alvo={fmtBRL(meta.meta_receita)} />
          )}
          <p className="text-xs text-fg-muted">
            {meta.dias_corridos_restantes} dias úteis restantes
            {meta.meta_receita > 0 ? ` · ritmo necessário ${fmtBRL(meta.ritmo_receita_necessario)}/pregão` : ''}
          </p>
        </div>
      )}
    </Panel>
  )
}

function ImportacoesCard({ importacoes }: { importacoes: ResumoContratos['importacoes'] }) {
  return (
    <Panel flush icon={FileStack} title="Últimas importações" action={<LinkAcao href="/admin/contratos">Ver todas</LinkAcao>}>
      {importacoes.length === 0 ? <Vazio>Nenhuma importação ainda.</Vazio> : (
        <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-5 md:divide-x md:divide-y-0">
          {importacoes.map(imp => (
            <div key={imp.id} className="min-w-0 px-5 py-3">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-fg">{imp.nome_arquivo || 'Sem nome'}</p>
                {imp.corretora && <CorretoraBadge corretora={imp.corretora} />}
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">{fmtDataHoraPt(imp.created_at)}</p>
              <p className="mt-0.5 text-xs tabular-nums text-fg">
                <span className="font-semibold">{fmtNum(imp.total_lotes_operados)}</span> lotes op. · {fmtNum(imp.total_linhas)} linhas
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function ProdutosTable({ produtos }: { produtos: ResumoContratos['produtos'] }) {
  if (produtos.length === 0) return <Vazio>Sem operações no mês.</Vazio>
  const total = produtos.reduce((s, p) => s + p.lotes_operados, 0)
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Produto</th>
            <th className="num">Lotes</th>
            <th className="num">% total</th>
            <th className="num">% zer.</th>
            <th className="num">Clientes</th>
          </tr>
        </thead>
        <tbody>
          {produtos.map(p => {
            const pctTotal = total > 0 ? (p.lotes_operados / total) * 100 : 0
            const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
            return (
              <tr key={p.produto}>
                <td className="font-semibold">{p.produto}</td>
                <td className="num font-medium">{fmtNum(p.lotes_operados)}</td>
                <td className="num muted">{pctTotal.toFixed(1)}%</td>
                <td className="num">{pctZe.toFixed(1)}%</td>
                <td className="num">{fmtNum(p.num_clientes)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PlataformasTable({ plataformas }: { plataformas: ResumoContratos['plataformas'] }) {
  if (plataformas === null) {
    return (
      <div className="px-5 py-6 text-sm text-fg-muted">
        Indisponível: rode o arquivo <code className="rounded bg-surface-3 px-1 py-0.5 text-xs">supabase-s12-plataforma-excluir-cliente.sql</code> no
        SQL Editor do Supabase para habilitar os lotes por plataforma.
      </div>
    )
  }
  if (plataformas.length === 0) return <Vazio>Sem operações no mês.</Vazio>
  const total = plataformas.reduce((s, p) => s + p.lotes_operados, 0)
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr>
            <th>Plataforma</th>
            <th className="num">Lotes</th>
            <th className="num">% total</th>
            <th className="num">% zer.</th>
            <th className="num">Clientes</th>
          </tr>
        </thead>
        <tbody>
          {plataformas.map(p => {
            const pctTotal = total > 0 ? (p.lotes_operados / total) * 100 : 0
            const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
            return (
              <tr key={p.plataforma}>
                <td className="font-semibold">{p.plataforma}</td>
                <td className="num font-medium">{fmtNum(p.lotes_operados)}</td>
                <td className="num muted">{pctTotal.toFixed(1)}%</td>
                <td className="num">{pctZe.toFixed(1)}%</td>
                <td className="num">{fmtNum(p.num_clientes)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
