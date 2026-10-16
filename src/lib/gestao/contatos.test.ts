import { describe, expect, it } from 'vitest'
import { diarioPelaLista, fmtMedia, mediaContatos, rotuloDia, somaUltimos, ultimosDias } from './contatos'

describe('mediaContatos', () => {
  it('ignora quem não tem contato registrado', () => {
    expect(mediaContatos([{ contatos: 0 }, { contatos: 3 }, { contatos: 5 }])).toEqual({ media: 4, n: 2 })
  })
  it('sem contatos devolve null', () => {
    expect(mediaContatos([{ contatos: 0 }])).toEqual({ media: null, n: 0 })
    expect(mediaContatos([])).toEqual({ media: null, n: 0 })
  })
  it('formata com uma casa', () => {
    expect(fmtMedia(3.25)).toBe('3,3')
    expect(fmtMedia(null)).toBeNull()
  })
})

describe('ultimosDias e rotuloDia', () => {
  it('lista os dias até hoje, do mais antigo ao mais recente', () => {
    expect(ultimosDias('2026-10-16', 3)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
  })
  it('rotula hoje, ontem e o dia da semana', () => {
    expect(rotuloDia('2026-10-16', '2026-10-16')).toBe('hoje')
    expect(rotuloDia('2026-10-15', '2026-10-16')).toBe('ontem')
    expect(rotuloDia('2026-10-14', '2026-10-16')).toBe('qua 14/10')   // 14/10/2026 é quarta-feira
  })
})

describe('diarioPelaLista', () => {
  const leads = [
    { data_hora: '2026-10-16T01:30:00+00:00', status: 'Novo', data_fechamento: null },          // 15/10 22:30 em Brasília
    { data_hora: '2026-10-16T12:00:00+00:00', status: 'Ganho', data_fechamento: '2026-10-16' },
    { data_hora: '2026-10-10T12:00:00+00:00', status: 'Ganho', data_fechamento: '2026-10-16' },
    { data_hora: '2026-10-01T12:00:00+00:00', status: 'Perdido', data_fechamento: '2026-10-15' },
    { data_hora: '2026-09-01T12:00:00+00:00', status: 'Ganho', data_fechamento: '2026-09-20' },  // fora da janela
  ]
  it('agrupa entradas pelo dia de Brasília e fechamentos pela data', () => {
    const s = diarioPelaLista(leads, '2026-10-16', 3)
    expect(s.map(d => d.dia)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16'])
    expect(s[1]).toEqual({ dia: '2026-10-15', entraram: 1, contatos: 0, ganhos: 0, perdidos: 1, contas_abertas: 0 })
    expect(s[2]).toEqual({ dia: '2026-10-16', entraram: 1, contatos: 0, ganhos: 2, perdidos: 0, contas_abertas: 0 })
    expect(somaUltimos(s, 7, 'ganhos')).toBe(2)
    expect(somaUltimos(s, 1, 'entraram')).toBe(1)
  })
})
