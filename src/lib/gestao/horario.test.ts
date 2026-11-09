import { describe, expect, it } from 'vitest'
import { ABERTURA, FECHAMENTO, HORAS, giroPorHorario, horaCurta, horaDaSubida, horaDoNome, type SubidaLotes } from './horario'

// created_at em UTC: Brasília = UTC − 3
const subida = (dia: string, nome: string, horaUtc: string, operados: number, diaSubida = dia): SubidaLotes =>
  ({ dia, nome_arquivo: nome, created_at: `${diaSubida}T${horaUtc}:00+00:00`, operados })

describe('horaDoNome', () => {
  it('lê a hora declarada no nome do arquivo', () => {
    expect(horaDoNome('Lotes 03-11-2026 parcial 14h.xlsx')).toBe(14)
    expect(horaDoNome('Lotes 28-10-2026 parcial 13h40.xlsx')).toBeCloseTo(13 + 40 / 60)
    expect(horaDoNome('Lotes 09-11-2026 (parcial 13h35).xlsx')).toBeCloseTo(13 + 35 / 60)
    expect(horaDoNome('MODELO_CONTRATOS_ATUALIZADO_BASE_CLIENTES_21-10-2026_18H59.xlsx')).toBeCloseTo(18 + 59 / 60)
  })
  it('ignora nomes sem hora', () => {
    expect(horaDoNome('Lotes 05-11-2026.xlsx')).toBeNull()
    expect(horaDoNome('Lotes 05-11-2026 parcial.xlsx')).toBeNull()
    expect(horaDoNome('123.xlsx')).toBeNull()
    expect(horaDoNome('hoje 2026.xlsx')).toBeNull()
  })
})

describe('horaDaSubida', () => {
  it('usa a hora da subida em Brasília quando o nome não diz', () => {
    expect(horaDaSubida(subida('2026-11-05', 'Lotes 05-11-2026 parcial.xlsx', '13:42', 2028))).toBeCloseTo(10.7)
  })
  it('planilha subida no dia seguinte é a final: conta até o fechamento', () => {
    expect(horaDaSubida(subida('2026-11-05', 'Lotes 05-11-2026.xlsx', '12:49', 10642, '2026-11-06'))).toBe(FECHAMENTO)
  })
  it('subida depois do pregão também fecha o dia; antes da abertura conta da abertura', () => {
    expect(horaDaSubida(subida('2026-11-05', 'Lotes 05-11-2026.xlsx', '22:12', 10642))).toBe(FECHAMENTO)
    expect(horaDaSubida(subida('2026-11-05', 'Lotes 05-11-2026.xlsx', '11:30', 0))).toBe(ABERTURA)
  })
  it('a hora do nome vale mesmo quando a subida foi mais tarde', () => {
    expect(horaDaSubida(subida('2026-11-05', 'Lotes 05-11-2026 parcial 12h20.xlsx', '19:00', 5732))).toBeCloseTo(12 + 20 / 60)
  })
})

