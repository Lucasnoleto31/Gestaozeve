// Receita no celular (18/11/2026, Lucas: "está muito confuso e não consigo entender nada"): os textos que
// só a versão de celular mostra. Ficam aqui, e não em lib/gestao/receitaTela.ts, porque a lista por cliente
// roda no navegador e aquele arquivo puxa a projeção inteira. Funções puras; testes em celular.test.ts.
import { fmtPct } from '@/lib/format'
import { mesCurto } from '@/lib/gestao/meses'

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// A fatia de um valor no total, que no celular fica embaixo do número: "8,9% do total" (a coluna
// "% do total" do computador). Fatia que arredonda para zero vira "menos de 0,1%": 0,0% ao lado de um
// valor que existe parece erro. Sem valor não há fatia.
export function fatiaDoTotal(valor: number, total: number): string | undefined {
  if (!(valor > 0) || !(total > 0)) return undefined
  const fatia = fmtPct((valor / total) * 100)
  return fatia === '0,0%' ? 'menos de 0,1%' : `${fatia} do total`
}

// O bloco "os 10 maiores clientes" não aparece no celular: são as primeiras linhas da lista por cliente.
// A conclusão dele ("Juntos, 52% da receita de nov/26") vira o subtítulo da lista. Quando os maiores são
// todos os que tiveram receita, a frase não diz nada e fica de fora.
export function fraseDosMaiores(quantos: number, pctJuntos: number, mesRef: string): string | null {
  if (quantos < 2 || pctJuntos >= 99.95) return null
  return `Os ${quantos} maiores somam ${fmtPct(pctJuntos, 0)} da receita de ${mesCurto(mesRef)}.`
}

// Embaixo do gráfico por mês, no lugar do subtítulo comprido: a barra soma o incentivo (o cartão e a frase
// do topo não somam) e a do mês em andamento vai só até o último dia lançado; sem o aviso ela parece queda.
export function notaDoGrafico(d: { incentivo: boolean; parcial: boolean; mesRef: string; ultimaData: string | null }): string | null {
  const soma = d.incentivo ? 'Cada barra soma a receita e o incentivo.' : null
  const noMes = d.parcial && !!d.ultimaData && d.ultimaData.slice(0, 7) === d.mesRef.slice(0, 7)
  const ate = noMes && d.ultimaData ? `A barra de ${mesCurto(d.mesRef)} vai só até ${ddmm(d.ultimaData)}.` : null
  return [soma, ate].filter(Boolean).join(' ') || null
}
