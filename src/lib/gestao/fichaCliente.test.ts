import { describe, expect, it } from 'vitest'
import { diasOperadosNoMes, fatias, giroPorDia, proximoAniversario, proximoPasso, quando, type AtendimentoDoPasso, type ClienteDoPasso } from './fichaCliente'
import type { ExtratoRow } from './tipos'

const HOJE = '2026-11-10'
const cli = (p: Partial<ClienteDoPasso> = {}): ClienteDoPasso => ({
  situacao: 'Ativo', risco: null, dias_sem_giro: 0, meses_sem_giro: null, ultimo_giro: '2026-11-10', lotes_mes: 4615, lotes_media_3m: 3610, lotes_12m: 8225,
  receita_total: 5337.8, meses_ativos: 2, data_entrada: '2026-10-15', data_migracao: '2026-10-19', motivo_recusa: null, ...p,
})
const at = (p: Partial<AtendimentoDoPasso> = {}): AtendimentoDoPasso => ({ hoje: HOJE, mes: 'nov/26', contatos: 0, ultimoContato: null, proximoContato: null, ...p })

describe('proximoPasso', () => {
  it('ativo sem risco: operando normalmente, com o mês contra a média', () => {
    expect(proximoPasso(cli(), at())).toEqual({ tom: 'gain', titulo: 'Operando normalmente', texto: '4.615 lotes em nov/26, contra a média de 3.610 por mês nos 3 meses anteriores.' })
    // mês em andamento: "até agora", sem comparar de igual para igual
    expect(proximoPasso(cli(), at({ mesParcial: true })).texto).toBe('4.615 lotes em nov/26 até agora; a média dos 3 meses anteriores foi de 3.610 por mês.')
    expect(proximoPasso(cli({ risco: 'em queda', lotes_mes: 416, lotes_media_3m: 3519 }), at({ mesParcial: true })).texto).toBe('416 lotes em nov/26 até agora, contra a média de 3.519 por mês nos 3 meses anteriores. Ainda sem contato registrado.')
    expect(proximoPasso(cli({ lotes_media_3m: 0 }), at()).texto).toBe('4.615 lotes em nov/26 (ainda sem média dos meses anteriores).')
  })

  it('parou: quantos dias, quanto girava e o último giro', () => {
    const p = proximoPasso(cli({ situacao: 'Inativo', risco: 'parou', dias_sem_giro: 13, ultimo_giro: '2026-10-28', lotes_mes: 0, lotes_media_3m: 3978 }), at({ contatos: 2, ultimoContato: '2026-10-29' }))
    expect(p).toEqual({ tom: 'loss', titulo: 'Parou há 13 dias', texto: 'Girava em média 3.978 lotes por mês nos 3 meses anteriores; o último giro foi em 28/10/26. 2 contatos registrados, o último em 29/10/26.' })
  })

  it('em queda: o mês contra a média', () => {
    const p = proximoPasso(cli({ risco: 'em queda', lotes_mes: 416, lotes_media_3m: 3519 }), at())
    expect(p.tom).toBe('warn')
    expect(p.titulo).toBe('Girando bem menos que o normal')
    expect(p.texto).toBe('416 lotes em nov/26 contra a média de 3.519 por mês nos 3 meses anteriores. Ainda sem contato registrado.')
  })

  it('inativo sem risco: há quantos meses e quanto rendia', () => {
    const p = proximoPasso(cli({ situacao: 'Inativo', meses_sem_giro: 5, ultimo_giro: '2026-06-12', receita_total: 9000, meses_ativos: 10 }), at({ contatos: 1, ultimoContato: '2026-11-03' }))
    expect(p).toEqual({ tom: 'warn', titulo: 'Sem giro há 5 meses', texto: 'Rendia R$ 900 por mês nos 10 meses em que girou; o último giro foi em 12/06/26. 1 contato registrado, o último em 03/11/26.' })
    expect(proximoPasso(cli({ situacao: 'Inativo', meses_sem_giro: 1, ultimo_giro: null, receita_total: 0, meses_ativos: 0 }), at()).texto).toBe('Já girou e parou. Ainda sem contato registrado.')
  })

  it('migrado que nunca girou: há quantos dias migrou', () => {
    const p = proximoPasso(cli({ situacao: 'Nunca girou', ultimo_giro: null, data_migracao: '2026-10-21' }), at())
    expect(p).toEqual({ tom: 'warn', titulo: 'Migrou há 20 dias e ainda não operou', texto: 'Falar com o cliente para a primeira operação. Ainda sem contato registrado.' })
    expect(proximoPasso(cli({ situacao: 'Nunca girou', data_migracao: null }), at()).titulo).toBe('Migrou e ainda não operou')
  })

  it('conta em abertura: avisa depois de uma semana e quando já gira', () => {
    expect(proximoPasso(cli({ situacao: 'Em processamento', data_entrada: '2026-11-07', lotes_12m: 0 }), at())).toEqual({ tom: 'neutral', titulo: 'Conta em abertura há 3 dias', texto: 'Acompanhar a abertura até a migração. Ainda sem contato registrado.' })
    const velha = proximoPasso(cli({ situacao: 'Em processamento', data_entrada: '2026-10-20', lotes_12m: 500 }), at())
    expect(velha.tom).toBe('warn')
    expect(velha.titulo).toBe('Conta em abertura há 21 dias')
    expect(velha.texto).toBe('Já gira com a conta em abertura (500 lotes em 12 meses): falta migrar a conta. Ainda sem contato registrado.')
    expect(proximoPasso(cli({ situacao: 'Em processamento', data_entrada: null, lotes_12m: 0 }), at()).titulo).toBe('Conta em abertura')
  })

  it('recusou: mostra o motivo', () => {
    expect(proximoPasso(cli({ situacao: 'Recusou', motivo_recusa: 'prefere ficar na Genial' }), at())).toEqual({ tom: 'neutral', titulo: 'Recusou a migração', texto: 'Motivo: prefere ficar na Genial.' })
    expect(proximoPasso(cli({ situacao: 'Recusou' }), at()).texto).toBe('Sem motivo registrado na ficha.')
  })

  it('retorno combinado vencido ou para hoje vem na frente do estado', () => {
    const hoje = proximoPasso(cli(), at({ proximoContato: HOJE }))
    expect(hoje.tom).toBe('warn')
    expect(hoje.titulo).toBe('Retorno combinado para hoje')
    expect(hoje.texto).toBe('Ficou combinado falar com o cliente em 10/11/26. Operando normalmente: 4.615 lotes em nov/26, contra a média de 3.610 por mês nos 3 meses anteriores.')
    expect(proximoPasso(cli(), at({ proximoContato: '2026-11-05' })).titulo).toBe('Retorno atrasado há 5 dias')
    expect(proximoPasso(cli(), at({ proximoContato: '2026-11-09' })).titulo).toBe('Retorno atrasado há 1 dia')
  })

  it('retorno futuro entra no fim do texto, sem mudar o estado', () => {
    const p = proximoPasso(cli({ situacao: 'Nunca girou', data_migracao: '2026-11-08' }), at({ contatos: 1, ultimoContato: '2026-11-09', proximoContato: '2026-11-12' }))
    expect(p.titulo).toBe('Migrou há 2 dias e ainda não operou')
    expect(p.texto).toBe('Falar com o cliente para a primeira operação. 1 contato registrado, o último em 09/11/26. Retorno marcado para 12/11/26.')
  })
})

