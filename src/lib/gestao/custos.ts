// Custos fixos do escritório (parâmetro custos_fixos da corretora; hoje só no BTG). Lucas, 20/11/2026: "Assim
// saberemos quando vamos começar a lucrar de verdade. Eles vem antes da divisão Lucas e Artur".
// Só funções puras (testes em custos.test.ts). A leitura do valor da equipe fica em consultasCustos.ts e a
// gravação em acoesCustos.ts.
//
// O texto tem itens separados por ";":
//   custo mensal       nome:valor:desde[:ate]        Claude Artur:1100:2026-11 · Supabase:228.01:2026-11
//   pessoa da equipe   nome:equipe:desde[:ate]       tudo o que a pessoa gerou no mês em Comissões
//                      nome:equipe-btg:desde[:ate]   só a parte que Comissões atribui ao BTG
// desde e ate em AAAA-MM; ate é opcional e inclusivo. Mudar um valor a partir de um mês = pôr "ate" no item
// antigo e lançar outro com o novo "desde": os meses anteriores não mudam.
import { MESES_LONGOS, fmtBRL } from '@/lib/format'
import { normTexto } from '@/lib/texto'
import { numeroParam } from './btg'

export const CHAVE_CUSTOS_FIXOS = 'custos_fixos'

export type TipoCusto = 'valor' | 'equipe' | 'equipe-btg'
export type CustoFixo = {
  nome: string
  tipo: TipoCusto
  valor: number          // só nos custos mensais; 0 na equipe (o valor vem de Comissões, mês a mês)
  desde: string          // 'AAAA-MM'
  ate: string | null     // 'AAAA-MM', inclusivo; null = sem fim
}

export type ItemCustoMes = { nome: string; tipo: TipoCusto; valor: number | null }   // null = sem valor em Comissões
export type CustosDoMes = {
  mes: string                // 'AAAA-MM-01'
  itens: ItemCustoMes[]      // os itens em vigor no mês, na forma canônica (custos mensais, depois a equipe)
  mensais: number            // soma dos custos mensais
  equipe: number             // soma da equipe que tem valor
  total: number              // mensais + equipe
  temCusto: boolean          // algum item em vigor no mês
  equipeIncompleta: boolean  // alguma pessoa da equipe ficou sem valor (a conta segue sem ela)
}

const round2 = (v: number) => Math.round(v * 100) / 100
const MES = /^(\d{4})-(\d{2})$/
const mesValido = (s: string | null | undefined): s is string => {
  const m = MES.exec(s ?? '')
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12
}
const ehEquipe = (t: TipoCusto) => t !== 'valor'
// 'AAAA-MM' ou 'AAAA-MM-01' → 'AAAA-MM'
const mes7 = (mes: string) => mes.slice(0, 7)

// 'Claude Artur:1100:2026-11;Aikon:equipe:2026-11' → itens (vazio quando o texto é vazio ou inválido). Lê da
// direita para a esquerda: o nome pode ter ":". Aceita '228,01' e '1.100'.
export function lerCustosFixos(s: string | null | undefined): CustoFixo[] {
  if (!s || !s.trim()) return []
  const out: CustoFixo[] = []
  for (const parte of s.split(';')) {
    if (!parte.trim()) continue
    const campos = parte.split(':')
    const ultimo = (k = 1) => campos[campos.length - k].trim()
    if (campos.length >= 4 && ultimo() === '') campos.pop()   // 'nome:valor:desde:' = sem fim
    if (campos.length < 3) return []
    let ate: string | null = null
    if (campos.length >= 4 && mesValido(ultimo()) && mesValido(ultimo(2))) ate = campos.pop()!.trim()
    const desde = campos.pop()!.trim()
    if (!mesValido(desde)) return []
    const tipoOuValor = campos.pop()!.trim().toLowerCase()
    const nome = campos.join(':').trim()
    if (!nome) return []
    if (tipoOuValor === 'equipe' || tipoOuValor === 'equipe-btg') {
      out.push({ nome, tipo: tipoOuValor, valor: 0, desde, ate })
    } else {
      const valor = numeroParam(tipoOuValor)
      if (valor == null) return []
      out.push({ nome, tipo: 'valor', valor, desde, ate })
    }
  }
  return out
}

