// Meus pontos (remuneração por níveis, S62): quem está no modelo vê o próprio nível, os pontos do mês, quanto já
// fez e o que falta para subir. Só a conta de quem está logado. Fica na Minha fila (a primeira tela da atendente)
// e no Início. Quem não está no modelo não vê nada; uma falha também não derruba a tela.
import Link from 'next/link'
import { meusPontos, type MeusPontos as Dados } from '@/lib/gestao/consultasRemuneracao'
import { DICA_PONTOS, fraseDoNivel, pontosTxt, reais } from '@/lib/gestao/remuneracaoTexto'
import { fmtNum } from '@/lib/format'
import { Dica } from '@/components/ui/Dica'
import { semQuebra } from '@/components/gestao/Resumo'

const plural = (n: number, um: string, varios: string) => `${fmtNum(n)} ${n === 1 ? um : varios}`

export async function MeusPontos({ comLink = false }: { comLink?: boolean }) {
  let d: Dados | null = null
  try { d = await meusPontos() } catch { return null }
  if (!d) return null
  const texto = fraseDoNivel({ tabelas: [d.tabela], mesCorrente: d.conta.mes, nome: d.pessoa.nome, conta: d.conta, voce: true })
  if (!texto) return null
  const p = d.conta.pontos
  return (
    <section aria-label="Meus pontos" className="max-w-5xl rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-label font-medium text-fg-muted">Meus pontos · Nível {d.conta.nivel?.nivel}</h2>
        {comLink && <Link href={`/comissoes?parceiro=${encodeURIComponent(d.pessoa.nome)}`} className="link text-label">Ver a conta do mês</Link>}
      </div>
      <p className="mt-1.5 text-balance text-dense text-fg">{semQuebra(texto.frase)}</p>
      <p className="mt-1 text-label text-fg-muted">{semQuebra(texto.apoio)}</p>
      <p className="mt-2 inline-flex flex-wrap items-center gap-x-1.5 text-label text-fg-subtle">
        {plural(p.ativacoes, 'ativação', 'ativações')} · {plural(p.reativacoes, 'reativação', 'reativações')} · {pontosTxt(p.pontosBase)} da base ({reais(p.liquidoBase)} de líquido)
        <Dica texto={DICA_PONTOS} />
      </p>
    </section>
  )
}
