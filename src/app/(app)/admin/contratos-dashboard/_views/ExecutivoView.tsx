'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Download, ShieldAlert } from 'lucide-react'
import { useShell } from '../_lib/Shell'
import { useDashboardFilters } from '../_lib/useDashboardFilters'
import { useDashboardData } from '../_lib/useDashboardData'
import {
  KpiGrid, ReceitaBlock, MetaBlock, AlertasBlock, Block,
} from '../View'
import { KpiSkeleton, BlockSkeleton } from '../Charts'
import { fmtNum } from '../_lib/utils'
import { ACTIONS } from '../_lib/dashboardActions'

export function ExecutivoView() {
  const { periodo, barra } = useDashboardFilters()
  const d = useDashboardData(ACTIONS, periodo, barra, {
    kpis: true, receita: true, meta: true, alertas: true, budget: true,
  })

  // Reporta loading + datasetMax pro Shell
  const shell = useShell()
  useEffect(() => { shell.setIsLoading(d.isPending) }, [d.isPending, shell])
  useEffect(() => {
    if (d.kpis?.dataset_max) shell.setDatasetMax(d.kpis.dataset_max)
  }, [d.kpis?.dataset_max, shell])

  // Filtra só barras com problema (atencao + excedido)
  const budgetCriticas = d.budget.filter(b => b.status !== 'ok')

  return (
    <div className="space-y-6">
      {d.erro && (
        <div className="rounded-xl px-4 py-3 text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
          {d.erro}
        </div>
      )}

      {/* Botão de export — leva pra rota dedicada com layout de cards */}
      <div className="flex justify-end">
        <Link href={`/admin/contratos-dashboard/export?periodo=${periodo}${barra ? `&barra=${encodeURIComponent(barra)}` : ''}`}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--border)' }}>
          <Download className="w-3.5 h-3.5" />
          Exportar (WhatsApp / Story / Feed)
        </Link>
      </div>

      {d.kpis ? <KpiGrid kpis={d.kpis} /> : <KpiSkeleton />}

      {d.receitaTotal
        ? <ReceitaBlock total={d.receitaTotal} porAssessor={d.receitaPorAss} projecao={d.receitaProj} />
        : <BlockSkeleton height={220} />}

      <MetaBlock meta={d.meta} />

      <Block title="Budget de zeragem"
        subtitle={`Limite máximo de % zeragem por barra (configurável em Tarifas). ${budgetCriticas.length > 0 ? `${budgetCriticas.length} barra(s) acima de 80% do budget.` : 'Todas as barras dentro do limite.'}`}>
        {d.isPending && d.budget.length === 0
          ? <p className="text-sm text-gray-400 py-4">Carregando…</p>
          : d.budget.length === 0
          ? <p className="text-sm text-gray-400 py-4">Sem dados.</p>
          : (
            <div className="space-y-2">
              {d.budget.map((b) => {
                const isExcedido = b.status === 'excedido'
                const isAtencao = b.status === 'atencao'
                const palette = isExcedido
                  ? { bar: '#dc2626', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.4)', tx: '#dc2626' }
                  : isAtencao
                  ? { bar: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.4)', tx: '#d97706' }
                  : { bar: '#10b981', bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.4)', tx: '#059669' }
                const widthPct = Math.min(100, b.consumo_pct)
                return (
                  <div key={b.barra_nome} className="rounded-xl px-4 py-2.5 flex items-center gap-3"
                    style={{ background: palette.bg, border: `1px solid ${palette.border}` }}>
                    {(isExcedido || isAtencao) && <ShieldAlert className="w-4 h-4 shrink-0" style={{ color: palette.tx }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-700 truncate">
                          {b.barra_nome}{b.numero ? ` · ${b.numero}` : ''}
                        </span>
                        <span className="text-xs tabular-nums shrink-0" style={{ color: palette.tx }}>
                          {b.pct_zeragem.toFixed(1)}% / {b.budget_pct.toFixed(0)}% (consumo {b.consumo_pct.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full overflow-hidden"
                        style={{ background: 'rgba(148,163,184,0.2)' }}>
                        <div className="h-full transition-all" style={{ width: `${widthPct}%`, background: palette.bar }} />
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
                        {fmtNum(b.lotes_zerados)} ze. / {fmtNum(b.lotes_operados)} op.
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </Block>

      <AlertasBlock data={d.alertas} onPickCliente={(id) => {
        if (id) window.location.href = `/clientes/${id}`
      }} />
    </div>
  )
}
