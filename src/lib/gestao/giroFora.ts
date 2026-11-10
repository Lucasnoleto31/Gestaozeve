// Giro em outra corretora: o cliente (um cadastro por CPF/CNPJ) que tem lotes em outra corretora do
// escritório. Quem nunca girou aqui e gira lá já opera, só não trouxe o giro; quem ficou inativo aqui
// e gira lá não foi perdido. Só funções puras (testes em giroFora.test.ts); quem lê o banco é
// consultasGiroFora.ts, a partir dos lotes por cliente e mês (painel_clientes_mensal).
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'
import { fmtNum } from '@/lib/format'
import { mesCurto } from './meses'

export type GiroFora = {
  corretora: Corretora
  mes: string            // mês de referência daquela corretora ('AAAA-MM-01')
  lotesMes: number       // lotes do cliente lá nesse mês (0 = não girou no mês, mas girou há pouco)
  lotesJanela: number    // lotes lá nos meses lidos (3)
  ultimoMes: string      // último mês com lotes lá
}
export type LotesClienteMes = { cliente_id: string; mes_ref: string; lotes: number }

// Uma corretora: junta as linhas (cliente × mês) num resumo por cliente. O mês de referência dela é o
// mais recente que aparece nas linhas.
export function resumirGiroFora(corretora: Corretora, linhas: LotesClienteMes[]): Map<string, GiroFora> {
  const out = new Map<string, GiroFora>()
  let mes = ''
  for (const l of linhas) if (l.lotes > 0 && l.mes_ref > mes) mes = l.mes_ref
  for (const l of linhas) {
    if (!(l.lotes > 0)) continue
    let g = out.get(l.cliente_id)
    if (!g) { g = { corretora, mes, lotesMes: 0, lotesJanela: 0, ultimoMes: l.mes_ref }; out.set(l.cliente_id, g) }
    g.lotesJanela += l.lotes
    if (l.mes_ref === mes) g.lotesMes += l.lotes
    if (l.mes_ref > g.ultimoMes) g.ultimoMes = l.mes_ref
  }
  return out
}

// Várias corretoras: para cada cliente fica a corretora em que ele mais gira no mês (empate: na janela)
export function juntarGiroFora(mapas: Map<string, GiroFora>[]): Map<string, GiroFora> {
  const out = new Map<string, GiroFora>()
  for (const m of mapas) {
    for (const [id, g] of m) {
      const atual = out.get(id)
      if (!atual || g.lotesMes > atual.lotesMes || (g.lotesMes === atual.lotesMes && g.lotesJanela > atual.lotesJanela)) out.set(id, g)
    }
  }
  return out
}

// Gira lá agora (no mês de referência de lá)?
export const giraFora = (g: GiroFora | null | undefined): g is GiroFora => !!g && g.lotesMes > 0

// "gira na Genial (9.316 lotes em nov/26)" ou, sem giro no mês, "girou na Genial em out/26"
export function textoGiroFora(g: GiroFora): string {
  const onde = CORRETORA_LABEL[g.corretora]
  return g.lotesMes > 0 ? `gira na ${onde} (${fmtNum(Math.round(g.lotesMes))} lotes em ${mesCurto(g.mes)})` : `girou na ${onde} em ${mesCurto(g.ultimoMes)}`
}

// Para a célula de tabela: "Genial · 9.316" (lotes no mês de lá) ou "Genial · out/26" (último mês com giro)
export function rotuloGiroFora(g: GiroFora): string {
  return `${CORRETORA_LABEL[g.corretora]} · ${g.lotesMes > 0 ? fmtNum(Math.round(g.lotesMes)) : mesCurto(g.ultimoMes)}`
}
