'use client'

// A lista de uma aba de Oportunidades (um grupo da tela Clientes), já ordenada pelo servidor: filtros
// rápidos, busca por nome, "fora da campanha" e a seleção em lote para atribuir as contas a um atendente
// (campanha de ativação). Quem gira em outra corretora do escritório vem marcado: não está parado, só não
// gira aqui. No celular a caixa de seleção some, o nome fica preso à esquerda e sobra uma coluna ao lado.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { LinhaVazia, MomentoBadge, TRACO, dataCurta, n0, rCurto } from '@/components/gestao/Celulas'
import { linkTelefone } from '@/lib/gestao/fila'
import { giraFora, rotuloGiroFora, textoGiroFora } from '@/lib/gestao/giroFora'
import type { Oportunidade, TipoOportunidade } from '@/lib/gestao/oportunidades'
import type { Corretora } from '@/lib/corretoras'
import { normTexto } from '@/lib/texto'
import { fmtNum } from '@/lib/format'
import { cn } from '@/lib/utils'
import { AtribuirCampanha } from '../clientes/AtribuirCampanha'

const PASSO = 50
type Filtro = { valor: string; label: string; passa: (o: Oportunidade) => boolean }
const FILTROS: Record<TipoOportunidade, Filtro[]> = {
  risco: [
    { valor: '', label: 'Todos', passa: () => true },
    { valor: 'parou', label: 'Pararam', passa: o => o.risco === 'parou' },
    { valor: 'queda', label: 'Em queda', passa: o => o.risco === 'em queda' },
    { valor: 'fora', label: 'Giram em outra corretora', passa: o => giraFora(o.fora) },
  ],
  // inativo começa no quarto mês sem giro (antes disso o cliente está em "Em risco")
  reativar: [
    { valor: '', label: 'Todos', passa: () => true },
    { valor: '6', label: 'Até 6 meses', passa: o => o.mesesSemGiro != null && o.mesesSemGiro <= 6 },
    { valor: '12', label: '7 a 12 meses', passa: o => o.mesesSemGiro != null && o.mesesSemGiro > 6 && o.mesesSemGiro <= 12 },
    { valor: '13', label: 'Mais de 12 meses', passa: o => o.mesesSemGiro != null && o.mesesSemGiro > 12 },
    { valor: 'fora', label: 'Giram em outra corretora', passa: o => giraFora(o.fora) },
  ],
  ativar: [
    { valor: '', label: 'Todos', passa: () => true },
    { valor: 'alta', label: 'Prioridade alta', passa: o => o.pontos >= 3 },
    { valor: 'fora', label: 'Giram em outra corretora', passa: o => giraFora(o.fora) },
    { valor: '30', label: 'Migrou há até 30 dias', passa: o => o.diasMigrado != null && o.diasMigrado <= 30 },
    { valor: '90', label: '31 a 90 dias', passa: o => o.diasMigrado != null && o.diasMigrado > 30 && o.diasMigrado <= 90 },
    { valor: 'opera', label: 'Já operam', passa: o => o.motivos.some(m => m.startsWith('já opera')) },
  ],
  abertura: [
    { valor: '', label: 'Todos', passa: () => true },
    { valor: 'gira', label: 'Já giram', passa: o => o.lotes12m > 0 },
    { valor: 'fora', label: 'Giram em outra corretora', passa: o => giraFora(o.fora) },
  ],
}
const TITULO: Record<TipoOportunidade, string> = { risco: 'Em risco: para segurar', reativar: 'Inativos: para reativar', ativar: 'Nunca operaram: para ativar', abertura: 'Em abertura: para acompanhar' }
const SUBTITULO: Record<TipoOportunidade, string> = {
  risco: 'Rendia por mês = receita de todo o histórico dividida pelos meses em que girou. Média 3 meses = lotes por mês antes de cair ou parar. Clique no nome para abrir a ficha e registrar o contato.',
  reativar: 'Rendia por mês = receita de todo o histórico dividida pelos meses em que girou. Quem gira em outra corretora não está perdido: só não gira aqui. Clique no nome para abrir a ficha e registrar o contato.',
  ativar: 'A ordem soma os sinais: giro em outra corretora, migração recente, lead que já opera e patrimônio declarado. Clique no nome para abrir a ficha e registrar o contato.',
  abertura: 'Quem já gira lotes com a conta ainda em abertura vem primeiro; depois, quem gira em outra corretora e quem espera há mais tempo.',
}
const meses = (n: number | null) => (n == null ? TRACO : n <= 0 ? 'este mês' : `${fmtNum(n)} ${n === 1 ? 'mês' : 'meses'}`)
const dias = (n: number | null) => (n == null ? TRACO : n <= 0 ? 'hoje' : `${fmtNum(n)} ${n === 1 ? 'dia' : 'dias'}`)
const patrimonio = (v: number | null) => (v == null || v <= 0 ? TRACO : v >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : v >= 1000 ? `R$ ${fmtNum(Math.round(v / 1000))} mil` : rCurto(v))

