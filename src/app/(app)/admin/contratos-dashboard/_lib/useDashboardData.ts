'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import type { Periodo, DataFlags, DashboardBundle } from '../actions'
import { getDashboardBundle } from '../actions'

export type { DataFlags }

// Hook que carrega o subset de dados que a sub-rota pede (via flags) sempre
// que período/corretora/barra/exclusão mudam.
// - Faz UMA server action por carga (getDashboardBundle): o Next enfileira
//   Server Actions, então várias actions em Promise.all rodavam em sequência.
// - Falha em UMA RPC não descarta as demais (o primeiro erro vira o banner).
// - Um contador de sequência descarta respostas de filtros antigos que
//   cheguem depois da mais recente (corrida ao trocar filtro rápido).

type Data = Omit<DashboardBundle, 'erros'>

const VAZIO: Data = {
  range: { inicio: '', fim: '' },
  kpis: null, kpisAnterior: null,
  produtos: [], produtosDetalhados: [], topClientes: [], diario: [], evolucao: [],
  receitaTotal: null, receitaPorAss: [], receitaProj: null, receitaBL: null,
  meta: null, metasCorretoras: [],
  ranking: [], plataformas: [], retencao: [], incentivo: [], incentivoCli: [],
  corretoras: [], evolucaoCorretora: [], evolucaoBarras: [], abc: [],
}

export function useDashboardData(
  periodo: Periodo,
  barra: string | null,
  excluir: string | null,
  corretora: string | null,
  flags: DataFlags,
) {
  const [data, setData] = useState<Data>(VAZIO)
  const [carregou, setCarregou] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const seqRef = useRef(0)

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
        bundle = await getDashboardBundle(periodo, barra, excluir, corretora, flags)
      } catch (e) {
        if (seq !== seqRef.current) return
        setErro((e as Error)?.message ?? 'Falha ao carregar dados')
        setCarregou(true)
        return
      }
      // Resposta antiga chegando depois da mais nova → descarta
      if (seq !== seqRef.current) return
      const { erros, ...rest } = bundle
      setData(rest)
      setCarregou(true)
      if (erros.length > 0) setErro(erros[0])
    })
  }, [periodo, barra, excluir, corretora]) // eslint-disable-line react-hooks/exhaustive-deps

  // loading = primeira carga ainda não chegou OU nova carga em andamento
  return { ...data, isPending, loading: isPending || !carregou, erro }
}
