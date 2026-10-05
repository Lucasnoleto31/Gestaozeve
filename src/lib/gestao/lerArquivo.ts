'use client'

// Lê um arquivo .xlsx/.xls/.csv no navegador e devolve a matriz da primeira aba
// (ou da aba pedida). O xlsx é carregado sob demanda (é pesado).
export type Aba = { nome: string; linhas: unknown[][] }

export async function lerArquivo(file: File, aba?: string): Promise<{ abas: string[]; dados: unknown[][] }> {
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
  const abas = wb.SheetNames
  const escolhida = aba && abas.includes(aba) ? aba : abas[0]
  const ws = wb.Sheets[escolhida]
  const dados = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false })
  return { abas, dados }
}