export function TabelaOportunidades({ tipo, linhas, corretora, base, atendentes }: {
  tipo: TipoOportunidade
  linhas: Oportunidade[]
  corretora: Corretora
  base: string
  atendentes: string[]
}) {
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [soFora, setSoFora] = useState(false)
  // Em risco e Inativos: tira da lista quem gira em outra corretora (sobram os parados de verdade)
  const [semGiroFora, setSemGiroFora] = useState(false)
  const comEstado = tipo === 'risco'   // só em "Em risco" o estado muda de uma linha para outra (Em queda / Parou há N dias)
  const temGiroFora = useMemo(() => linhas.some(o => giraFora(o.fora)), [linhas])
  const [limite, setLimite] = useState(PASSO)
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set())
  const filtros = FILTROS[tipo]

  const filtradas = useMemo(() => {
    const f = filtros.find(x => x.valor === filtro) ?? filtros[0]
    const termo = normTexto(busca)
    return linhas.filter(o => f.passa(o) && (!soFora || !o.ativador) && (!semGiroFora || !giraFora(o.fora)) && (!termo || normTexto(o.nome).includes(termo)))
  }, [linhas, filtros, filtro, busca, soFora, semGiroFora])
  const visiveis = filtradas.slice(0, limite)
  const todosVisiveis = visiveis.length > 0 && visiveis.every(o => selecionados.has(o.cliente_id))
  const marcar = (ids: string[], sim: boolean) => setSelecionados(s => { const n = new Set(s); for (const id of ids) { if (sim) n.add(id); else n.delete(id) } return n })
  const colunas = tipo === 'risco' ? 11 : tipo === 'reativar' ? 10 : 8

  return (
    <Panel title={`${TITULO[tipo]} · ${fmtNum(filtradas.length)}`} subtitle={SUBTITULO[tipo]}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="seg">
          {filtros.map(f => <button key={f.valor} type="button" data-active={filtro === f.valor} onClick={() => { setFiltro(f.valor); setLimite(PASSO) }}>{f.label}</button>)}
        </div>
        <input type="search" className="field-sm w-full sm:w-56" placeholder="Buscar pelo nome…" value={busca} onChange={e => { setBusca(e.target.value); setLimite(PASSO) }} aria-label="Buscar pelo nome" />
        <label className="flex items-center gap-2 text-dense text-fg-muted">
          <input type="checkbox" checked={soFora} onChange={e => { setSoFora(e.target.checked); setLimite(PASSO) }} />
          só fora da campanha
        </label>
        {(tipo === 'reativar' || tipo === 'risco') && temGiroFora && filtro !== 'fora' && (
          <label className="flex items-center gap-2 text-dense text-fg-muted" title="Quem gira em outra corretora do escritório não está parado: só não gira aqui">
            <input type="checkbox" checked={semGiroFora} onChange={e => { setSemGiroFora(e.target.checked); setLimite(PASSO) }} />
            sem quem gira em outra corretora
          </label>
        )}
      </div>

      {selecionados.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-3 py-2 text-dense">
          <span className="font-semibold tabular-nums">{fmtNum(selecionados.size)} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}</span>
          <AtribuirCampanha corretora={corretora} clienteIds={[...selecionados]} atendentes={atendentes} onFeito={() => setSelecionados(new Set())} />
          {filtradas.length > visiveis.length && !filtradas.every(o => selecionados.has(o.cliente_id)) && (
            <button type="button" className="link text-label" onClick={() => marcar(filtradas.map(o => o.cliente_id), true)}>selecionar os {fmtNum(filtradas.length)} da lista</button>
          )}
          <button type="button" className="link text-label" onClick={() => setSelecionados(new Set())}>limpar</button>
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl tbl-dense">
          <thead>
            <tr>
              <th className="col-p2 w-8">
                <input type="checkbox" checked={todosVisiveis} disabled={visiveis.length === 0} onChange={e => marcar(visiveis.map(o => o.cliente_id), e.target.checked)}
                  aria-label={todosVisiveis ? 'Desmarcar as linhas à mostra' : 'Marcar as linhas à mostra'} title="Marcar as linhas à mostra para atribuir à campanha" />
              </th>
              <th className="col-nome">Cliente</th>
              {tipo === 'risco' && <><th className="col-p2">Como está</th><th className="num">Rendia por mês</th><th className="num col-p2">Média 3 meses</th><th className="num col-p2">Lotes no mês</th><th className="num col-p3">Último giro</th></>}
              {tipo === 'reativar' && <><th className="num col-p2">Parou há</th><th className="num">Rendia por mês</th><th className="num col-p2">Receita total</th><th className="num col-p3">Último giro</th></>}
              {tipo === 'ativar' && <><th className="num col-p2">Migrou há</th><th>Por que agora</th><th className="num col-p2">Patrimônio</th></>}
              {tipo === 'abertura' && <><th className="num col-p2">Em abertura há</th><th className="num">Lotes 12 m</th></>}
              {tipo !== 'ativar' && <th className="col-p2" title="Giro do cliente em outra corretora do escritório: lotes no mês de lá, ou o último mês com giro">Outra corretora</th>}
              <th className="col-p3">Responsável</th>
              <th className="col-p2">Campanha</th>
              <th className="num col-p2">Último contato</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && <LinhaVazia colunas={colunas}>Ninguém nesta lista com esses filtros.</LinhaVazia>}
            {visiveis.map(o => {
              const wa = linkTelefone(o.telefone)
              return (
                <tr key={o.cliente_id} className={cn(selecionados.has(o.cliente_id) && 'bg-accent-soft')}>
                  <td className="col-p2"><input type="checkbox" checked={selecionados.has(o.cliente_id)} onChange={e => marcar([o.cliente_id], e.target.checked)} aria-label={`Marcar ${o.nome}`} /></td>
                  <td className="col-nome max-w-[190px] truncate md:max-w-[260px]">
                    <Link href={`${base}/clientes/${o.cliente_id}`} className="link font-medium">{o.nome}</Link>
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex align-middle text-fg-subtle hover:text-fg" title={`WhatsApp ${o.telefone}`} aria-label={`WhatsApp de ${o.nome}`}><MessageCircle className="h-3.5 w-3.5" aria-hidden /></a>}
                    {/* no celular a coluna do estado some: ele desce para baixo do nome, como na lista de Clientes */}
                    {comEstado && <span className="mt-1 block md:hidden"><MomentoBadge cliente={{ situacao: o.situacao, risco: o.risco, dias_sem_giro: o.diasSemGiro }} /></span>}
                  </td>
                  {tipo === 'risco' && (
                    <>
                      <td className="col-p2 whitespace-nowrap"><MomentoBadge cliente={{ situacao: o.situacao, risco: o.risco, dias_sem_giro: o.diasSemGiro }} /></td>
                      <td className={cn('num font-semibold', !o.mediaAtiva && 'subtle')}>{rCurto(o.mediaAtiva)}</td>
                      <td className={cn('num col-p2', !o.media3m && 'subtle')}>{n0(Math.round(o.media3m))}</td>
                      <td className={cn('num col-p2', !o.lotesMes && 'subtle')}>{n0(o.lotesMes)}</td>
                      <td className="num col-p3">{dataCurta(o.ultimoGiro)}</td>
                    </>
                  )}
                  {tipo === 'reativar' && (
                    <>
                      <td className="num col-p2">{meses(o.mesesSemGiro)}</td>
                      <td className={cn('num font-semibold', !o.mediaAtiva && 'subtle')}>{rCurto(o.mediaAtiva)}</td>
                      <td className={cn('num col-p2', !o.receitaTotal && 'subtle')}>{rCurto(o.receitaTotal)}</td>
                      <td className="num col-p3">{dataCurta(o.ultimoGiro)}</td>
                    </>
                  )}
                  {tipo === 'ativar' && (
                    <>
                      <td className="num col-p2">{dias(o.diasMigrado)}</td>
                      <td className={cn('whitespace-normal md:whitespace-nowrap', o.motivos.length ? 'text-fg' : 'subtle')}>{o.motivos.length ? o.motivos.join(' · ') : 'conta antiga, sem sinal recente'}</td>
                      <td className="num col-p2">{patrimonio(o.patrimonio)}</td>
                    </>
                  )}
                  {tipo === 'abertura' && (
                    <>
                      <td className="num col-p2">{dias(o.diasEmAbertura)}</td>
                      <td className={cn('num', o.lotes12m ? 'font-semibold text-gain' : 'subtle')}>{n0(o.lotes12m)}</td>
                    </>
                  )}
                  {tipo !== 'ativar' && (
                    <td className={cn('col-p2 whitespace-nowrap', !o.fora ? 'subtle' : giraFora(o.fora) ? 'font-medium' : 'muted')} title={o.fora ? textoGiroFora(o.fora) : undefined}>
                      {o.fora ? rotuloGiroFora(o.fora) : TRACO}
                    </td>
                  )}
                  <td className="muted col-p3">{o.responsavel ?? TRACO}</td>
                  <td className={cn('col-p2 whitespace-nowrap', o.ativador ? 'font-medium' : 'subtle')}>{o.ativador ?? TRACO}</td>
                  <td className={cn('num col-p2', !o.ultimo_contato && 'subtle')} title={o.contatos ? `${fmtNum(o.contatos)} ${o.contatos === 1 ? 'contato registrado' : 'contatos registrados'}` : undefined}>{dataCurta(o.ultimo_contato)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {filtradas.length > visiveis.length && (
        <div className="mt-3 text-center">
          <button type="button" className="link text-dense" onClick={() => setLimite(l => l + PASSO)}>mostrar mais ({fmtNum(filtradas.length - visiveis.length)} restantes)</button>
        </div>
      )}
    </Panel>
  )
}
