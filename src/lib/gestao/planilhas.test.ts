import { describe, expect, it } from 'vitest'
import { dataBR, dataHoraBR, lerClientes, lerLeads, lerLotes, numeroBR, resumoLotes } from './planilhas'

describe('numeroBR / dataBR', () => {
  it('lê números em formato brasileiro e americano', () => {
    expect(numeroBR('1.234,56')).toBe(1234.56)
    expect(numeroBR('1,234.56')).toBe(1234.56)
    expect(numeroBR('1.234')).toBe(1234)
    expect(numeroBR('10.5')).toBe(10.5)
    expect(numeroBR('R$ 0,25')).toBe(0.25)
    expect(numeroBR('')).toBe(0)
  })
  it('lê datas em serial do Excel, dd/mm/aaaa e ISO', () => {
    expect(dataBR(45000)).toBe('2023-03-15')
    expect(dataBR('17/09/2026')).toBe('2026-09-17')
    expect(dataBR('5/1/26')).toBe('2026-01-05')
    expect(dataBR('2026-09-17 10:30:00')).toBe('2026-09-17')
    expect(dataBR('abc')).toBe('')
  })
  it('lê data e hora do formulário', () => {
    expect(dataHoraBR('17/09/2026 14:05:33')).toBe('2026-09-17T14:05:33-03:00')
    expect(dataHoraBR('01/10/26 09:28')).toBe('2026-10-01T09:28:00-03:00')
    expect(dataHoraBR('17/09/2026')).toBe('2026-09-17T00:00:00-03:00')
  })
})

