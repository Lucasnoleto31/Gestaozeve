export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/getProfile'
import { Header } from '@/components/layout/Header'
import { HeroBanner, BannerKpi } from '@/components/layout/HeroBanner'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { EvolucaoMensalChart } from '@/app/(app)/admin/contratos-dashboard/Charts'
import { getResumoContratos, type ResumoContratos } from '@/app/(app)/admin/contratos-dashboard/actions'
import { fmtNum, fmtBRL, fmtBRL2, fmtDataPt } from '@/app/(app)/admin/contratos-dashboard/_lib/utils'
import { formatDateTime } from '@/lib/utils'
import { ArrowRight, BarChart2, Upload, Target, FileStack, Layers, Monitor, Users } from 'lucide-react'

// ── helpers ────────────────────────────────────────────────────────────────

function getSaudacao() {
  const h = (new Date().getUTCHours() - 3 + 24) % 24
  if (h >= 18) return 'Boa noite'
  if (h >= 12) return 'Boa tarde'
  return 'Bom dia'
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function labelMes(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10)
  return `${MESES[m - 1] ?? iso.slice(5, 7)} de ${iso.slice(0, 4)}`
}

const heroButton = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all'
const heroButtonStyle = { background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)' }

const th = (align: 'left' | 'right') =>
  `px-3 py-2 font-semibold text-gray-500 ${align === 'left' ? 'text-left' : 'text-right'}`
const rowStyle = (i: number) => ({
  borderTop: '1px solid var(--border)',
  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
})

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-400 py-6 text-center">{children}</p>
}