describe('quando', () => {
  it('diz há quanto tempo foi ou em quanto tempo será', () => {
    expect(quando('2026-11-10', HOJE)).toBe('hoje')
    expect(quando('2026-11-09', HOJE)).toBe('ontem')
    expect(quando('2026-10-29', HOJE)).toBe('há 12 dias')
    expect(quando('2026-11-11', HOJE)).toBe('amanhã')
    expect(quando('2026-11-13', HOJE)).toBe('em 3 dias')
    expect(quando('2026-11-09T22:10:00+00:00', HOJE)).toBe('ontem')
    expect(quando(null, HOJE)).toBeNull()
  })
})

const lanc = (data: string, lotes: number, p: Partial<ExtratoRow> = {}): ExtratoRow => ({
  id: `${data}-${lotes}-${p.ativo ?? ''}-${p.lotes_zerados ?? 0}`, data, conta: '001', ativo: 'WINZ26', produto: null, plataforma: 'NELOGICA', modo: 'DAYTRADE',
  lotes_operados: lotes, lotes_zerados: 0, tarifa: 0.07, zeragem_rs: 0, receita_corretagem: lotes * 0.07, receita_zeragem: 0, pontos: 0, nome_cliente: null, ...p,
})

describe('giroPorDia', () => {
  const extrato = [
    lanc('2026-11-05', 880), lanc('2026-11-05', 2, { ativo: 'WDOZ26' }), lanc('2026-11-05', 0, { lotes_zerados: 10, receita_corretagem: 0, receita_zeragem: 160 }),
    lanc('2026-11-04', 721), lanc('2026-10-30', 616),
  ]

  it('soma os lançamentos de cada dia, do mais recente para o mais antigo', () => {
    const g = giroPorDia(extrato)
    expect(g.completo).toBe(true)
    expect(g.dias.map(d => d.dia)).toEqual(['2026-11-05', '2026-11-04', '2026-10-30'])
    expect(g.dias[0]).toMatchObject({ lotes: 882, zerados: 10, operacoes: 3, ativos: ['WINZ26', 'WDOZ26'] })
    expect(g.dias[0].receita).toBeCloseTo(880 * 0.07 + 2 * 0.07 + 160, 6)
  })

  it('extrato no teto: o dia mais antigo pode estar cortado e sai da lista', () => {
    const g = giroPorDia(extrato, 5)
    expect(g.completo).toBe(false)
    expect(g.dias.map(d => d.dia)).toEqual(['2026-11-05', '2026-11-04'])
  })

  it('dias operados no mês: só quando o extrato cobre o mês inteiro', () => {
    expect(diasOperadosNoMes(giroPorDia(extrato), '2026-11-01')).toEqual({ operados: 2, mediaPorDia: 801.5, lotes: 1603 })
    expect(diasOperadosNoMes(giroPorDia(extrato), '2026-09-01')).toEqual({ operados: 0, mediaPorDia: 0, lotes: 0 })
    // cortado dentro de novembro: não dá para contar novembro
    expect(diasOperadosNoMes(giroPorDia(extrato, 5), '2026-11-01')).toBeNull()
    // cortado em outubro: novembro está inteiro, outubro não
    const cortadoEmOutubro = giroPorDia([...extrato, lanc('2026-10-29', 300)], 6)
    expect(cortadoEmOutubro.dias.map(d => d.dia)).toEqual(['2026-11-05', '2026-11-04', '2026-10-30'])
    expect(diasOperadosNoMes(cortadoEmOutubro, '2026-11-01')).toMatchObject({ operados: 2 })
    expect(diasOperadosNoMes(cortadoEmOutubro, '2026-10-01')).toBeNull()
    expect(diasOperadosNoMes(giroPorDia([]), '2026-11-01')).toEqual({ operados: 0, mediaPorDia: 0, lotes: 0 })
  })
})

