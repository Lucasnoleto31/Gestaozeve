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
  cohort?: boolean
  ltv?: boolean
  rankingAssessores?: boolean
  budget?: boolean
  produtosDetalhados?: boolean
  zeragemDistribuicao?: boolean
  receitaBrutaLiquida?: boolean
  receitaPlataforma?: boolean
  receitaClearing?: boolean
  scoreQualidade?: boolean
  metasAssessor?: boolean
  alertasExecutivos?: boolean
  fluxoOperacional?: boolean
  indiceSobrevivencia?: boolean
  riscoOperacional?: boolean
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
    cohort: Awaited<ReturnType<DashboardActions['getCohortRetencao']>>
    ltv: Awaited<ReturnType<DashboardActions['getLtvClientes']>>
    ranking: Awaited<ReturnType<DashboardActions['getRankingAssessores']>>
    budget: Awaited<ReturnType<DashboardActions['getBudgetZeragem']>>
    produtosDetalhados: Awaited<ReturnType<DashboardActions['getProdutosDetalhados']>>
    zeragemDist: Awaited<ReturnType<DashboardActions['getZeragemDistribuicao']>>
    receitaBL: Awaited<ReturnType<DashboardActions['getReceitaBrutaLiquida']>> | null
    receitaPlat: Awaited<ReturnType<DashboardActions['getReceitaPorPlataforma']>>
    receitaClear: Awaited<ReturnType<DashboardActions['getReceitaPorClearing']>>
    score: Awaited<ReturnType<DashboardActions['getScoreQualidade']>>
    metasAss: Awaited<ReturnType<DashboardActions['getMetasAssessor']>>
    alertasExec: Awaited<ReturnType<DashboardActions['getAlertasExecutivos']>>
    fluxoOp: Awaited<ReturnType<DashboardActions['getFluxoOperacional']>> | null
    indiceSobr: Awaited<ReturnType<DashboardActions['getIndiceSobrevivencia']>> | null
    riscoOp: Awaited<ReturnType<DashboardActions['getRiscoOperacional']>>
  }>({
    kpis: null, produtos: [], topClientes: [], diario: [], heatmap: [], evolucao: [],
    receitaTotal: null, receitaPorAss: [], receitaProj: null, meta: null,
    alertas: [], acuracidade: null, acuracidadeSerie: [], barras: [],
    cohort: [], ltv: [], ranking: [], budget: [],
    produtosDetalhados: [], zeragemDist: [], receitaBL: null,
    receitaPlat: [], receitaClear: [], score: [], metasAss: [], alertasExec: [],
    fluxoOp: null, indiceSobr: null, riscoOp: [],
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
        const [kp, pp, tc, dp, hm, ev, rt, ra, rp, m, al, ac, as, co, lt, rk, bd,
               pd, zd, rbl, rpl, rcl, sc, mt, ae,
               fo, is, ro] = await Promise.all([
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
          flags.cohort      ? actions.getCohortRetencao(12)              : Promise.resolve([]),
          flags.ltv         ? actions.getLtvClientes(50)                 : Promise.resolve([]),
          flags.rankingAssessores ? actions.getRankingAssessores(periodo) : Promise.resolve([]),
          flags.budget      ? actions.getBudgetZeragem(periodo)            : Promise.resolve([]),
          flags.produtosDetalhados   ? actions.getProdutosDetalhados(periodo, barra)  : Promise.resolve([]),
          flags.zeragemDistribuicao  ? actions.getZeragemDistribuicao(periodo, barra) : Promise.resolve([]),
          flags.receitaBrutaLiquida  ? actions.getReceitaBrutaLiquida(periodo)        : Promise.resolve(null),
          flags.receitaPlataforma    ? actions.getReceitaPorPlataforma(periodo)       : Promise.resolve([]),
          flags.receitaClearing      ? actions.getReceitaPorClearing(periodo)         : Promise.resolve([]),
          flags.scoreQualidade       ? actions.getScoreQualidade(periodo)             : Promise.resolve([]),
          flags.metasAssessor        ? actions.getMetasAssessor()                     : Promise.resolve([]),
          flags.alertasExecutivos    ? actions.getAlertasExecutivos()                 : Promise.resolve([]),
          flags.fluxoOperacional     ? actions.getFluxoOperacional(periodo, barra)    : Promise.resolve(null),
          flags.indiceSobrevivencia  ? actions.getIndiceSobrevivencia(periodo, barra) : Promise.resolve(null),
          flags.riscoOperacional     ? actions.getRiscoOperacional(50, barra)         : Promise.resolve([]),
        ])
        setData(d => ({
          ...d,
          kpis: kp, produtos: pp, topClientes: tc, diario: dp, heatmap: hm, evolucao: ev,
          receitaTotal: rt, receitaPorAss: ra, receitaProj: rp, meta: m,
          alertas: al, acuracidade: ac, acuracidadeSerie: as,
          cohort: co, ltv: lt, ranking: rk, budget: bd,
          produtosDetalhados: pd, zeragemDist: zd, receitaBL: rbl,
          receitaPlat: rpl, receitaClear: rcl, score: sc, metasAss: mt, alertasExec: ae,
          fluxoOp: fo, indiceSobr: is, riscoOp: ro,
        }))
      } catch (err) {
        setErro((err as Error).message ?? 'Falha ao carregar dados')
      }
    })
  }, [periodo, barra]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...data, isPending, erro }
}