describe('giroPorHorario', () => {
  it('distribui a diferença entre subidas pelas horas do intervalo', () => {
    const g = giroPorHorario([
      subida('2026-11-05', 'parcial 10h.xlsx', '13:05', 1000),          // 09:00 → 10:00: 1.000
      subida('2026-11-05', 'parcial 12h30.xlsx', '15:35', 2500),        // 10:00 → 12:30: 1.500 (600/h)
      subida('2026-11-05', 'Lotes 05-11-2026.xlsx', '12:00', 3000, '2026-11-06'), // 12:30 → 18:30: 500 (≈ 83,3/h)
    ])
    expect(g.dias).toHaveLength(1)
    const d = g.dias[0]
    expect(d.completo).toBe(true)
    expect(d.subidas).toBe(3)
    expect(d.total).toBeCloseTo(3000)
    const h = (hora: number) => d.horas[HORAS.indexOf(hora)]
    expect(h(9)).toBeCloseTo(1000)
    expect(h(10)).toBeCloseTo(600)
    expect(h(11)).toBeCloseTo(600)
    expect(h(12)).toBeCloseTo(300 + 500 / 12)          // meia hora da 2ª subida + meia hora da final
    expect(h(13)).toBeCloseTo(500 / 6)
    expect(h(18)).toBeCloseTo(500 / 12)                // 18h → 18h30 é meia hora
    expect(g.totais[HORAS.indexOf(9)]).toBeCloseTo(1000)
    expect(g.total).toBeCloseTo(3000)
    expect(g.diasCompletos).toBe(1)
  })

  it('dia sem subida parcial não entra: só a planilha final, ou uma subida única perto do fechamento', () => {
    const g = giroPorHorario([
      subida('2026-10-15', 'CONTRATOS_15-10-2026.xlsx', '00:58', 3607, '2026-10-16'),
      subida('2026-10-15', 'CONTRATOS_15-10-2026.xlsx', '01:11', 3083, '2026-10-16'),
      subida('2026-10-16', 'MODELO_CONTRATOS_16-10-2026.xlsx', '21:14', 1802),   // 18h14 em Brasília
      subida('2026-10-21', 'MODELO_CONTRATOS_21-10-2026_18H59.xlsx', '22:49', 5426),
    ])
    expect(g.dias).toHaveLength(0)
    expect(g.diasSemParcial).toBe(3)
  })

  it('subida depois das 17h30 ainda entra na conta quando o dia já tem parcial', () => {
    const g = giroPorHorario([
      subida('2026-11-04', 'Lotes 04-11-2026 parcial 15h45.xlsx', '18:53', 9118),
      subida('2026-11-04', 'Lotes 04-11-2026 parcial 17h40.xlsx', '20:49', 9674),
      subida('2026-11-04', 'Lotes 04-11-2026.xlsx', '22:49', 9725),
    ])
    const d = g.dias[0]
    expect(d.subidas).toBe(3)
    expect(d.completo).toBe(true)
    expect(d.horas[HORAS.indexOf(17)]).toBeCloseTo(556 * (40 / 60) / (115 / 60) + 51 * (20 / 60) / (50 / 60))  // 15h45→17h40 e 17h40→18h30
    expect(d.horas[HORAS.indexOf(18)]).toBeCloseTo(51 * (30 / 60) / (50 / 60))
  })

  it('dia sem a planilha final fica incompleto e fora dos totais', () => {
    const g = giroPorHorario([
      subida('2026-11-09', 'Lotes 09-11-2026 parcial.xlsx', '13:59', 2063),
      subida('2026-11-09', 'Lotes 09-11-2026 (parcial 13h35).xlsx', '17:40', 5269),
    ])
    const d = g.dias[0]
    expect(d.completo).toBe(false)
    expect(d.ate).toBeCloseTo(13 + 35 / 60)
    expect(d.total).toBeCloseTo(5269)
    expect(d.horas[HORAS.indexOf(14)]).toBe(0)
    expect(g.diasCompletos).toBe(0)
    expect(g.total).toBe(0)
  })

  it('subida com menos lotes que a anterior não desconta (reimportação)', () => {
    const g = giroPorHorario([
      subida('2026-10-29', 'parcial.xlsx', '14:40', 2287),
      subida('2026-10-29', 'parcial 18h.xlsx', '21:12', 5403),
      subida('2026-10-29', 'parcial 18h.xlsx', '21:50', 5403),
      subida('2026-10-29', '123.xlsx', '21:52', 5424),
      subida('2026-10-29', 'corrigido.xlsx', '23:00', 5300),
    ])
    const d = g.dias[0]
    expect(d.subidas).toBe(5)
    expect(d.total).toBeCloseTo(5424)
    expect(d.horas[HORAS.indexOf(18)]).toBeCloseTo(21)   // 18h → 18h30 só recebe o que entrou depois das 18h
    expect(d.completo).toBe(true)
  })

  it('ordena os dias do mais recente para o mais antigo', () => {
    const g = giroPorHorario([
      subida('2026-11-04', 'parcial 12h.xlsx', '14:57', 4432), subida('2026-11-04', 'Lotes 04-11-2026.xlsx', '22:49', 9725),
      subida('2026-11-05', 'parcial 12h20.xlsx', '15:22', 5732), subida('2026-11-05', 'Lotes 05-11-2026.xlsx', '12:49', 10642, '2026-11-06'),
    ])
    expect(g.dias.map(d => d.dia)).toEqual(['2026-11-05', '2026-11-04'])
    expect(g.totais.reduce((a, v) => a + v, 0)).toBeCloseTo(9725 + 10642)
  })
})

describe('horaCurta', () => {
  it('formata hora decimal', () => {
    expect(horaCurta(14)).toBe('14h')
    expect(horaCurta(13 + 35 / 60)).toBe('13h35')
    expect(horaCurta(FECHAMENTO)).toBe('18h30')
  })
})
