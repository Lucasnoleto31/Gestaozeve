'use client'

// Ações do extrato do parceiro (S48): baixar a planilha (xlsx carregado sob demanda, é pesado)
// e abrir a versão para imprimir ou salvar em PDF em outra aba.
import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { useToast } from '@/components/ui/Toast'
import type { Celula } from '@/lib/gestao/extrato'

export function ExtratoAcoes({ matriz, nomeArquivo, hrefImpressao }: { matriz: Celula[][]; nomeArquivo: string; hrefImpressao: string }) {
  const { avisar } = useToast()
  const [gerando, setGerando] = useState(false)
  const baixar = async () => {
    setGerando(true)
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.aoa_to_sheet(matriz)
      ws['!cols'] = (matriz[0] ?? []).map((_, i) => ({ wch: i === 0 ? 36 : 16 }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Extrato')
      XLSX.writeFile(wb, nomeArquivo)
      avisar({ titulo: 'Planilha gerada', detalhe: nomeArquivo, tom: 'gain' })
    } catch (e) {
      avisar({ titulo: 'Não consegui gerar a planilha', detalhe: e instanceof Error ? e.message : undefined, tom: 'loss' })
    }
    setGerando(false)
  }
  return (
    <>
      <Button variant="secondary" onClick={baixar} loading={gerando} disabled={matriz.length < 2}><Download className="h-4 w-4" aria-hidden />Baixar planilha</Button>
      <a href={hrefImpressao} target="_blank" rel="noopener" className={buttonClasses('secondary', 'md')} title="Abre em outra aba, pronta para imprimir ou salvar em PDF">
        <Printer className="h-4 w-4" aria-hidden />Imprimir / PDF
      </a>
    </>
  )
}
