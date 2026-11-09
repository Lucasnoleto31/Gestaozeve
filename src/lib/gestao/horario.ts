// Giro por horário a partir das subidas da planilha de lotes (S58).
//
// A planilha de lotes do BTG traz os lotes somados por dia, sem hora. Mas a equipe sobe a planilha
// mais de uma vez por dia ("Lotes 05-11-2026 parcial 12h20.xlsx") e cada subida fica registrada em
// `importacoes` com o total de lotes operados que o arquivo trazia até aquela hora. A diferença entre
// duas subidas é o giro do intervalo, distribuído pelas horas que ele cobre, proporcional ao tempo.
// A primeira subida conta desde a abertura; a planilha final (subida depois do pregão ou no dia
// seguinte) conta até o fechamento. Só entra o dia que teve subida parcial (até as 17h30: a planilha
// do fim do dia subida às 18h14 não diz nada sobre o horário); enquanto não vem a planilha final o dia
// fica incompleto: as horas depois da última subida ficam em aberto.
// Sem hooks nem banco: a consulta fica em consultas.ts (subidasDeLotes).

export const ABERTURA = 9           // pregão do mini-índice e mini-dólar: 09:00
export const FECHAMENTO = 18.5      // até 18:30, inclui o after das 18h
export const LIMITE_PARCIAL = 17.5  // subida até 17:30 conta como parcial e faz o dia entrar
export const HORAS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

export type SubidaLotes = { dia: string; nome_arquivo: string; created_at: string; operados: number }

export type GiroHoraDia = {
  dia: string
  horas: number[]     // lotes por hora (índice de HORAS); hora ainda em aberto fica 0
  total: number
  subidas: number     // subidas consideradas no dia
  completo: boolean   // já tem a planilha final (ou uma subida depois do fechamento)
  ate: number         // hora (decimal) da última subida; FECHAMENTO quando completo
}

export type GiroHorario = {
  dias: GiroHoraDia[]      // mais recente primeiro
  totais: number[]         // soma por hora dos dias completos
  total: number
  diasCompletos: number
  diasSemParcial: number   // dias com subida mas nenhuma até LIMITE_PARCIAL (não entram)
}

const FMT_BR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

// Data e hora da subida em Brasília: 'YYYY-MM-DD' e hora decimal
function momentoBrasil(iso: string): { dia: string; hora: number } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = Object.fromEntries(FMT_BR.formatToParts(d).map(x => [x.type, x.value]))
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) + Number(p.minute) / 60 }
}

// Hora que o nome do arquivo declara ("parcial 14h", "13h40", "(parcial 13h35)", "18H59"), ou null
export function horaDoNome(nome: string): number | null {
  const m = /(?:^|[^\d])(\d{1,2})\s*h\s*(\d{2})?(?![\dA-Za-z])/i.exec(nome)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2] ?? 0)
  if (h > 23 || min > 59) return null
  return h + min / 60
}

const limitar = (h: number) => Math.max(ABERTURA, Math.min(FECHAMENTO, h))

// Hora da subida dentro do pregão (decimal, entre ABERTURA e FECHAMENTO): a do nome do arquivo quando
// ele diz; senão a hora da subida, se foi no mesmo dia; subida em outro dia é a planilha final.
export function horaDaSubida(s: SubidaLotes): number {
  const doNome = horaDoNome(s.nome_arquivo)
  if (doNome != null) return limitar(doNome)
  const m = momentoBrasil(s.created_at)
  if (!m) return FECHAMENTO
  if (m.dia > s.dia) return FECHAMENTO
  if (m.dia < s.dia) return ABERTURA
  return limitar(m.hora)
}

const indiceHora = (h: number) => Math.max(0, Math.min(HORAS.length - 1, Math.floor(h) - ABERTURA))

// Distribui `lotes` do intervalo [a, b] pelas horas, proporcional ao tempo coberto em cada uma
function distribuir(horas: number[], lotes: number, a: number, b: number) {
  if (b - a <= 1e-9) { horas[indiceHora(Math.min(a, FECHAMENTO - 1e-9))] += lotes; return }
  for (let i = 0; i < HORAS.length; i++) {
    const h0 = HORAS[i], h1 = Math.min(h0 + 1, FECHAMENTO)
    const cobre = Math.min(b, h1) - Math.max(a, h0)
    if (cobre > 0) horas[i] += (lotes * cobre) / (b - a)
  }
}

export function giroPorHorario(subidas: SubidaLotes[]): GiroHorario {
  const porDia = new Map<string, { s: SubidaLotes; t: number }[]>()
  for (const s of subidas) {
    const lista = porDia.get(s.dia) ?? []
    lista.push({ s, t: horaDaSubida(s) })
    porDia.set(s.dia, lista)
  }
  const dias: GiroHoraDia[] = []
  let diasSemParcial = 0
  for (const [dia, lista] of porDia) {
    if (!lista.some(x => x.t > ABERTURA && x.t <= LIMITE_PARCIAL)) { diasSemParcial++; continue }
    lista.sort((x, y) => x.t - y.t || x.s.created_at.localeCompare(y.s.created_at))
    const horas = HORAS.map(() => 0)
    let tAnterior = ABERTURA, vAnterior = 0
    for (const { s, t } of lista) {
      const delta = s.operados - vAnterior
      if (delta > 0) distribuir(horas, delta, tAnterior, t)
      tAnterior = Math.max(tAnterior, t)
      vAnterior = Math.max(vAnterior, s.operados)
    }
    const completo = tAnterior >= FECHAMENTO
    dias.push({ dia, horas, total: horas.reduce((a, v) => a + v, 0), subidas: lista.length, completo, ate: tAnterior })
  }
  dias.sort((a, b) => b.dia.localeCompare(a.dia))
  const completos = dias.filter(d => d.completo)
  const totais = HORAS.map((_, i) => completos.reduce((a, d) => a + d.horas[i], 0))
  return { dias, totais, total: totais.reduce((a, v) => a + v, 0), diasCompletos: completos.length, diasSemParcial }
}

// '14h' / '13h40' para mostrar a hora decimal
export function horaCurta(h: number): string {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60)
  return mm ? `${hh}h${String(mm).padStart(2, '0')}` : `${hh}h`
}
