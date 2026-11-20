// A conta do mês (contaDoMes.ts) em duas colunas, para ler de cima para baixo: cada linha diz o que é,
// com a explicação em letra pequena logo abaixo, e quanto vale. O que sai vem com "(–)" e sinal de menos;
// o que entra depois de um subtotal, com "+"; subtotal e total vêm com "=". Com centavos em tudo, para as
// somas fecharem à vista. Sem hooks: serve em Server Components.
import type { LinhaConta } from '@/lib/gestao/contaDoMes'
import { fmtBRL2 } from '@/lib/format'
import { cn } from '@/lib/utils'

export function ContaDoMes({ linhas, className }: { linhas: LinhaConta[]; className?: string }) {
  const primeiroSubtotal = linhas.findIndex(l => l.tipo === 'subtotal')
  return (
    <table className={cn('tbl w-full', className)}>
      <tbody>
        {linhas.map((l, i) => {
          if (l.tipo === 'titulo') {
            return <tr key={i}><td colSpan={2} className={cn('border-b-0 pb-1', i === 0 ? 'pt-0' : 'pt-5')}><span className="label">{l.rotulo}</span></td></tr>
          }
          const soma = l.tipo === 'mais' && primeiroSubtotal >= 0 && i > primeiroSubtotal   // o que entra depois de um subtotal
          // o total e as partes depois dos custos do escritório podem ser negativos: sinal de menos e cor de perda
          const negativo = (l.tipo === 'total' || l.tipo === 'parte') && l.valor != null && l.valor < 0
          const valor = l.valor == null ? '' : negativo ? `− ${fmtBRL2(-l.valor)}` : `${l.tipo === 'menos' ? '− ' : soma ? '+ ' : ''}${fmtBRL2(l.valor)}`
          const recuo = l.tipo === 'menos' || l.tipo === 'mais' || l.tipo === 'parte'
          const forte = l.tipo === 'entrada' || l.tipo === 'subtotal'
          const apagado = l.tipo === 'menos' || l.tipo === 'parte' || l.tipo === 'info'
          return (
            <tr key={i} className={cn(l.tipo === 'total' && 'total')}>
              <td className={cn(recuo && 'pl-7', l.tipo === 'info' && 'pt-5')}>
                <span className={cn(forte && 'font-semibold', apagado && 'text-fg-muted')}>
                  {l.tipo === 'menos' ? '(–) ' : l.tipo === 'subtotal' || l.tipo === 'total' ? '= ' : ''}{l.rotulo}
                </span>
                {l.nota && <span className="block text-micro font-normal text-fg-subtle">{l.nota}</span>}
              </td>
              <td className={cn('num align-top', forte && 'font-semibold', negativo ? 'text-loss' : apagado && 'text-fg-muted', l.tipo === 'info' && 'pt-5')}>{valor}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
