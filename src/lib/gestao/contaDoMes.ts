// A conta do mês do Painel, para ler de cima para baixo: o que entrou, o que saiu e o que ficou.
// Lucas, 16/11/2026: a tabela de indicadores tinha passado de 40 linhas ("virou uma bagunça, não entendo
// absolutamente nada"). Aqui o mesmo dinheiro cabe em uma dúzia de linhas; o detalhe de cada passo fica
// na aba Mês a mês. Só funções puras (testes em contaDoMes.test.ts).
import type { Participacao, Repasse } from './btg'
import type { TotaisBanking } from './banking'
import { resultadoDepoisDosCustos, type CustosDoMes, type ItemCustoMes } from './custos'

export type LinhaConta = {
  // titulo = cabeçalho de um bloco · base = de onde a conta parte (não entra na soma) · entrada = o valor de
  // onde se desconta · menos / mais = o que sai e o que entra · subtotal / total · parte = divisão do total ·
  // info = lembrete fora da conta
  tipo: 'titulo' | 'base' | 'entrada' | 'menos' | 'mais' | 'subtotal' | 'total' | 'parte' | 'info'
  rotulo: string
  // sempre positivo (o tipo diz se soma ou desconta), EXCETO no total e nas partes depois dos custos do
  // escritório: o resultado pode ser negativo, e a parte negativa é quanto cada sócio cobre
  valor: number | null
  nota?: string
}

const pct = (v: number, casas = 1) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas })} %`
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const lista = (nomes: string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`)

export type DadosContaRepasse = {
  corretora: string              // 'BTG'
  repasse: Repasse               // a cadeia do giro no mês (calcularRepasse)
  pctDoFechamento: boolean       // o % de comissão do mês veio do fechamento; senão, das faixas
  deltaPct: number
  impostoPct: number
  fora: TotaisBanking | null     // produtos fora do giro gravados para o mês
  banking: TotaisBanking | null  // Banking gravado para o mês
  participacoes: Participacao[]  // divisão entre os sócios
  // comissão por conta (abertura e ativação), paga à parte; nos meses com equipe nos custos, chega sem a parte
  // de quem já está em Equipe (com valor)
  comissaoParceiros: number
  custos?: CustosDoMes | null    // custos fixos do escritório no mês (custosDoMes); sem custo, a conta é a de sempre
  // true só para o admin: os custos aparecem separados (custos mensais e equipe, com o valor de cada pessoa).
  // Para o resto da equipe, uma linha só com o total, sem valor por pessoa: em Comissões o valor de cada
  // comissionado só aparece para o admin e para a própria pessoa
  verEquipe?: boolean
}

// "Aikon R$ 1.976,12 e Milena R$ 1.995,01 · fixo e comissões do mês, como em Comissões"
function notaDaEquipe(itens: ItemCustoMes[]): string {
  const cada = itens.map(i => i.valor == null ? `${i.nome} sem valor em Comissões`
    : `${i.nome} ${brl(i.valor)}${i.tipo === 'equipe-btg' ? ' (só a parte do BTG)' : ''}`)
  return `${lista(cada)} · fixo e comissões do mês, como em Comissões`
}

