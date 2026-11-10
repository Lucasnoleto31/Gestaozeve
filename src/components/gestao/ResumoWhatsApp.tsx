'use client'

// Mensagem do giro pronta para o WhatsApp: copiar, ou abrir o WhatsApp com o texto preenchido
// (quem envia escolhe o grupo ou o contato). Sem API: é um clique a mais de quem subiu a planilha.
import { Copy, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buttonClasses } from '@/components/ui/buttonStyles'
import { useToast } from '@/components/ui/Toast'
import { linkWhatsApp } from '@/lib/gestao/mensagens'

export function ResumoWhatsApp({ texto, titulo = 'Resumo para o WhatsApp' }: { texto: string; titulo?: string }) {
  const { avisar } = useToast()
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto)
      avisar({ titulo: 'Mensagem copiada', detalhe: 'Cole no grupo do WhatsApp.', tom: 'gain' })
    } catch {
      avisar({ titulo: 'Não consegui copiar', detalhe: 'Selecione o texto e copie com Ctrl+C.', tom: 'loss' })
    }
  }
  return (
    <div className="rounded-md border border-line bg-surface-2 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="label">{titulo}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={copiar}><Copy className="h-4 w-4" aria-hidden />Copiar</Button>
          <a href={linkWhatsApp(texto)} target="_blank" rel="noopener noreferrer" className={buttonClasses('primary', 'sm')}>
            <MessageCircle className="h-4 w-4" aria-hidden />Abrir no WhatsApp
          </a>
        </div>
      </div>
      <pre className="whitespace-pre-wrap font-sans text-dense leading-relaxed text-fg">{texto}</pre>
      <p className="mt-2 text-micro text-fg-subtle">Abre o WhatsApp com a mensagem pronta; é só escolher o grupo e enviar.</p>
    </div>
  )
}
