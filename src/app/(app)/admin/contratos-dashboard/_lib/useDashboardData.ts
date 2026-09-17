'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { Periodo, DataFlags, DashboardBundle } from '../actions'
import { getDashboardBundle, getBarrasAtivas } from '../actions'

export type { DataFlags }

// Hook que carrega o subset de dados que a sub-rota pede (via flags) sempre
// que período/barra/exclusão mudam.
// - Faz UMA server action por carga (getDashboardBundle): o Next enfileira
//   Server Actions, então 8 actions em Promise.all rodavam em sequência.
// - Falha em UMA RPC não descarta as demais (o primeiro erro vira o banner).
// - Um contador de sequência descarta respostas de filtros antigos que
//   cheguem depois da mais recente (corrida ao trocar filtro rápido).

type Barra = { barra_nome: string; numero: string | null }
type Data = Omit<DashboardBundle, 'erros'> & { barras: Barra[] }

const VAZIO: Data = {
  kpis: null, produtos: [], topClientes: [], diario: [], heatmap: [], evolucao: [],
  receitaTotal: null, receitaPorAss: [], receitaProj: null, meta: null,
  alertas: [], acuracidade: null, acuracidadeSerie: [], barras: [],
  cohort: [], ltv: [], ranking: [], budget: [],
  produtosDetalhados: [], zeragemDist: [], receitaBL: null,
  plataformas: [], receitaClear: [], score: [], metasAss: [], alertasExec: [],
  fluxoOp: null, indiceSobr: null, riscoOp: [],
  abc: [], scoreCli: [], clusters: [], correl: [], riscoEsc: null,
  retencao: [], incentivo: [], incentivoCli: [],
}

export function useDashboardData(periodo: Periodo, barra: string | null, excluir: string | null, flags: DataFlags) {
  const [data, setData] = useState<Data>(VAZIO)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const seqRef = useRef(0)

  // Lista de barras 1x na montagem (não muda com os filtros)
  useEffect(() => {
    if (!flags.barras) return
    getBarrasAtivas()
      .then(b => setData(d => ({ ...d, barras: b })))
      .catch(() => {})
  }, [flags.barras])

  // Flags são objeto literal recriado a cada render, mas a intenção é
  // recarregar SOMENTE quando os filtros mudam (flags são fixas por sub-rota).
  useEffect(() => {
    const seq = ++seqRef.current
    // setState ocorre depois de await dentro de startTransition (assíncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setErro(null)
    startTransition(async () => {
      let bundle: DashboardBundle
      try {
        bundle = await getDashboardBundle(periodo, barra, excluir, flags)
      } catch (e) {
        if (seq !== seqRef.current) return
        setErro((e as Error)?.message ?? 'Falha ao carregar dados')
        return
      }
      // Resposta antiga chegando depois da mais nova → descarta
      if (seq !== seqRef.current) return
      const { erros, ...rest } = bundle
      setData(d => ({ ...d, ...rest }))
      if (erros.length > 0) setErro(erros[0])
    })
  }, [periodo, barra, excluir]) // eslint-disable-line react-hooks/exhaustive-deps

  return { ...data, isPending, erro }
}