// A ordem canônica: custos mensais primeiro (por nome e desde), depois a equipe (por nome e desde)
function ordenar(lista: CustoFixo[]): CustoFixo[] {
  return [...lista].sort((a, b) =>
    Number(ehEquipe(a.tipo)) - Number(ehEquipe(b.tipo)) || a.nome.localeCompare(b.nome, 'pt-BR') || a.desde.localeCompare(b.desde))
}

// Itens → texto na forma canônica: valor com ponto decimal e sem milhar (1100, 228.01)
export function textoCustosFixos(lista: CustoFixo[]): string {
  return ordenar(lista)
    .map(c => [c.nome.trim(), c.tipo === 'valor' ? String(round2(c.valor)) : c.tipo, c.desde, ...(c.ate ? [c.ate] : [])].join(':'))
    .join(';')
}

const rotuloMes = (mes: string) => `${MESES_LONGOS[Number(mes.slice(5, 7)) - 1] ?? mes}/${mes.slice(0, 4)}`

// Mensagem de erro legível, ou null quando a lista está boa
export function validarCustosFixos(lista: CustoFixo[]): string | null {
  for (const c of lista) {
    const nome = c.nome.trim()
    if (!nome) return 'Falta o nome de um dos custos.'
    if (c.tipo === 'valor' && !(Number.isFinite(c.valor) && c.valor > 0)) return `O valor de ${nome} tem de ser maior que zero.`
    if (!mesValido(c.desde)) return `O mês de início de ${nome} tem de ser AAAA-MM, por exemplo 2026-11.`
    if (c.ate != null && !mesValido(c.ate)) return `O mês de fim de ${nome} tem de ser AAAA-MM, por exemplo 2026-12.`
    if (c.ate != null && c.ate < c.desde) return `${nome} termina (${rotuloMes(c.ate)}) antes de começar (${rotuloMes(c.desde)}).`
  }
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j]
      if (normTexto(a.nome) !== normTexto(b.nome)) continue
      const sobrepoe = a.desde <= (b.ate ?? '9999-12') && b.desde <= (a.ate ?? '9999-12')
      if (!sobrepoe) continue
      // o valor da Equipe já traz o fixo do nível: um custo mensal com o nome da pessoa contaria o fixo duas vezes
      if (ehEquipe(a.tipo) !== ehEquipe(b.tipo)) return `${a.nome.trim()} já entra pela Equipe, com o fixo do nível. Tire o custo mensal com o nome dessa pessoa.`
      return `${a.nome.trim()} aparece duas vezes no mesmo período. Para mudar a partir de um mês, ponha o mês de fim no item antigo.`
    }
  }
  return null
}

// O item vale no mês M se desde <= M e (sem ate ou ate >= M)
export const emVigor = (c: CustoFixo, mes: string): boolean => {
  const m = mes7(mes)
  return c.desde <= m && (c.ate == null || c.ate >= m)
}

// Os custos de um mês ('AAAA-MM' ou 'AAAA-MM-01'). valorEquipe diz quanto a pessoa gerou no mês em Comissões
// (null = sem valor: a conta segue sem ela e a tela avisa).
export function custosDoMes(
  lista: CustoFixo[], mes: string, valorEquipe: (nome: string, tipo: 'equipe' | 'equipe-btg', mes: string) => number | null,
): CustosDoMes {
  const m = `${mes7(mes)}-01`
  const itens: ItemCustoMes[] = ordenar(lista.filter(c => emVigor(c, m))).map(c => ({
    nome: c.nome, tipo: c.tipo, valor: c.tipo === 'valor' ? c.valor : valorEquipe(c.nome, c.tipo, m),
  }))
  const mensais = round2(itens.filter(i => i.tipo === 'valor').reduce((s, i) => s + (i.valor ?? 0), 0))
  const equipe = round2(itens.filter(i => ehEquipe(i.tipo)).reduce((s, i) => s + (i.valor ?? 0), 0))
  return {
    mes: m, itens, mensais, equipe, total: round2(mensais + equipe), temCusto: itens.length > 0,
    equipeIncompleta: itens.some(i => ehEquipe(i.tipo) && i.valor == null),
  }
}

