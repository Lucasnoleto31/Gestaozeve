'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { TABS } from './types'
import type { Periodo, ClienteListaRow, BarraLista } from '../actions'
import { getFiltrosOpcoes } from '../actions'
import { useDashboardFilters } from './useDashboardFilters'
import { fmtDataPt, fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'
import { PageBody, PageHeader } from '@/components/ui/PageHeader'
import { PageTabs } from '@/components/ui/PageTabs'

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: '30d',  label: '30 dias' },
  { id: '60d',  label: '60 dias' },
  { id: '90d',  label: '90 dias' },
  { id: 'ano',  label: 'Ano' },
  { id: 'tudo', label: 'Tudo' },
]

// Context pra sub-rotas reportarem dataset_max e estado de loading pro Shell
type ShellCtx = {
  datasetMax: string | null
  setDatasetMax: (s: string | null) => void
  isLoading: boolean
  setIsLoading: (b: boolean) => void
}
const ShellContext = createContext<ShellCtx>({
  datasetMax: null, setDatasetMax: () => {},
  isLoading: false, setIsLoading: () => {},
})

export function useShell() { return useContext(ShellContext) }

// ===========================================================
// Shell: cabeçalho da página + abas + filtros globais fixos no topo.
// O conteúdo da aba vem via children.
// ===========================================================
export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [barras, setBarras] = useState<BarraLista[]>([])
  const [clientes, setClientes] = useState<ClienteListaRow[]>([])
  const [datasetMax, setDatasetMax] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Opções dos filtros numa única action (vem do cache no servidor depois da 1ª vez)
  useEffect(() => {
    getFiltrosOpcoes()
      .then(o => { setBarras(o.barras); setClientes(o.clientes) })
      .catch(() => {})
  }, [])

  const ctx = useMemo<ShellCtx>(
    () => ({ datasetMax, setDatasetMax, isLoading, setIsLoading }),
    [datasetMax, isLoading],
  )

  const tabs = useMemo(
    () => TABS.map(t => ({ label: t.label, href: t.href, hint: t.hint, exact: t.id === 'executivo' })),
    [],
  )

  return (
    <ShellContext.Provider value={ctx}>
      <PageHeader
        eyebrow="Lotes"
        title="Painel de lotes"
        description="Lotes girados nas três corretoras por barra, produto e cliente. Os filtros abaixo valem para todas as abas."
        actions={<StatusDados datasetMax={datasetMax} isLoading={isLoading} />}
      >
        <PageTabs items={tabs} />
      </PageHeader>

      <div className="sticky top-14 z-20 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur lg:px-8">
        <FilterBar barras={barras} clientes={clientes} datasetMax={datasetMax} isLoading={isLoading} />
      </div>

      <PageBody>{children}</PageBody>
    </ShellContext.Provider>
  )
}

function StatusDados({ datasetMax, isLoading }: { datasetMax: string | null; isLoading: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-fg-muted">
      {isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-accent" />}
      {datasetMax && (
        <span title="Data mais recente importada">
          Dados até <strong className="font-semibold text-fg">{fmtDataPt(datasetMax)}</strong>
        </span>
      )}
    </div>
  )
}

// ===========================================================
// Filtros globais (corretora + período + barra + excluir cliente) na URL
// ===========================================================
function RangeFilter({ customRange, datasetMax, isLoading, onApply }:
  { customRange: { inicio: string; fim: string } | null; datasetMax: string | null; isLoading: boolean;
    onApply: (inicio: string, fim: string) => void }
) {
  const [de, setDe] = useState(customRange?.inicio ?? '')
  const [ate, setAte] = useState(customRange?.fim ?? '')

  // Mantém os inputs em sincronia com a URL (navegação, reload):
  // reconciliação durante o render em vez de useEffect (evita render extra).
  const rangeKey = customRange ? `${customRange.inicio}:${customRange.fim}` : ''
  const [prevRangeKey, setPrevRangeKey] = useState(rangeKey)
  if (rangeKey !== prevRangeKey) {
    setPrevRangeKey(rangeKey)
    if (customRange) { setDe(customRange.inicio); setAte(customRange.fim) }
  }

  const active = customRange != null
  function update(nextDe: string, nextAte: string) {
    setDe(nextDe); setAte(nextAte)
    if (nextDe && nextAte) onApply(nextDe, nextAte)
  }

  const cls = cn('field-sm w-[128px] cursor-pointer', active ? 'border-accent font-medium text-fg' : 'text-fg-muted')

  return (
    <div className="flex items-center gap-1.5">
      <input type="date" value={de} max={ate || datasetMax || undefined} disabled={isLoading}
        onChange={e => update(e.target.value, ate)} className={cls} aria-label="Data inicial" />
      <span className="text-xs text-fg-subtle">até</span>
      <input type="date" value={ate} min={de || undefined} max={datasetMax || undefined} disabled={isLoading}
        onChange={e => update(de, e.target.value)} className={cls} aria-label="Data final" />
    </div>
  )
}

function Grupo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label">{label}</span>
      {children}
    </div>
  )
}

