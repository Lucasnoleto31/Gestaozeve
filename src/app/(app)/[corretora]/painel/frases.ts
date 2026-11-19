// As frases que abrem as três abas do Painel no celular (DESIGN.md §8.2): a conclusão antes dos números.
// Só funções puras, com os números que cada aba já calculou (testes em frases.test.ts); nenhuma conta nova.
// A do Resumo segue o esboço que o Lucas aprovou em 18/11/2026: quanto entrou e com quantos lotes, a
// comparação justa (no mesmo ponto do mês) e, embaixo, onde o mês fecha no ritmo atual. Os valores são os
// mesmos dos cartões logo abaixo, sem arredondar ("R$ 87.719", não "R$ 88 mil"), para os dois baterem.
import { MESES_LONGOS, fmtBRL, fmtNum } from '@/lib/format'
import { somarMeses } from '@/lib/gestao/meses'

const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const variacao = (atual: number, anterior: number | null | undefined) => (anterior ? ((atual - anterior) / anterior) * 100 : null)
// "4,8% abaixo de outubro": uma casa, como o cartão logo abaixo (−4,8%), para os dois dizerem o mesmo número
const posicao = (v: number, de: string) => (Math.abs(v) < 0.05 ? `no mesmo nível de ${de}`
  : `${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% ${v > 0 ? 'acima' : 'abaixo'} de ${de}`)

export type Frases = { frase: string; apoio: string | null }

// ── Resumo: como está o mês ──────────────────────────────────────────────────
export type DadosDoResumo = {
  corretora: string                 // "A Genial", "O BTG": o nome com o artigo
  mes: string
  parcial: boolean                  // mês em andamento, com dias úteis pela frente: vale a previsão
  lotes: number                     // lotes do mês (o número do cartão)
  lotesComparavel: number           // os lotes na base da comparação (giro por dia)
  lotesBase: number | null          // mês anterior no mesmo ponto (em andamento) ou inteiro (fechado)
  medida: string                    // o nome do cartão em destaque: receita total · comissão líquida · receita
  medidaNaFrase: boolean            // a frase diz o nome da medida ("de comissão líquida"); na receita, "gerou R$" basta
  valor: number                     // o número do cartão em destaque
  valorAnterior: number | null      // o mesmo número no mês anterior inteiro
  medidaPrevista: string | null     // o que a previsão mede quando não é a mesma coisa do cartão (BTG: só o giro)
  previsto: number | null           // onde o mês deve fechar, em reais
  lotesPrevistos: number | null     // onde o mês deve fechar, em lotes
}

// Mês em andamento: quanto entrou até agora, os lotes contra o mês anterior no mesmo ponto (a comparação
// justa) e onde o mês deve fechar. Mês fechado: quanto ficou e os lotes, contra o mês anterior inteiro.
export function frasesDoResumo(d: DadosDoResumo): Frases {
  const atual = nomeDoMes(d.mes), anterior = nomeDoMes(somarMeses(d.mes, -1))
  if (d.lotes <= 0) return { frase: `Ainda não há lotes lançados em ${atual}.`, apoio: null }
  const vLotes = variacao(d.lotesComparavel, d.lotesBase)
  const quanto = d.valor > 0 ? `gerou ${fmtBRL(d.valor)}${d.medidaNaFrase ? ` de ${d.medida}` : ''} em ${atual}` : `teve ${fmtNum(d.lotes)} lotes em ${atual}`
  const lotes = d.valor > 0 ? `, com ${fmtNum(d.lotes)} lotes` : ''
  if (d.parcial) {
    const contra = vLotes == null ? '' : `: ${posicao(vLotes, anterior)} no mesmo ponto do mês`
    const reais = d.previsto ? `${fmtBRL(d.previsto)}${d.medidaPrevista ? ` de ${d.medidaPrevista}` : ''}` : null
    const emLotes = d.lotesPrevistos ? `${fmtNum(Math.round(d.lotesPrevistos))} lotes` : null
    const fecha = [reais, emLotes].filter(Boolean).join(' e ')
    return {
      frase: `${d.corretora} ${quanto} até agora${lotes}${contra}.`,
      apoio: fecha ? `No ritmo atual o mês fecha perto de ${fecha}.` : null,
    }
  }
  const contra = vLotes == null ? '' : `: ${posicao(vLotes, anterior)}`
  const vValor = d.valor > 0 ? variacao(d.valor, d.valorAnterior) : null
  return {
    frase: `${d.corretora} ${quanto}${lotes}${contra}.`,
    apoio: vValor == null ? null : `${maiuscula(d.medida)} ${posicao(vValor, anterior)}.`,
  }
}

// ── Mês a mês: como evoluiu ──────────────────────────────────────────────────
// Os três meses mais novos na medida da linha de total da tabela, com os mesmos valores dela (sem
// arredondar: a tabela vem logo abaixo). `meses` do mais novo para o mais antigo.
export function fraseDosMeses(medida: string, meses: { mes: string; valor: number | null }[], emAndamento: boolean): string | null {
  const [m0, ...resto] = meses
  if (!m0) return null
  const antes = resto.filter(m => m.valor != null && m.valor > 0).slice(0, 2)
  // "outubro fechou em R$ 196.482 e setembro em R$ 182.618": o verbo só no primeiro, e só quando ainda não foi dito
  const dizer = (comVerbo: boolean) => antes.map((m, i) => `${nomeDoMes(m.mes)}${comVerbo && i === 0 ? ' fechou' : ''} em ${fmtBRL(m.valor ?? 0)}`).join(' e ')
  if (!m0.valor || m0.valor <= 0) return `Ainda não há ${medida} em ${nomeDoMes(m0.mes)}${antes.length ? `; ${dizer(true)}` : ''}.`
  const abre = `${maiuscula(nomeDoMes(m0.mes))}${emAndamento ? ', em andamento, está' : ' fechou'} em ${fmtBRL(m0.valor)} de ${medida}`
  return antes.length ? `${abre}; ${dizer(emAndamento)}.` : `${abre}.`
}

// ── Clientes: como está a base ───────────────────────────────────────────────
// "giraram" é a palavra do cartão Ativos no mês e da linha Todos; "Operando" é o nome de um grupo e não entra aqui
export function frasesDaBase(d: { mes: string; ativos: number; levados: number; emRisco: number; riscoAlto: number; nunca: number }): Frases {
  if (d.levados <= 0) return { frase: 'Ainda não há clientes cadastrados.', apoio: null }
  const partes = [
    d.emRisco > 0 ? `${fmtNum(d.emRisco)} ${d.emRisco === 1 ? 'está' : 'estão'} em risco${d.riscoAlto ? ` (${fmtNum(d.riscoAlto)} de nível alto)` : ''}` : 'Nenhum está em risco',
    ...(d.nunca > 0 ? [`${fmtNum(d.nunca)} nunca ${d.nunca === 1 ? 'operou' : 'operaram'}`] : []),
  ]
  return {
    frase: `${fmtNum(d.ativos)} dos ${fmtNum(d.levados)} clientes ${d.ativos === 1 ? 'girou' : 'giraram'} em ${nomeDoMes(d.mes)}.`,
    apoio: `${partes.join(' e ')}.`,
  }
}