// Comissão líquida do escritório menos os custos do mês (pode ser negativo). Sem custo, a própria comissão líquida.
export function resultadoDepoisDosCustos(liquido: number, custos: CustosDoMes | null | undefined): number {
  return liquido - (custos?.temCusto ? custos.total : 0)
}

// ── Frases ───────────────────────────────────────────────────────────────────
const nomeDoMes = (mes: string) => MESES_LONGOS[parseInt(mes.slice(5, 7), 10) - 1] ?? mes.slice(0, 7)

export type DadosFraseCustos = {
  mes: string                       // 'AAAA-MM' ou 'AAAA-MM-01'
  parcial: boolean                  // mês em andamento
  liquido: number                   // comissão líquida do escritório no mês (até agora, no mês em andamento)
  custos: CustosDoMes | null
  previsto: number | null           // comissão líquida prevista para o fim do mês (só no mês em andamento)
  curta?: boolean                   // celular: vem logo depois de "No ritmo atual o mês fecha perto de…", sem repetir o começo
}

// A frase do Resumo sobre os custos. null quando o mês não tem custo.
export function fraseDosCustos(d: DadosFraseCustos): string | null {
  if (!d.custos?.temCusto) return null
  const custos = fmtBRL(d.custos.total)
  const mes = nomeDoMes(d.mes)
  if (d.parcial && d.previsto != null) {
    const r = resultadoDepoisDosCustos(d.previsto, d.custos)
    // no celular a frase continua a do fechamento previsto ("No ritmo atual o mês fecha perto de…"): só a conclusão
    if (d.curta) return r >= 0 ? `Depois de ${custos} de custos, sobram perto de ${fmtBRL(r)}.` : `Ainda faltam perto de ${fmtBRL(-r)} para cobrir os custos do mês.`
    // a equipe entra pelo que está em Comissões até hoje (ativações e bônus ainda crescem até o fim do mês)
    const aindaCresce = d.custos.itens.some(i => ehEquipe(i.tipo)) ? ' A equipe entra pelo valor de hoje e ainda cresce até o fim do mês.' : ''
    return r >= 0
      ? `No ritmo atual, depois de ${custos} de custos, sobram perto de ${fmtBRL(r)} no fim do mês.${aindaCresce}`
      : `No ritmo atual ainda faltam perto de ${fmtBRL(-r)} para cobrir os custos do mês.${aindaCresce}`
  }
  const r = resultadoDepoisDosCustos(d.liquido, d.custos)
  if (d.parcial) {
    return r >= 0
      ? `Até agora em ${mes}, depois de ${custos} de custos, sobram ${fmtBRL(r)} para dividir.`
      : `Até agora em ${mes} ainda faltam ${fmtBRL(-r)} para cobrir os custos do mês.`
  }
  return r >= 0
    ? `Em ${mes}, depois de ${custos} de custos, sobraram ${fmtBRL(r)} para dividir.`
    : `Em ${mes} os custos (${custos}) passaram da comissão líquida: faltaram ${fmtBRL(-r)}.`
}

export type MesCobertura = { mes: string; resultado: number | null; emAndamento: boolean }   // resultado null = mês sem custo

// A frase do Mês a mês: desde quando a comissão líquida cobre os custos. Meses do mais antigo ao mais novo;
// só contam os que têm custo (resultado não nulo). null quando nenhum mês tem custo.
export function fraseDaCobertura(meses: MesCobertura[]): string | null {
  const comCusto = meses.filter(m => m.resultado != null)
  if (!comCusto.length) return null
  const fechados = comCusto.filter(m => !m.emAndamento)
  if (!fechados.length) return `Os custos entram a partir de ${nomeDoMes(comCusto[0].mes)}, que ainda está em andamento.`
  const ultimo = fechados[fechados.length - 1]
  if ((ultimo.resultado ?? 0) < 0) return `Em ${nomeDoMes(ultimo.mes)}, faltaram ${fmtBRL(-(ultimo.resultado ?? 0))} para cobrir os custos.`
  let k = fechados.length - 1
  while (k > 0 && (fechados[k - 1].resultado ?? 0) >= 0) k--
  return `Desde ${nomeDoMes(fechados[k].mes)} a comissão líquida cobre os custos.`
}