// Corretora com cadeia de repasse (BTG): a comissão que a corretora paga, o que sai dela (Delta, imposto,
// parceiros) e o que entra por fora dos lotes, até a comissão líquida do escritório e a parte de cada sócio.
export function contaComRepasse(d: DadosContaRepasse): LinhaConta[] {
  const r = d.repasse
  const terceiros = r.parceiros.reduce((s, p) => s + p.terceiros, 0)
  const impostoParceiros = r.parceiros.reduce((s, p) => s + p.imposto, 0)
  const aRepassar = r.parceiros.filter(p => p.parceiro > 0)
  const extras = (d.fora?.liquida ?? 0) + (d.banking?.liquida ?? 0)
  const total = r.liquido + extras
  const linhas: LinhaConta[] = [
    { tipo: 'titulo', rotulo: 'Giro (lotes e zeragem)', valor: null },
    { tipo: 'base', rotulo: 'Receita do giro', valor: r.receita, nota: 'lotes × tarifa + zeragem' },
    {
      tipo: 'entrada', rotulo: `Comissão que o ${d.corretora} paga`, valor: r.comissao,
      nota: `${pct(r.pctEfetivo)} da receita líquida do ${d.corretora} (${brl(r.liquida)})${d.pctDoFechamento ? ', percentual do fechamento' : ', pelas faixas'}`,
    },
    {
      tipo: 'menos', rotulo: terceiros > 0 ? 'Delta e terceiros' : 'Delta', valor: r.delta + terceiros,
      nota: `${pct(d.deltaPct, 0)} da comissão dos clientes diretos${terceiros > 0 ? ' e a parte de terceiros nos clientes de parceiros' : ''}`,
    },
    { tipo: 'menos', rotulo: 'Imposto', valor: r.imposto + impostoParceiros, nota: `${pct(d.impostoPct)} sobre a comissão do escritório` },
  ]
  if (aRepassar.length) linhas.push({ tipo: 'menos', rotulo: 'Parceiros, a repassar', valor: r.repasseParceiros, nota: `a parte de ${lista(aRepassar.map(p => p.nome))} na comissão dos clientes deles` })
  // sem nada gravado fora dos lotes, o líquido do giro já é o total: uma linha só
  if (d.fora || d.banking) {
    linhas.push({ tipo: 'subtotal', rotulo: 'Líquido do giro', valor: r.liquido })
    linhas.push({ tipo: 'titulo', rotulo: 'Fora dos lotes', valor: null })
    if (d.fora) linhas.push({ tipo: 'mais', rotulo: 'Fora do giro', valor: d.fora.liquida, nota: `CDB, saldo remunerado, aluguel e fundos · comissão de ${brl(d.fora.comissao)}, já sem a parte de terceiros e o imposto` })
    if (d.banking) linhas.push({ tipo: 'mais', rotulo: 'Banking', valor: d.banking.liquida, nota: `cartão e saldo remunerado · comissão de ${brl(d.banking.comissao)}, já sem a parte de terceiros e o imposto` })
  }
  const custos = d.custos?.temCusto ? d.custos : null
  if (!custos) {
    linhas.push({ tipo: 'total', rotulo: 'Comissão líquida do escritório', valor: total })
    for (const p of d.participacoes) linhas.push({ tipo: 'parte', rotulo: `${p.nome} (${pct(p.pct, 0)})`, valor: (total * p.pct) / 100 })
  } else {
    // custos fixos do escritório: saem da comissão líquida antes da divisão entre os sócios
    const mensais = custos.itens.filter(i => i.tipo === 'valor')
    const equipe = custos.itens.filter(i => i.tipo !== 'valor')
    linhas.push({ tipo: 'subtotal', rotulo: 'Comissão líquida do escritório', valor: total })
    if (d.verEquipe) {
      linhas.push({ tipo: 'titulo', rotulo: 'Custos do escritório', valor: null })
      if (mensais.length) linhas.push({ tipo: 'menos', rotulo: 'Custos mensais', valor: custos.mensais, nota: lista(mensais.map(i => i.nome)) })
      if (equipe.length) linhas.push({ tipo: 'menos', rotulo: 'Equipe', valor: custos.equipe, nota: notaDaEquipe(equipe) })
    } else {
      // uma linha só, com nomes e sem valores: nem o valor de cada pessoa nem o total da equipe aparecem
      linhas.push({
        tipo: 'menos', rotulo: 'Custos do escritório', valor: custos.total,
        nota: `custos mensais${equipe.length ? ` e equipe (${lista(equipe.map(i => i.nome))})` : ''}`,
      })
    }
    const resultado = resultadoDepoisDosCustos(total, custos)   // a mesma conta das frases e do Mês a mês
    linhas.push({ tipo: 'total', rotulo: 'Resultado depois dos custos', valor: resultado })
    for (const p of d.participacoes) linhas.push({ tipo: 'parte', rotulo: `${p.nome} (${pct(p.pct, 0)})`, valor: (resultado * p.pct) / 100 })
  }
  // a comissão por conta de quem está em Equipe já chega fora deste valor (AbaResumo); o resto continua à parte
  const equipeNosCustos = !!custos?.itens.some(i => i.tipo !== 'valor')
  if (d.comissaoParceiros > 0) {
    linhas.push({
      tipo: 'info', rotulo: 'Comissão de parceiros por conta', valor: d.comissaoParceiros,
      nota: equipeNosCustos ? 'abertura e ativação de conta de quem não está nos custos: paga à parte, não está descontada acima' : 'abertura e ativação de conta: paga à parte, não está descontada acima',
    })
  }
  return linhas
}

export type DadosContaReceita = {
  corretora: string             // 'Genial'
  corretagem: number
  zeragem: number
  fixa: number                  // corretagem fixa de ações, cripto e posições
  receita: number               // o total do giro (corretagem + zeragem + fixa)
  incentivo: number | null      // null = a corretora não paga incentivo por pontos
  clientesComFaixa: number
  comissaoParceiros: number
}

// Corretora sem cadeia de repasse no sistema (Genial, XP): a receita bruta do giro e o incentivo
export function contaDaReceita(d: DadosContaReceita): LinhaConta[] {
  const linhas: LinhaConta[] = [
    { tipo: 'titulo', rotulo: 'Giro (lotes e zeragem)', valor: null },
    { tipo: 'mais', rotulo: 'Corretagem', valor: d.corretagem, nota: 'lotes × tarifa' },
    { tipo: 'mais', rotulo: 'Zeragem', valor: d.zeragem, nota: 'contratos zerados × valor da zeragem' },
  ]
  if (d.fixa > 0) linhas.push({ tipo: 'mais', rotulo: 'Corretagem fixa', valor: d.fixa, nota: 'ações, cripto e posições' })
  if (d.incentivo == null) {
    linhas.push({ tipo: 'total', rotulo: 'Receita do giro', valor: d.receita })
  } else {
    linhas.push({ tipo: 'subtotal', rotulo: 'Receita do giro', valor: d.receita })
    linhas.push({ tipo: 'titulo', rotulo: 'Incentivo', valor: null })
    linhas.push({ tipo: 'mais', rotulo: `Incentivo ${d.corretora}`, valor: d.incentivo, nota: `pontos por cliente · ${d.clientesComFaixa.toLocaleString('pt-BR')} ${d.clientesComFaixa === 1 ? 'cliente com faixa' : 'clientes com faixa'}` })
    linhas.push({ tipo: 'total', rotulo: 'Receita total', valor: d.receita + d.incentivo })
  }
  if (d.comissaoParceiros > 0) linhas.push({ tipo: 'info', rotulo: 'Comissão de parceiros por conta', valor: d.comissaoParceiros, nota: 'abertura e ativação de conta: paga à parte, não está descontada acima' })
  return linhas
}

// Quanto a conta soma até uma linha: serve para conferir que o subtotal e o total fecham
export function somaAte(linhas: LinhaConta[], ate: (l: LinhaConta) => boolean): number {
  let s = 0
  for (const l of linhas) {
    if (ate(l)) return s
    if (l.tipo === 'entrada' || l.tipo === 'mais') s += l.valor ?? 0
    else if (l.tipo === 'menos') s -= l.valor ?? 0
  }
  return s
}
