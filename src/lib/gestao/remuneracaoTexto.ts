// Os textos da remuneração por níveis (S62), comuns a Comissões, ao Início e à Minha fila: a frase do nível,
// formatos de pontos e percentual e as explicações atrás do "i". Só funções puras.
import { somarMeses } from './meses'
import { NIVEIS_PADRAO, faltaParaSubir, vigente, type ContaMes, type TabelaNiveis } from './remuneracao'

const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeMes = (m: string) => NOME_MES[Number(m.slice(5, 7)) - 1] ?? m
export const nomeMesAno = (m: string, ref: string) => (m.slice(0, 4) === ref.slice(0, 4) ? nomeMes(m) : `${nomeMes(m)} de ${m.slice(0, 4)}`)
export const listaTexto = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)
export const pts = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
// "1,0 ponto", "1,5 ponto", "2,0 pontos" (abaixo de 2, singular)
export const pontosTxt = (v: number) => `${pts(v)} ${Math.abs(v) < 2 ? 'ponto' : 'pontos'}`
export const pctTxt = (f: number) => `${(f * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} %`
export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export const DICA_PONTOS = '1 ponto por cliente novo girando (Genial ou BTG), 1 por cliente parado que volta a girar e 1 por R$ 1.000 que a base ativa deixa para o escritório no mês. Abertura não conta ponto: já é paga na hora.'
export const DICA_NIVEL = 'O nível é revisto a cada 3 meses pela média dos pontos dos 3 meses anteriores (só os meses trabalhados). Sobe na revisão em que a média passa do limite; desce só depois de duas revisões seguidas abaixo.'
export const DICA_LIQUIDO = 'Líquido = o que o cliente deixou para o escritório no mês. Genial: corretagem e zeragem × R$ 0,64 (depois do que a Genial fica, PIS/COFINS e IR), mais o incentivo, menos a plataforma e a parte de parceiro com participação. BTG: a comissão que o BTG paga, menos Delta e imposto (cliente de parceiro: menos o imposto, a parte do parceiro e a de terceiros). O bônus é cheio nos 12 meses depois do último movimento da pessoa com o cliente e metade depois.'

// Fixo, variável e total dentro do filtro de corretora (null = todas)
export function partesDoMes(c: ContaMes, corretora: string | null) {
  if (!corretora) return { total: c.valor.total, fixo: c.valor.fixo, variavel: c.valor.variavel }
  const x = c.valor.porCorretora[corretora]
  return { total: x?.total ?? 0, fixo: x?.fixo ?? 0, variavel: x?.variavel ?? 0 }
}

// A frase do nível: até quando vale, de que média veio, o que o mês já rendeu e o que falta para subir.
// `voce` = falando com a própria pessoa (Meus pontos); `mesCorrente` = o mês ainda em andamento.
export function fraseDoNivel(o: { tabelas: TabelaNiveis[]; mesCorrente: string; nome: string; conta: ContaMes; corretora?: string | null; rotuloCorretora?: string; voce?: boolean }): { frase: string; apoio: string } | null {
  const { conta: c } = o
  const n = c.nivel
  if (!n) return null
  const fim = somarMeses(n.proximaRevisao, -1)
  const p = partesDoMes(c, o.corretora ?? null)
  const andamento = c.mes === o.mesCorrente
  const quem = o.voce ? 'Você' : o.nome
  const deOnde = n.mesesMedia.length ? `média de ${pontosTxt(n.media)} por mês em ${listaTexto(n.mesesMedia.map(nomeMes))}` : 'sem mês trabalhado antes da entrada no modelo'
  const onde = o.rotuloCorretora ? ` na ${o.rotuloCorretora}` : ''
  const frase = `${quem} está no Nível ${n.nivel} até ${nomeMesAno(fim, c.mes)} (${deOnde}). Em ${nomeMes(c.mes)} ${andamento ? 'fez até agora' : 'fez'} ${pontosTxt(c.pontos.total)} e ${andamento ? 'soma' : 'gerou'} ${reais(p.total)}${onde}: fixo de ${reais(p.fixo)} e ${reais(p.variavel)} de variável.`
  const tabela = vigente(o.tabelas, n.proximaRevisao) ?? NIVEIS_PADRAO
  const sobe = faltaParaSubir(tabela, n.nivel, 0)
  const proximos = [3, 2, 1].map(i => somarMeses(n.proximaRevisao, -i))
  let apoio = sobe
    ? `Na revisão de ${nomeMesAno(n.proximaRevisao, c.mes)} vale a média de ${listaTexto(proximos.map(nomeMes))}: com ${sobe.proximo.pontosMin.toLocaleString('pt-BR')} pontos por mês, ${o.voce ? 'você sobe' : 'sobe'} para o Nível ${sobe.proximo.nivel} (fixo de ${reais(sobe.proximo.fixo)}).`
    : 'É o nível mais alto da tabela.'
  if (n.abaixo > 0) apoio += ` Na última revisão a média ficou abaixo do Nível ${n.nivel}: se ficar abaixo de novo, desce.`
  return { frase, apoio }
}
