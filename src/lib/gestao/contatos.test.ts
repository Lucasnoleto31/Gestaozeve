import { describe, expect, it } from 'vitest'
import { diarioPelaLista, fmtMedia, mediaContatos, resumoContatosPorAtendente, rotuloDia, somaUltimos, ultimosDias } from './contatos'

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

describe('resumoContatosPorAtendente', () => {
  const leads = [
    { id: 'a', responsavel: 'Artur', status: 'Ganho' },
    { id: 'b', responsavel: 'Artur', status: 'Em contato' },
    { id: 'c', responsavel: 'Lucas', status: 'Ganho' },
    { id: 'd', responsavel: null, status: 'Perdido' },
  ]
  const contatos = [
    { lead_id: 'a', data: '2026-09-28' },   // antes do período: conta só no "até ganhar"
    { lead_id: 'a', data: '2026-10-02' }, { lead_id: 'a', data: '2026-10-05' },
    { lead_id: 'b', data: '2026-10-05' },
    { lead_id: 'c', data: '2026-10-10' },
    { lead_id: 'd', data: '2026-10-10' },
    { lead_id: 'c', data: '2026-11-01' },   // depois do período
    { lead_id: 'zz', data: '2026-10-11' },  // lead que não existe mais
  ]
  it('agrupa pelo responsável do lead, no período, com total de leads e dias distintos', () => {
    const { linhas, total } = resumoContatosPorAtendente(contatos, leads, '2026-10-01', '2026-11-01')
    expect(linhas.map(l => l.grupo)).toEqual(['Artur', 'Lucas', 'Sem responsável'])
    expect(linhas[0]).toEqual({ grupo: 'Artur', contatos: 3, leads: 2, dias: 2, ganhos: 1, contatos_ganhos: 3 })
    expect(linhas[1]).toEqual({ grupo: 'Lucas', contatos: 1, leads: 1, dias: 1, ganhos: 1, contatos_ganhos: 2 })
    expect(linhas[2]).toEqual({ grupo: 'Sem responsável', contatos: 1, leads: 1, dias: 1, ganhos: 0, contatos_ganhos: 0 })
    expect(total).toEqual({ grupo: 'Total', contatos: 5, leads: 4, dias: 3, ganhos: 2, contatos_ganhos: 5 })
  })
  it('sem contatos no período devolve vazio', () => {
    const { linhas, total } = resumoContatosPorAtendente(contatos, leads, '2026-12-01', '2027-01-01')
    expect(linhas).toEqual([])
    expect(total.contatos).toBe(0)
  })
})
