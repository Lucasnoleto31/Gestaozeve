'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { TABS } from './types'
import type { Periodo, ClienteListaRow, BarraLista } from '../actions'
import { getFiltrosOpcoes } from '../actions'
import { useDashboardFilters } from './useDashboardFilters'
import { fmtDataPt, fmtNum } from './utils'
import { CORRETORAS, CORRETORA_COLOR, CORRETORA_LABEL, isCorretora } from '@/lib/corretoras'

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
// Shell client component que envolve as sub-rotas
// Renderiza tabs + filtros globais (fixos no topo); o conteúdo da rota vem via children.
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

  return (
    <ShellContext.Provider value={{ datasetMax, setDatasetMax, isLoading, setIsLoading }}>
      <div className="px-4 lg:px-8 py-4 space-y-4">
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 pt-1 pb-3 space-y-3"
          style={{ background: 'var(--background)', borderBottom: '1px solid var(--border-subtle)' }}>
          <DashboardNav />
          <FilterBar barras={barras} clientes={clientes} datasetMax={datasetMax} isLoading={isLoading} />
        </div>
        {children}
      </div>
    </ShellContext.Provider>
  )
}

// ===========================================================
// Tabs (sub-rotas)
// ===========================================================
function DashboardNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl p-1.5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      {TABS.map(t => {
        const active = t.href === '/admin/contratos-dashboard'
          ? pathname === t.href
          : pathname.startsWith(t.href)
        return (
          <Link key={t.id} href={t.href} title={t.hint}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={active
              ? { background: 'var(--blue)', color: '#fff' }
              : { color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              if (!active) {
                ;(e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--foreground)'
              }
            }}
            onMouseLeave={(e) => {
              if (!active) {
                ;(e.currentTarget as HTMLElement).style.background = ''
                ;(e.currentTarget as HTMLElement).style.color = 'var(--muted)'
              }
            }}>
            {t.label}
          </Link>
        )
      })}
    </nav>
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

  // Mantém os inputs em sincronia com a URL (ex.: navegação, reload) —
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

  const inputStyle = {
    background: active ? 'var(--blue)' : 'var(--surface)',
    color: active ? '#fff' : 'var(--muted)',
    border: '1px solid var(--border)',
    colorScheme: 'light' as const,
  }

  return (
    <div className="flex items-center gap-1.5">
      <input type="date" value={de} max={ate || datasetMax || undefined} disabled={isLoading}
        onChange={e => update(e.target.value, ate)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
        style={inputStyle} aria-label="Data inicial" />
      <span className="text-xs text-gray-400">até</span>
      <input type="date" value={ate} min={de || undefined} max={datasetMax || undefined} disabled={isLoading}
        onChange={e => update(de, e.target.value)}
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
        style={inputStyle} aria-label="Data final" />
    </div>
  )
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">{children}</span>
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

  const selectStyle = (ativo: boolean, minWidth: number) => ({
    background: ativo ? 'var(--blue)' : 'var(--surface)',
    color: ativo ? '#fff' : 'var(--muted)',
    border: '1px solid var(--border)',
    minWidth,
  })

  const temFiltro = !!(corretora || barra || excluir || customRange || periodo !== '30d')

  return (
    <div className="rounded-2xl px-4 py-3 space-y-2.5"
      style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Rotulo>Corretora</Rotulo>
          <div className="flex flex-wrap gap-1">
            <button onClick={() => setCorretora(null)} disabled={isLoading}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={corretora === null
                ? { background: 'var(--blue)', color: '#fff' }
                : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
              Todas
            </button>
            {CORRETORAS.map(c => {
              const active = c === corretora
              return (
                <button key={c} onClick={() => setCorretora(c)} disabled={isLoading}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  style={active
                    ? { background: CORRETORA_COLOR[c], color: '#fff' }
                    : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: active ? '#fff' : CORRETORA_COLOR[c] }} />
                  {CORRETORA_LABEL[c]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Rotulo>Período</Rotulo>
          <div className="flex flex-wrap gap-1">
            {PERIODOS.map(p => {
              const active = p.id === periodo
              return (
                <button key={p.id} onClick={() => setPeriodo(p.id)} disabled={isLoading}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  style={active
                    ? { background: 'var(--blue)', color: '#fff' }
                    : { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                  {p.label}
                </button>
              )
            })}
          </div>
          <span className="text-[11px] text-gray-300">ou</span>
          <RangeFilter customRange={customRange} datasetMax={datasetMax} isLoading={isLoading} onApply={setRange} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Rotulo>Barra</Rotulo>
          <select
            value={barra ?? ''}
            onChange={e => setBarra(e.target.value || null)}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
            style={selectStyle(!!barra, 200)}>
            <option value="">{corretora ? `Todas as barras da ${CORRETORA_LABEL[corretora]}` : 'Todas as barras'}</option>
            {barraForaDaLista && <option value={barra!}>{barra}</option>}
            {barrasVisiveis.map(b => (
              <option key={`${b.corretora}|${b.barra_nome}`} value={b.barra_nome}>
                {b.barra_nome}{b.numero ? ` · ${b.numero}` : ''}{!corretora && isCorretora(b.corretora) ? ` · ${CORRETORA_LABEL[b.corretora]}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Rotulo>Excluir cliente</Rotulo>
          <select
            value={excluir ?? ''}
            onChange={e => setExcluir(e.target.value || null)}
            disabled={isLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 cursor-pointer"
            style={selectStyle(!!excluir, 220)}
            aria-label="Excluir cliente dos lotes">
            <option value="">Nenhum (todos os clientes)</option>
            {excluirForaDaLista && <option value={excluir!}>{excluir}</option>}
            {clientes.map(c => (
              <option key={c.cliente_nome} value={c.cliente_nome}>
                {c.cliente_nome} · {fmtNum(c.lotes_operados)} lotes{c.num_contas > 1 ? ` · ${c.num_contas} contas` : ''}
              </option>
            ))}
          </select>
        </div>

        {temFiltro && (
          <button onClick={() => { setCorretora(null); setExcluir(null); setPeriodo('30d') }} disabled={isLoading}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50">
            <X className="w-3.5 h-3.5" /> Limpar filtros
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500">
          {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
          {datasetMax && (
            <span title="Data mais recente no dataset">
              Dados até <strong className="text-gray-700">{fmtDataPt(datasetMax)}</strong>
            </span>
          )}
        </div>
      </div>

      {excluir && (
        <p className="text-xs text-gray-500">
          Mostrando todos os lotes <strong className="text-gray-700">exceto {excluir}</strong> (todas as contas desse cliente).
        </p>
      )}
    </div>
  )
}