describe('lerLotes', () => {
  it('lê o export de 9 colunas (Sinacor…)', () => {
    const r = lerLotes([
      ['Sinacor', 'ID Assessor', 'Assessor', 'Filial', 'Ativo', 'Data', 'Qtd. Contratos', 'Plataforma', 'Modo'],
      ['123456', '77', 'ZEVE INVESTIMENTOS 1', '1', 'winv26', '17/09/2026', '1.250', 'nelogica', 'DMA'],
      ['123456', '77', 'ZEVE INVESTIMENTOS 1', '1', 'WDOV26', 45000, 10, '', 'MESA/ZERAGEM'],
      [null, null, null, null, null, null, null, null, null],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({ conta: '123456', ativo: 'WINV26', data: '2026-09-17', qtd: 1250, plataforma: 'NELOGICA', modo: 'DMA' })
    expect(r.linhas[1]).toMatchObject({ ativo: 'WDOV26', data: '2023-03-15', qtd: 10, modo: 'MESA/ZERAGEM' })
    expect(r.faltando).toEqual([])
    const s = resumoLotes(r.linhas)
    expect(s).toMatchObject({ linhas: 2, operados: 1250, zerados: 10, contas: 1, dataMin: '2023-03-15', dataMax: '2026-09-17', repetidas: 0 })
  })
  it('lê o export de 13 colunas (ID_CLIENTE … NOME_CLIENTE)', () => {
    const r = lerLotes([
      ['Lotes girados · controle'],
      [],
      ['ID_CLIENTE', 'CD_CONTA_COM_DIGITO', 'TP_PESSOA', 'SUPER_PNP', 'ID_ASSESSOR_HISTORICO', 'ID_FILIAL_HISTORICO', 'DATA_CONTRATO', 'ATIVO', 'MODO', 'QTD_CONTRATOS', 'PLATAFORMA', 'NOME_ASSESSOR_HISTORICO', 'NOME_CLIENTE'],
      ['1334420', '9682542', 'F', '', '14253', 'ZEVE AI LTDA', '01/10/2026', 'WINV26', 'DMA', 4, 'NELOGICA_DT', 'LUCAS GOMES NOLETO LOPES', 'ALAN QUEIROZ DA SILVA'],
      ['3585906', '48153880', 'PF', '4349596', '15167', '1318', '02/10/2026', 'WINV26', 'MESA/ZERAGEM', 5, 'NELOGICA_DT', 'ZEVE INVESTIMENTOS 9', 'LAIS DO NASCIMENTO COSTA'],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({
      id_cliente: '1334420', conta: '9682542', tipo_pessoa: 'F', id_assessor: '14253', filial: 'ZEVE AI LTDA',
      data: '2026-10-01', ativo: 'WINV26', modo: 'DMA', qtd: 4, plataforma: 'NELOGICA_DT',
      assessor: 'LUCAS GOMES NOLETO LOPES', nome_cliente: 'ALAN QUEIROZ DA SILVA',
    })
    expect(r.linhas[1].modo).toBe('MESA/ZERAGEM')
    expect(r.faltando).toEqual([])
  })
  it('recusa sem as colunas obrigatórias', () => {
    const r = lerLotes([['Assessor', 'Data'], ['x', '01/01/2026']])
    expect(r.ok).toBe(false)
  })
})

describe('lerClientes (export de clientes)', () => {
  it('mapeia o export e as colunas manuais', () => {
    const r = lerClientes([
      ['DT_PARTITION', 'ID_CONTA', 'ID_CLIENTE', 'NOME_CLIENTE', 'CD_CONTA_SEM_DIGITO', 'CD_CONTA_COM_DIGITO', 'CPF_CNPJ', 'ASSESSOR', 'FILIAL', 'SITUACAO_CONTA', 'TP_PESSOA', 'TELEFONE', 'RENDIMENTOS', 'DATA_HABILITACAO', 'Data de Entrada', 'Parceiro'],
      ['30/09/2026', '41427182', '582773', ' Jose Augusto ', '2439404', '24394040', '179.114.301-6', 'ZEVE INVESTIMENTOS 1', 'ZEVE AI LTDA', 'ativa', 'F', '5511996585317', '', '10/03/2026', '01/03/2026', 'Aikon'],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas[0]).toMatchObject({
      nome: 'Jose Augusto', conta: '2439404', conta_digito: '24394040', documento: '1791143016', id_cliente: '582773',
      situacao_conta: 'ATIVA', data_habilitacao: '2026-03-10', data_entrada: '2026-03-01', parceiro: 'Aikon',
      rendimentos: null, dt_partition: '2026-09-30',
    })
  })
  it('deriva a conta sem dígito quando só vem a conta com dígito', () => {
    const r = lerClientes([['NOME_CLIENTE', 'CD_CONTA_COM_DIGITO'], ['Fulano', '1234567']])
    expect(r.ok && r.linhas[0].conta).toBe('123456')
  })
  it('aceita a lista própria sem conta (nome, CPF, telefone)', () => {
    const r = lerClientes([
      ['Nome', 'CPF', 'Telefone', 'Conta Genial', 'Parceiro'],
      ['Maria Souza', '123.456.789-00', '(62) 99999-0000', '', 'Aikon'],
      ['Pedro Lima', '', '5511988887777', '119396', ''],
      ['', '', '', '', ''],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({ nome: 'Maria Souza', conta: '', documento: '12345678900', telefone: '(62) 99999-0000', parceiro: 'Aikon' })
    expect(r.linhas[1]).toMatchObject({ nome: 'Pedro Lima', conta: '119396', documento: '', telefone: '5511988887777' })
  })
  it('recusa arquivo sem coluna de nome e de conta', () => {
    expect(lerClientes([['CPF', 'Telefone'], ['123', '456']]).ok).toBe(false)
  })
})

describe('lerLotes (relatório do BTG)', () => {
  it('lê CPF/CNPJ e parceiro e separa operados de zerados', () => {
    const r = lerLotes([
      ['Data', 'Número Conta', 'CPF', 'CNPJ', 'Cliente', 'Parceiro', 'Ativo', 'Plataforma', 'Lotes Operados', 'Lotes Zerados', 'MODO'],
      ['02/09/2026', '5184171', '302.723.238-02', null, 'Nilson Caglia', null, 'WINV26', 'Nelogica', 170, 0, 'Daytrade'],
      ['03/09/2026', '5184171', '302.723.238-02', null, 'Nilson Caglia', 'Atual Capital', 'WINV26', 'Nelogica', 100, 9, 'Daytrade'],
      ['04/09/2026', '8505666', null, '12.345.678/0001-90', 'Empresa X', null, 'WDOV26', 'Nelogica', 0, 4, 'Daytrade'],
    ], 'ZERAGEM')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(4)
    expect(r.linhas[0]).toMatchObject({ data: '2026-09-02', conta: '5184171', documento: '30272323802', nome_cliente: 'Nilson Caglia', qtd: 170, modo: 'DAYTRADE', parceiro: '', assessor: '' })
    expect(r.linhas[1]).toMatchObject({ qtd: 100, modo: 'DAYTRADE', parceiro: 'Atual Capital' })
    expect(r.linhas[2]).toMatchObject({ qtd: 9, modo: 'DAYTRADE/ZERAGEM', documento: '30272323802' })
    expect(r.linhas[3]).toMatchObject({ conta: '8505666', documento: '12345678000190', qtd: 4, modo: 'DAYTRADE/ZERAGEM' })
    expect(r.faltando).toEqual([])
    expect(resumoLotes(r.linhas, 'ZERAGEM')).toMatchObject({ linhas: 4, operados: 270, zerados: 13, contas: 2 })
  })
  it('lê a aba Lotes da planilha de controle (colunas calculadas ignoradas)', () => {
    const r = lerLotes([
      ['Lotes girados · controle'],
      ['ÚLTIMA DATA LANÇADA', null, 'LOTES NO ÚLTIMO DIA'],
      [null],
      ['Data', 'Conta BTG', 'CPF/CNPJ', 'Nome no Relatório', 'Ativo', 'Plataforma', 'Lotes Operados', 'Lotes Zerados', 'Modo', 'Cliente', 'Responsável', 'Mês Ref.', 'Tarifa Aplicada (R$/lote)', 'Receita Corretagem (R$)'],
      ['02/09/2026', '5184171', '302.723.238-02', 'Nilson Caglia', 'WINV26', 'Nelogica', 170, 0, 'Daytrade', 'Nilson C.', 'Artur', '01/09/2026', 0.25, 42.5],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0]).toMatchObject({ conta: '5184171', documento: '30272323802', nome_cliente: 'Nilson Caglia', qtd: 170, assessor: '' })
  })
})

describe('lerClientes (lista do BTG)', () => {
  it('lê status, responsável, corretagem e conta BTG e ignora a Situação calculada', () => {
    const r = lerClientes([
      ['Clientes'],
      ['CLIENTES LEVADOS', 'MIGRADOS'],
      [null],
      ['Cliente', 'CPF/CNPJ', 'Telefone', 'Status', 'Responsável', 'Parceiro', 'Corretagem (R$/lote)', 'Data de Entrada', 'Data de Migração', 'Conta BTG', 'Observações', 'Motivo da Recusa', 'Lotes Girados (total)', 'Último Mês com Giro', 'Dias até Migrar', 'Situação', 'Alertas'],
      ['Nilson Caglia', '302.723.238-02', '15988010423', 'Migrado', 'Artur', null, 0.25, '24/09/2026', '24/09/2026', '5184171', null, null, 5544, '01/10/2026', 0, 'Ativo', ''],
      ['Thiago Neves', '096.650.977-33', '22999091109', 'Recusou', 'Artur', 'Direto', 0, '23/09/2026', null, null, 'Sem corretagem informada', null, 0, '-', '', 'Recusou', 'recusa sem motivo'],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(2)
    expect(r.linhas[0]).toMatchObject({ nome: 'Nilson Caglia', documento: '30272323802', status: 'Migrado', responsavel: 'Artur', corretagem: 0.25, data_entrada: '2026-09-24', data_habilitacao: '2026-09-24', conta: '5184171', situacao_conta: '' })
    expect(r.linhas[1]).toMatchObject({ status: 'Recusou', corretagem: 0, conta: '', parceiro: 'Direto', observacoes: 'Sem corretagem informada' })
    expect(r.faltando).not.toContain('status')
  })
})

describe('lerLeads (formulário)', () => {
  it('mapeia o export do formulário e as colunas da equipe', () => {
    const r = lerLeads([
      ['Data/Hora', 'Nome', 'WhatsApp', 'CPF', 'Email', 'Já opera?', 'Corretora', 'Origem / Parceiro', 'Responsável', 'Status', 'Último Contato'],
      ['01/10/26 09:28', 'joab bugres', '(11) 9444-4444', '278.906.238-28', 'NaoTem@gmail.com', 'Sim, já opero', 'Genial', '', 'Aikon', 'Em contato', '02/10/2026'],
      ['', '', '', '', '', '', '', '', '', '', ''],
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0]).toMatchObject({
      nome: 'joab bugres', email: 'naotem@gmail.com', corretora: 'Genial', responsavel: 'Aikon', status: 'Em contato',
      ultimo_contato: '2026-10-02', data_fechamento: null,
    })
    expect(r.linhas[0].data_hora).toBe('2026-10-01T09:28:00-03:00')
  })
})