// ── page ───────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const profile = await getProfile()
  if (!profile) redirect('/login')

  const firstName = profile.nome.split(' ')[0]
  const saudacao = getSaudacao()

  // Os painéis de contratos são só do admin (as RPCs do dashboard exigem esse perfil).
  if (profile.role !== 'admin') {
    return (
      <div>
        <Header title="Dashboard" />
        <HeroBanner>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">Bem-vindo</p>
          <h1 className="text-3xl font-bold text-white tracking-tight">{saudacao}, {firstName}</h1>
          <p className="text-blue-200/60 mt-1 text-sm">
            Os painéis de contratos são exclusivos do administrador. Fale com ele se precisar de acesso.
          </p>
        </HeroBanner>
      </div>
    )
  }

  const r = await getResumoContratos()
  const k = r.kpis
  const pctZeragem = k && k.volume_operados > 0 ? (k.volume_zerados / k.volume_operados) * 100 : null

  return (
    <div>
      <Header title="Dashboard" />

      {/* ── Hero: resumo do mês ── */}
      <HeroBanner>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300 mb-2">
              Resumo de contratos · {labelMes(r.mes.inicio)}
            </p>
            <h1 className="text-3xl font-bold text-white tracking-tight">{saudacao}, {firstName}</h1>
            <p className="text-blue-200/60 mt-1 text-sm">
              Lotes girados de {fmtDataPt(r.mes.inicio)} a {fmtDataPt(r.mes.fim)}
              {k?.dataset_max ? ` · dados até ${fmtDataPt(k.dataset_max)}` : ''}
              {k?.ultimo_dia_data ? ` · último pregão (${fmtDataPt(k.ultimo_dia_data)}): ${fmtNum(k.ultimo_dia_lotes)} lotes` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/contratos-dashboard" className={heroButton} style={heroButtonStyle}>
              <BarChart2 className="w-3.5 h-3.5" /> Dashboard completo
            </Link>
            <Link href="/admin/contratos" className={heroButton} style={heroButtonStyle}>
              <Upload className="w-3.5 h-3.5" /> Importar contratos
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <BannerKpi label="Lotes operados no mês"
            value={k ? fmtNum(k.volume_operados) : '—'}
            sub={k ? `${k.num_dias_com_dado} pregões · ${fmtNum(k.media_diaria)} lotes/pregão` : 'sem dados no mês'} />
          <BannerKpi label="Lotes zerados no mês"
            value={k ? fmtNum(k.volume_zerados) : '—'}
            sub={pctZeragem != null ? `${pctZeragem.toFixed(1)}% do operado` : undefined} />
          <BannerKpi label="Clientes ativos"
            value={k ? fmtNum(k.num_clientes_ativos) : '—'}
            sub="contas que operaram no mês" />
          <BannerKpi label="Receita estimada no mês"
            value={r.receitaBL ? fmtBRL2(r.receitaBL.receita_liquida) : '—'}
            sub={r.receitaProj
              ? `projeção do mês ${fmtBRL(r.receitaProj.projecao_total)} · só WIN/WDO`
              : 'líquida · só WIN/WDO'} />
        </div>
      </HeroBanner>

      {/* ── Conteúdo ── */}
      <div className="p-6 space-y-6">
        {r.erros.length > 0 && (
          <div className="rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
            Parte dos dados não carregou: {r.erros[0]}
          </div>
        )}

        {/* Linha 1: evolução mensal + meta + importações */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Evolução mensal</CardTitle>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Lotes operados (azul) e zerados (vermelho) + clientes ativos (linha roxa). Últimos 12 meses · * = mês em andamento.
                  </p>
                </div>
              </CardHeader>
              <EvolucaoMensalChart data={r.evolucao} />
            </Card>
          </div>

          <div className="space-y-6">
            <MetaCard meta={r.meta} />
            <ImportacoesCard importacoes={r.importacoes} />
          </div>
        </div>

        {/* Linha 2: top clientes + produtos + plataformas (mês atual) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <Users className="w-4 h-4 text-blue-600" />
              <div>
                <CardTitle>Top 10 clientes do mês</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Por lotes operados · % acumulado do total</p>
              </div>
            </div>
            {r.topClientes.length === 0 ? <Vazio>Sem operações no mês.</Vazio> : (
              <table className="text-xs border-collapse w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr>
                    <th className={th('left')}>#</th>
                    <th className={th('left')}>Cliente</th>
                    <th className={th('right')}>Lotes</th>
                    <th className={th('right')}>% acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {r.topClientes.map((c, i) => (
                    <tr key={`${c.cliente_nome}-${c.rank}`} style={rowStyle(i)}>
                      <td className="px-3 py-1.5 font-bold text-gray-700 tabular-nums">{c.rank}</td>
                      <td className="px-3 py-1.5">
                        <p className="font-medium text-gray-700 truncate max-w-[180px]">{c.cliente_nome}</p>
                        {c.assessor_nome && <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{c.assessor_nome}</p>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(c.lotes_operados)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{c.pct_acumulado.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <Layers className="w-4 h-4 text-purple-600" />
              <div>
                <CardTitle>Lotes por produto no mês</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Operados, participação e % de zeragem</p>
              </div>
            </div>
            <ProdutosTable produtos={r.produtos} />
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <Monitor className="w-4 h-4 text-cyan-600" />
              <div>
                <CardTitle>Lotes por plataforma no mês</CardTitle>
                <p className="text-xs text-gray-500 mt-0.5">Plataforma de negociação informada na importação</p>
              </div>
            </div>
            <PlataformasTable plataformas={r.plataformas} />
          </Card>
        </div>
      </div>
    </div>
  )
}

// ── cards ──────────────────────────────────────────────────────────────────

function MetaCard({ meta }: { meta: ResumoContratos['meta'] }) {
  const temMeta = meta && (meta.meta_receita > 0 || meta.meta_lotes > 0)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-500" />
          <CardTitle>{meta ? `Meta ${meta.ano}` : 'Meta anual'}</CardTitle>
        </div>
        <Link href="/admin/metas" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
          {temMeta ? 'Ajustar' : 'Cadastrar'} <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      {!temMeta || !meta ? (
        <p className="text-sm text-gray-400">Nenhuma meta cadastrada para o ano.</p>
      ) : (
        <div className="space-y-3">
          {meta.meta_lotes > 0 && (
            <MetaProgresso label="Lotes operados" pct={meta.pct_lotes}
              realizado={fmtNum(meta.realizado_lotes)} alvo={fmtNum(meta.meta_lotes) + ' lotes'} />
          )}
          {meta.meta_receita > 0 && (
            <MetaProgresso label="Receita" pct={meta.pct_receita}
              realizado={fmtBRL(meta.realizado_receita)} alvo={fmtBRL(meta.meta_receita)} />
          )}
          <p className="text-xs text-gray-500">
            {meta.dias_corridos_restantes} dias úteis restantes
            {meta.meta_receita > 0 ? ` · ritmo necessário ${fmtBRL(meta.ritmo_receita_necessario)}/pregão` : ''}
          </p>
        </div>
      )}
    </Card>
  )
}

function MetaProgresso({ label, pct, realizado, alvo }: {
  label: string; pct: number; realizado: string; alvo: string
}) {
  const color = pct >= 100 ? '#10b981' : pct >= 75 ? '#1764f4' : pct >= 50 ? '#f59e0b' : '#dc2626'
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(148,163,184,0.2)' }}>
        <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
      </div>
      <p className="text-xs text-gray-500 mt-1 tabular-nums">{realizado} de {alvo}</p>
    </div>
  )
}

function ImportacoesCard({ importacoes }: { importacoes: ResumoContratos['importacoes'] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <FileStack className="w-4 h-4 text-blue-600" />
          <CardTitle>Últimas importações</CardTitle>
        </div>
        <Link href="/admin/contratos" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
          Ver todas <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {importacoes.length === 0 ? <Vazio>Nenhuma importação ainda.</Vazio> : (
        <div>
          {importacoes.map(imp => (
            <div key={imp.id} className="flex items-center justify-between gap-3 px-5 py-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{imp.nome_arquivo || 'Sem nome'}</p>
                <p className="text-xs text-gray-500">{imp.created_at ? formatDateTime(imp.created_at) : '—'} · {fmtNum(imp.total_linhas)} linhas</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtNum(imp.total_lotes_operados)}</p>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">lotes op.</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ProdutosTable({ produtos }: { produtos: ResumoContratos['produtos'] }) {
  if (produtos.length === 0) return <Vazio>Sem operações no mês.</Vazio>
  const total = produtos.reduce((s, p) => s + p.lotes_operados, 0)
  return (
    <table className="text-xs border-collapse w-full">
      <thead style={{ background: 'var(--surface-2)' }}>
        <tr>
          <th className={th('left')}>Produto</th>
          <th className={th('right')}>Lotes</th>
          <th className={th('right')}>% total</th>
          <th className={th('right')}>% zer.</th>
          <th className={th('right')}>Clientes</th>
        </tr>
      </thead>
      <tbody>
        {produtos.map((p, i) => {
          const pctTotal = total > 0 ? (p.lotes_operados / total) * 100 : 0
          const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
          return (
            <tr key={p.produto} style={rowStyle(i)}>
              <td className="px-3 py-1.5 font-semibold text-gray-700">{p.produto}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(p.lotes_operados)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pctTotal.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.num_clientes)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PlataformasTable({ plataformas }: { plataformas: ResumoContratos['plataformas'] }) {
  if (plataformas === null) {
    return (
      <div className="px-5 py-6 text-sm text-gray-500">
        Indisponível: rode o arquivo <code className="text-xs px-1 py-0.5 rounded bg-gray-100">supabase-s12-plataforma-excluir-cliente.sql</code> no
        SQL Editor do Supabase para habilitar os lotes por plataforma.
      </div>
    )
  }
  if (plataformas.length === 0) return <Vazio>Sem operações no mês.</Vazio>
  const total = plataformas.reduce((s, p) => s + p.lotes_operados, 0)
  return (
    <table className="text-xs border-collapse w-full">
      <thead style={{ background: 'var(--surface-2)' }}>
        <tr>
          <th className={th('left')}>Plataforma</th>
          <th className={th('right')}>Lotes</th>
          <th className={th('right')}>% total</th>
          <th className={th('right')}>% zer.</th>
          <th className={th('right')}>Clientes</th>
        </tr>
      </thead>
      <tbody>
        {plataformas.map((p, i) => {
          const pctTotal = total > 0 ? (p.lotes_operados / total) * 100 : 0
          const pctZe = p.lotes_operados > 0 ? (p.lotes_zerados / p.lotes_operados) * 100 : 0
          return (
            <tr key={p.plataforma} style={rowStyle(i)}>
              <td className="px-3 py-1.5 font-semibold text-gray-700">{p.plataforma}</td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{fmtNum(p.lotes_operados)}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{pctTotal.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{pctZe.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(p.num_clientes)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
