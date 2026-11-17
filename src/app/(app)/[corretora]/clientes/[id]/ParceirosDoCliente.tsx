'use client'

// Ficha do cliente › Editar › Parceiros do cliente (S61). Lucas, 17/11/2026: o cliente pode estar em outro
// código nosso e ter o produto de um parceiro, e pode ter 3 ou 4 parceiros dividindo o que ele gera.
// Uma linha por parceiro: quem é, o percentual dele em tudo o que o cliente gerar nesta corretora e desde
// quando vale. Trocar o percentual vale do mês corrente em diante (o que já passou fica como estava); a
// linha tirada vira histórico. Só o administrador altera; o estado é guardado por quem usa o bloco e vai
// junto no Salvar da ficha.
import { Plus, Undo2, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Dica } from '@/components/ui/Dica'
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { mesCurto } from '@/lib/gestao/meses'
import { mesesDoFormulario, type LinhaForm, type ParceiroDoCliente } from '@/lib/gestao/parceirosCliente'
import { cn } from '@/lib/utils'

// O que está na tela: o percentual como foi digitado e, na linha que já existia, como ela estava gravada
export type LinhaTela = { parceiro: string; pct: string; desde: string; gravada?: { pct: number; desde: string } }
export type EstadoParceiros = { linhas: LinhaTela[]; apagar: string[] }

const pctTexto = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const pctNumero = (v: string) => (v.trim() ? Number(v.trim().replace(',', '.')) : Number.NaN)

export const estadoDosParceiros = (existentes: ParceiroDoCliente[]): EstadoParceiros => ({
  linhas: existentes.filter(e => e.ate == null).map(e => ({ parceiro: e.parceiro, pct: pctTexto(e.pct), desde: e.desde, gravada: { pct: e.pct, desde: e.desde } })),
  apagar: [],
})
export const parceirosParaGravar = (estado: EstadoParceiros): LinhaForm[] => estado.linhas.map(l => ({ parceiro: l.parceiro, pct: pctNumero(l.pct), desde: l.desde }))
// Alguma coisa mudou em relação ao que está gravado?
export function parceirosMudaram(existentes: ParceiroDoCliente[], estado: EstadoParceiros): boolean {
  const abertas = existentes.filter(e => e.ate == null)
  if (estado.apagar.length || estado.linhas.length !== abertas.length) return true
  return estado.linhas.some(l => !l.gravada || !abertas.some(e => e.parceiro === l.parceiro) || pctNumero(l.pct) !== l.gravada.pct || l.desde !== l.gravada.desde)
}

