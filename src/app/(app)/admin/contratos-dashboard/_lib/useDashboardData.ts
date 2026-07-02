'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { Periodo } from '../actions'
import type { DashboardActions } from './types'

// Hook que carrega tudo (ou subset, controlado por flags) quando periodo/barra mudam.
// Cada sub-rota só pede o subset que precisa via flags.
// - Falha em UMA action não descarta as demais (o primeiro erro vira o banner).
// - Um contador de sequência descarta respostas de filtros antigos que
//   cheguem depois da mais recente (corrida ao trocar filtro rápido).

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
  curvaAbc?: boolean
  scoreCliente?: boolean
  clustersClientes?: boolean
  correlacoes?: boolean
  riscoEscritorio?: boolean
  retencao?: boolean
  incentivo?: boolean
  incentivoClientes?: boolean
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
    abc: Awaited<ReturnType<DashboardActions['getCurvaAbc']>>
    scoreCli: Awaited<ReturnType<DashboardActions['getScoreCliente']>>
    clusters: Awaited<ReturnType<DashboardActions['getClustersClientes']>>
    correl: Awaited<ReturnType<DashboardActions['getCorrelacoes']>>
    riscoEsc: Awaited<ReturnType<DashboardActions['getRiscoEscritorio']>> | null
    retencao: Awaited<ReturnType<DashboardActions['getRetencaoMensal']>>
    incentivo: Awaited<ReturnType<DashboardActions['getIncentivoMensal']>>
    incentivoCli: Awaited<ReturnType<DashboardActions['getIncentivoClientes']>>
  }>({
    kpis: null, produtos: [], topClientes: [], diario: [], heatmap: [], evolucao: [],
    receitaTotal: null, receitaPorAss: [], receitaProj: null, meta: null,
    alertas: [], acuracidade: null, acuracidadeSerie: [], barras: [],
    cohort: [], ltv: [], ranking: [], budget: [],
    produtosDetalhados: [], zeragemDist: [], receitaBL: null,
    receitaPlat: [], receitaClear: [], score: [], metasAss: [], alertasExec: [],
    fluxoOp: null, indiceSobr: null, riscoOp: [],
    abc: [], scoreCli: [], clusters: [], correl: [], riscoEsc: null,
    retencao: [], incentivo: [], incentivoCli: [],
  })

  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const seqRef = useRef(0)

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
    const seq = ++seqRef.current
    // setState ocorre depois de await dentro de startTransition (assíncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErro(null)
    startTransition(async () => {
      const erros: string[] = []
      // Cada chamada captura o próprio erro: uma RPC quebrada não descarta as demais.
      const safe = <T,>(cond: boolean | undefined, call: () => Promise<T>, fallback: T): Promise<T> =>
        cond ? call().catch((e: Error) => { erros.push(e?.message ?? 'Falha ao carregar dados'); return fallback }) : Promise.resolve(fallback)

      const [kp, pp, tc, dp, hm, ev, rt, ra, rp, m, al, ac, as, co, lt, rk, bd,
             pd, zd, rbl, rpl, rcl, sc, mt, ae,
             fo, is, ro,
             abc, scli, cls, corr, resc,
             ret, inc, incCli] = await Promise.all([
        safe(flags.kpis,        () => actions.getKpis(periodo, barra),            null),
        safe(flags.produtos,    () => actions.getPorProduto(periodo, barra),      []),
        safe(flags.topClientes, () => actions.getTopClientes(periodo, 20, barra), []),
        safe(flags.diario,      () => actions.getDiarioProduto(periodo, barra),   []),
        safe(flags.heatmap,     () => actions.getHeatmapDow(periodo, barra),      []),
        safe(flags.evolucao,    () => actions.getEvolucaoMensal(barra),           []),
        safe(flags.receita,     () => actions.getReceitaTotal(periodo),           null),
        safe(flags.receita,     () => actions.getReceitaPorAssessor(periodo),     []),
        safe(flags.receita,     () => actions.getReceitaProjecao(),               null),
        safe(flags.meta,        () => actions.getMetaAnual(),                     null),
        safe(flags.alertas,     () => actions.getAlertas(30, barra),              []),
        safe(flags.acuracidade, () => actions.getAcuracidadeResumo(60),           null),
        safe(flags.acuracidade, () => actions.getAcuracidadeSerie(60),            []),
        safe(flags.cohort,      () => actions.getCohortRetencao(12),              []),
        safe(flags.ltv,         () => actions.getLtvClientes(50),                 []),
        safe(flags.rankingAssessores, () => actions.getRankingAssessores(periodo), []),
        safe(flags.budget,      () => actions.getBudgetZeragem(periodo),          []),
        safe(flags.produtosDetalhados,  () => actions.getProdutosDetalhados(periodo, barra),  []),
        safe(flags.zeragemDistribuicao, () => actions.getZeragemDistribuicao(periodo, barra), []),
        safe(flags.receitaBrutaLiquida, () => actions.getReceitaBrutaLiquida(periodo),        null),
        safe(flags.receitaPlataforma,   () => actions.getReceitaPorPlataforma(periodo),       []),
        safe(flags.receitaClearing,     () => actions.getReceitaPorClearing(periodo),         []),
        safe(flags.scoreQualidade,      () => actions.getScoreQualidade(periodo),             []),
        safe(flags.metasAssessor,       () => actions.getMetasAssessor(),                     []),
        safe(flags.alertasExecutivos,   () => actions.getAlertasExecutivos(),                 []),
        safe(flags.fluxoOperacional,    () => actions.getFluxoOperacional(periodo, barra),    null),
        safe(flags.indiceSobrevivencia, () => actions.getIndiceSobrevivencia(periodo, barra), null),
        safe(flags.riscoOperacional,    () => actions.getRiscoOperacional(50, barra),         []),
        safe(flags.curvaAbc,            () => actions.getCurvaAbc(periodo, barra),            []),
        safe(flags.scoreCliente,        () => actions.getScoreCliente(100),                   []),
        safe(flags.clustersClientes,    () => actions.getClustersClientes(),                  []),
        safe(flags.correlacoes,         () => actions.getCorrelacoes(),                       []),
        safe(flags.riscoEscritorio,     () => actions.getRiscoEscritorio(),                   null),
        safe(flags.retencao,            () => actions.getRetencaoMensal(barra),               []),
        safe(flags.incentivo,           () => actions.getIncentivoMensal(),                   []),
        safe(flags.incentivoClientes,   () => actions.getIncentivoClientes(null),             []),
      ])

      // Resposta antiga chegando depois da mais nova → descarta
      if (seq !== seqRef.current) return

      setData(d => ({
        ...d,
        kpis: kp, produtos: pp, topClientes: tc, diario: dp, heatmap: hm, evolucao: ev,
        receitaTotal: rt, receitaPorAss: ra, receitaProj: rp, meta: m,
        alertas: al, acuracidade: ac, acuracidadeSerie: as,
        cohort: co, ltv: lt, ranking: rk, budget: bd,
        produtosDetalhados: pd, zeragemDist: zd, receitaBL: rbl,
        receitaPlat: rpl, receitaClear: rcl, score: sc, metasAss: mt, alertasExec: ae,
        fluxoOp: fo, indiceSobr: is, riscoOp: ro,
        abc: abc, scoreCli: scli, clusters: cls, correl: corr, riscoEsc: resc,
        retencao: ret, incentivo: inc, incentivoCli: incCli,
      }))
      if (erros.length > 0) setErro(erros[0])
    })
  }, [periodo, barra]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...data, isPending, erro }
}
