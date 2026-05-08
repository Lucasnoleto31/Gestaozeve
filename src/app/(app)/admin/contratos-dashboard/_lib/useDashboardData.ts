'use client'

import { useEffect, useState, useTransition } from 'react'
import type { Periodo } from '../actions'
import type { DashboardActions } from './types'

// Hook que carrega tudo (ou subset, controlado por flags) quando periodo/barra mudam.
// Cada sub-rota só pede o subset que precisa via flags.

export type DataFlags = {
  kpis?: boolean
  produtos?: boolean
  topClientes?: boolean
  diario?: boolean
  heatmap?: boolean
  evolucao?: boolean
  receita?: boolean      // total + por_assessor + projecao
  meta?: boolean
  alertas?: boolean
  acuracidade?: boolean  // resumo + serie
  barras?: boolean
}

export function useDashboardData(actions: DashboardActions, periodo: Periodo, barra: string | null, flags: DataFlags) {
  const [data, setData] = useState<{
    kpis: Awaited<ReturnType<DashboardActions['getKpis']>> | null
    produtos: Awaited<ReturnType<DashboardActions['getPorProduto']>>
    topClientes: Awaited<ReturnType<DashboardActions['getTopClientes']>>
    diario: Awaited<ReturnType<DashboardActions['getDiarioProduto']>>
    heatmap: Awaited<ReturnType<DashboardActions['getHeatmapDow']>>
    evolucao: Awaited<ReturnType<DashboardActions['getEvolucaoMensal']>>
    receitaTotal: Awaited<ReturnType<DashboardActions['getReceitaTotal']>> | null
    receitaPorAss: Awaited<ReturnType<DashboardActions['getReceitaPorAssessor']>>
    receitaProj: Awaited<ReturnType<DashboardActions['getReceitaProjecao']>> | null
    meta: Awaited<ReturnType<DashboardActions['getMetaAnual']>> | null
    alertas: Awaited<ReturnType<DashboardActions['getAlertas']>>
    acuracidade: Awaited<ReturnType<DashboardActions['getAcuracidadeResumo']>> | null
    acuracidadeSerie: Awaited<ReturnType<DashboardActions['getAcuracidadeSerie']>>
    barras: Awaited<ReturnType<DashboardActions['getBarrasAtivas']>>
  }>({
    kpis: null, produtos: [], topClientes: [], diario: [], heatmap: [], evolucao: [],
    receitaTotal: null, receitaPorAss: [], receitaProj: null, meta: null,
    alertas: [], acuracidade: null, acuracidadeSerie: [], barras: [],
  })

  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // Carrega lista de barras 1x na montagem (flag separada — mudar periodo não recarrega)
  useEffect(() => {
    if (!flags.barras) return
    actions.getBarrasAtivas()
      .then(b => setData(d => ({ ...d, barras: b })))
      .catch(() => {})
  }, [actions, flags.barras])

  // Flags são objeto literal recriado a cada render, mas a intenção é
  // recarregar SOMENTE quando periodo/barra mudam (flags são quase
  // imutáveis por sub-rota). Aceitamos a violação consciente — o disable
  // fica na linha do array de deps porque o useEffect ocupa várias linhas.
  useEffect(() => {
    // setState ocorre depois de await dentro de startTransition (assíncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErro(null)
    startTransition(async () => {
      try {
        const [kp, pp, tc, dp, hm, ev, rt, ra, rp, m, al, ac, as] = await Promise.all([
          flags.kpis        ? actions.getKpis(periodo, barra)            : Promise.resolve(null),
          flags.produtos    ? actions.getPorProduto(periodo, barra)      : Promise.resolve([]),
          flags.topClientes ? actions.getTopClientes(periodo, 20, barra) : Promise.resolve([]),
          flags.diario      ? actions.getDiarioProduto(periodo, barra)   : Promise.resolve([]),
          flags.heatmap     ? actions.getHeatmapDow(periodo, barra)      : Promise.resolve([]),
          flags.evolucao    ? actions.getEvolucaoMensal()                : Promise.resolve([]),
          flags.receita     ? actions.getReceitaTotal(periodo)           : Promise.resolve(null),
          flags.receita     ? actions.getReceitaPorAssessor(periodo)     : Promise.resolve([]),
          flags.receita     ? actions.getReceitaProjecao()               : Promise.resolve(null),
          flags.meta        ? actions.getMetaAnual()                     : Promise.resolve(null),
          flags.alertas     ? actions.getAlertas(30, barra)              : Promise.resolve([]),
          flags.acuracidade ? actions.getAcuracidadeResumo(60)           : Promise.resolve(null),
          flags.acuracidade ? actions.getAcuracidadeSerie(60)            : Promise.resolve([]),
        ])
        setData(d => ({
          ...d,
          kpis: kp, produtos: pp, topClientes: tc, diario: dp, heatmap: hm, evolucao: ev,
          receitaTotal: rt, receitaPorAss: ra, receitaProj: rp, meta: m,
          alertas: al, acuracidade: ac, acuracidadeSerie: as,
        }))
      } catch (err) {
        setErro((err as Error).message ?? 'Falha ao carregar dados')
      }
    })
  }, [periodo, barra]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...data, isPending, erro }
}
