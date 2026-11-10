'use client'

// Lê um arquivo .xlsx/.xls/.csv no navegador e devolve a matriz da primeira aba
// (ou da aba pedida). O xlsx é carregado sob demanda (é pesado).
export type Aba = { nome: string; linhas: unknown[][] }

async function abrir(file: File) {
  const XLSX = await import('xlsx')
  const nome = file.name.toLowerCase()
  let wb
  if (nome.endsWith('.csv') || nome.endsWith('.txt')) {
    const buf = await file.arrayBuffer()
    let texto = new TextDecoder('utf-8', { fatal: false }).decode(buf)
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf)
    wb = XLSX.read(texto, { type: 'string', raw: true })
  } else {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, raw: true })
  }
  const matriz = (aba: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, raw: true, defval: null, blankrows: false })
  return { abas: wb.SheetNames, matriz }
}

export async function lerArquivo(file: File, aba?: string): Promise<{ abas: string[]; dados: unknown[][] }> {
  const { abas, matriz } = await abrir(file)
  const escolhida = aba && abas.includes(aba) ? aba : abas[0]
  return { abas, dados: matriz(escolhida) }
}

// Todas as abas (o fechamento do BTG tem uma aba por livro: escritório e parceiros)
export async function lerAbas(file: File): Promise<Aba[]> {
  const { abas, matriz } = await abrir(file)
  return abas.map(nome => ({ nome, linhas: matriz(nome) }))
}