function FilterBar({ barras, clientes, datasetMax, isLoading }:
  { barras: BarraLista[]; clientes: ClienteListaRow[]; datasetMax: string | null; isLoading: boolean }
) {
  const {
    periodo, corretora, barra, excluir, customRange,
    setPeriodo, setRange, setCorretora, setBarra, setExcluir,
  } = useDashboardFilters()

  // Barras são de uma corretora só: com corretora escolhida, lista só as dela.
  const barrasVisiveis = corretora ? barras.filter(b => b.corretora === corretora) : barras
  const barraForaDaLista = barra != null && !barrasVisiveis.some(b => b.barra_nome === barra)

  // Se a URL tem um cliente que não está na lista (lista ainda carregando ou
  // nome antigo), mantém a opção pra o select mostrar o que está ativo.
  const excluirForaDaLista = excluir != null && !clientes.some(c => c.cliente_nome === excluir)

  const selectCls = (ativo: boolean) =>
    cn('field-sm max-w-[260px] cursor-pointer', ativo ? 'border-accent font-medium text-fg' : 'text-fg-muted')

  const temFiltro = !!(corretora || barra || excluir || customRange || periodo !== '30d')

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Grupo label="Corretora">
          <div className="flex flex-wrap gap-1">
            <button type="button" className="chip" data-active={corretora === null} disabled={isLoading}
              onClick={() => setCorretora(null)}>
              Todas
            </button>
            {CORRETORAS.map(c => {
              const active = c === corretora
              return (
                <button key={c} type="button" className="chip" data-active={active} disabled={isLoading}
                  onClick={() => setCorretora(c)}
                  style={active ? { background: CORRETORA_COLOR[c], borderColor: CORRETORA_COLOR[c], color: '#fff' } : undefined}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#fff' : CORRETORA_COLOR[c] }} />
                  {CORRETORA_LABEL[c]}
                </button>
              )
            })}
          </div>
        </Grupo>

        <Grupo label="Período">
          <div className="seg">
            {PERIODOS.map(p => (
              <button key={p.id} type="button" data-active={p.id === periodo} disabled={isLoading}
                onClick={() => setPeriodo(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <RangeFilter customRange={customRange} datasetMax={datasetMax} isLoading={isLoading} onApply={setRange} />
        </Grupo>

        <Grupo label="Barra">
          <select value={barra ?? ''} onChange={e => setBarra(e.target.value || null)} disabled={isLoading}
            className={selectCls(!!barra)} aria-label="Filtrar por barra">
            <option value="">{corretora ? `Todas as barras da ${CORRETORA_LABEL[corretora]}` : 'Todas as barras'}</option>
            {barraForaDaLista && <option value={barra!}>{barra}</option>}
            {barrasVisiveis.map(b => (
              <option key={`${b.corretora}|${b.barra_nome}`} value={b.barra_nome}>
                {b.barra_nome}{b.numero ? ` · ${b.numero}` : ''}{!corretora && isCorretora(b.corretora) ? ` · ${CORRETORA_LABEL[b.corretora]}` : ''}
              </option>
            ))}
          </select>
        </Grupo>

        <Grupo label="Excluir cliente">
          <select value={excluir ?? ''} onChange={e => setExcluir(e.target.value || null)} disabled={isLoading}
            className={selectCls(!!excluir)} aria-label="Excluir cliente dos lotes">
            <option value="">Nenhum (todos os clientes)</option>
            {excluirForaDaLista && <option value={excluir!}>{excluir}</option>}
            {clientes.map(c => (
              <option key={c.cliente_nome} value={c.cliente_nome}>
                {c.cliente_nome} · {fmtNum(c.lotes_operados)} lotes{c.num_contas > 1 ? ` · ${c.num_contas} contas` : ''}
              </option>
            ))}
          </select>
        </Grupo>

        {temFiltro && (
          <button type="button" disabled={isLoading}
            onClick={() => { setCorretora(null); setExcluir(null); setPeriodo('30d') }}
            className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg disabled:opacity-50">
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      {excluir && (
        <p className="mt-1.5 text-xs text-fg-muted">
          Mostrando todos os lotes <strong className="font-medium text-fg">exceto {excluir}</strong> (todas as contas desse cliente).
        </p>
      )}
    </div>
  )
}