export function ParceirosDoCliente({ corretora, existentes, opcoes, disponivel, admin, mesCorrente, estado, onChange }: {
  corretora: Corretora
  existentes: ParceiroDoCliente[]   // a lista gravada, com o histórico
  opcoes: string[]                  // parceiros com participação cadastrada, que podem entrar nesta corretora
  disponivel: boolean               // a tabela já existe no banco (S61)
  admin: boolean
  mesCorrente: string
  estado: EstadoParceiros
  onChange: (e: EstadoParceiros) => void
}) {
  const nome = CORRETORA_LABEL[corretora]
  const meses = mesesDoFormulario(mesCorrente)
  const encerradas = existentes.filter(e => e.ate != null)
  const soma = estado.linhas.reduce((s, l) => s + (Number.isFinite(pctNumero(l.pct)) ? pctNumero(l.pct) : 0), 0)
  const usados = new Set(estado.linhas.map(l => l.parceiro))
  const livres = opcoes.filter(o => !usados.has(o))
  const trocar = (i: number, campos: Partial<LinhaTela>) => onChange({ ...estado, linhas: estado.linhas.map((l, j) => (j === i ? { ...l, ...campos } : l)) })
  // percentual novo numa linha que já valeu em mês fechado: passa a valer do mês corrente em diante
  const trocarPct = (i: number, pct: string) => {
    const l = estado.linhas[i]
    const jaValeu = !!l.gravada && l.gravada.desde < mesCorrente && l.desde === l.gravada.desde
    trocar(i, jaValeu && pctNumero(pct) !== l.gravada!.pct ? { pct, desde: mesCorrente } : { pct })
  }
  // no BTG a parte do parceiro sai da comissão que o BTG paga; nas outras, da corretagem e da zeragem
  const peloFechamento = corretora === 'BTG'
  const onde = peloFechamento ? `no ${nome}` : `na ${nome}`
  const explicacao = peloFechamento
    ? `Cada parceiro leva o percentual dele da comissão que o ${nome} paga por este cliente, depois do imposto, em qualquer código nosso. Com lista, o campo Parceiro / origem deixa de valer para a comissão deste cliente.`
    : `Cada parceiro leva o percentual dele da corretagem e da zeragem deste cliente na ${nome}, em qualquer código nosso. O incentivo entra com o mesmo percentual só para o parceiro cuja regra tem incentivo. Com lista, o código do assessor deixa de valer para a comissão deste cliente.`

  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="label flex items-center gap-1.5">Parceiros do cliente<Dica texto={explicacao} /></p>
        {admin && disponivel && livres.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => onChange({ ...estado, linhas: [...estado.linhas, { parceiro: livres.length === 1 ? livres[0] : '', pct: '', desde: mesCorrente }] })}>
            <Plus className="h-3.5 w-3.5" aria-hidden />Adicionar parceiro
          </Button>
        )}
      </div>

      {!disponivel && <p className="text-micro text-fg-subtle">Disponível depois que o script S61 rodar no Supabase.</p>}
      {disponivel && estado.linhas.length === 0 && (
        <p className="text-micro text-fg-subtle">
          Sem lista: vale o de sempre ({peloFechamento ? 'o campo Parceiro / origem acima' : 'o código do assessor'}).
          {admin ? ' Adicione um parceiro para dividir o que este cliente gera.' : ' Só o administrador altera.'}
        </p>
      )}

      {disponivel && estado.linhas.length > 0 && (
        <div className="space-y-2">
          {estado.linhas.map((l, i) => {
            const mudouComeco = !!l.gravada && l.desde !== l.gravada.desde
            return (
              <div key={i}>
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_auto]">
                  <select className="field-sm col-span-3 sm:col-span-1" value={l.parceiro} disabled={!admin || !!l.gravada} aria-label={`Parceiro ${i + 1}`}
                    onChange={e => trocar(i, { parceiro: e.target.value })}>
                    {!l.parceiro && <option value="">Escolha o parceiro</option>}
                    {[...new Set([l.parceiro, ...livres].filter(Boolean))].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <div className="relative">
                    <input className="field-sm w-full pr-6 text-right tabular-nums" value={l.pct} inputMode="decimal" placeholder="0" disabled={!admin}
                      aria-label={`Percentual de ${l.parceiro || `parceiro ${i + 1}`}`} onChange={e => trocarPct(i, e.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-micro text-fg-subtle" aria-hidden>%</span>
                  </div>
                  <select className="field-sm" value={l.desde} disabled={!admin} aria-label={`Desde quando vale o percentual de ${l.parceiro || `parceiro ${i + 1}`}`}
                    onChange={e => trocar(i, { desde: e.target.value })}>
                    {[...new Set([l.desde, ...meses])].sort().reverse().map(m => <option key={m} value={m}>desde {mesCurto(m)}</option>)}
                  </select>
                  {admin && (
                    <IconButton tone="danger" title="Tirar o parceiro" aria-label={`Tirar ${l.parceiro || `parceiro ${i + 1}`}`}
                      onClick={() => onChange({ ...estado, linhas: estado.linhas.filter((_, j) => j !== i) })}><X className="h-4 w-4" aria-hidden /></IconButton>
                  )}
                </div>
                {mudouComeco && l.gravada && (
                  <p className="mt-1 text-micro text-fg-subtle">
                    {l.desde > l.gravada.desde
                      ? `Vale a partir de ${mesCurto(l.desde)}; antes disso fica como estava (${pctTexto(l.gravada.pct)} % desde ${mesCurto(l.gravada.desde)}).`
                      : `Passa a valer desde ${mesCurto(l.desde)}: os meses a partir dele são recalculados.`}
                  </p>
                )}
              </div>
            )
          })}
          <p className={cn('text-micro', soma > 100 ? 'text-loss' : 'text-fg-subtle')}>
            {soma > 100
              ? `A soma passa de 100 %: está em ${pctTexto(soma)} %.`
              : `Soma dos parceiros: ${pctTexto(soma)} % do que o cliente gerar ${onde}. Tirar um parceiro vale deste mês em diante; o que já passou fica no histórico.`}
          </p>
        </div>
      )}

      {disponivel && encerradas.length > 0 && (
        <ul className="mt-3 space-y-1 text-micro text-fg-muted">
          {encerradas.map(e => {
            const sai = estado.apagar.includes(e.id)
            return (
              <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn(sai && 'text-fg-subtle line-through')}>
                  {e.parceiro} · {pctTexto(e.pct)} % · {e.desde === e.ate ? `em ${mesCurto(e.desde)}` : `de ${mesCurto(e.desde)} a ${mesCurto(e.ate ?? e.desde)}`}
                </span>
                {admin && (sai
                  ? <button type="button" className="link inline-flex items-center gap-1" onClick={() => onChange({ ...estado, apagar: estado.apagar.filter(x => x !== e.id) })}><Undo2 className="h-3 w-3" aria-hidden />desfazer</button>
                  : <button type="button" className="link" title="Apaga esta linha do histórico: os meses dela deixam de contar para o parceiro"
                      onClick={() => onChange({ ...estado, apagar: [...estado.apagar, e.id] })}>apagar</button>)}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