describe('fatias', () => {
  it('reparte os lotes por plataforma e por modo, do maior para o menor', () => {
    const extrato = [lanc('a', 600), lanc('b', 300, { plataforma: 'METATRADER' }), lanc('c', 0, { lotes_zerados: 100, modo: 'DAYTRADE/ZERAGEM', plataforma: null }), lanc('d', 0)]
    expect(fatias(extrato, 'plataforma')).toEqual([{ nome: 'NELOGICA', lotes: 600, pct: 60 }, { nome: 'METATRADER', lotes: 300, pct: 30 }, { nome: 'não informado', lotes: 100, pct: 10 }])
    expect(fatias(extrato, 'modo').map(f => [f.nome, f.pct])).toEqual([['DAYTRADE', 90], ['DAYTRADE/ZERAGEM', 10]])
    expect(fatias([], 'modo')).toEqual([])
  })
})

describe('proximoAniversario', () => {
  it('conta os dias até o próximo e a idade que completa', () => {
    expect(proximoAniversario('1990-11-13', HOJE)).toEqual({ emDias: 3, data: '13/11', idade: 36 })
    expect(proximoAniversario('1990-11-10', HOJE)).toEqual({ emDias: 0, data: '10/11', idade: 36 })
    // já passou neste ano: vale o do ano que vem
    expect(proximoAniversario('1985-03-02', HOJE)).toEqual({ emDias: 112, data: '02/03', idade: 42 })
  })

  it('29 de fevereiro comemora em 28/02 nos anos comuns', () => {
    expect(proximoAniversario('1992-02-29', '2027-02-20')).toEqual({ emDias: 8, data: '28/02', idade: 35 })
    expect(proximoAniversario('1992-02-29', '2028-02-20')).toEqual({ emDias: 9, data: '29/02', idade: 36 })
  })

  it('data vazia, inválida ou no futuro devolve null', () => {
    expect(proximoAniversario(null, HOJE)).toBeNull()
    expect(proximoAniversario('13/11/1990', HOJE)).toBeNull()
    expect(proximoAniversario('2030-01-01', HOJE)).toBeNull()
  })
})
