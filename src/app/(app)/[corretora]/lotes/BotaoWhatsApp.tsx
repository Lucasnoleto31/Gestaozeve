'use client'

// "WhatsApp" no cabeçalho do Giro diário: monta o resumo do último dia lançado (o mesmo texto que a
// importação mostra depois de subir a planilha) para mandar de novo sem reimportar nada.
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { ResumoWhatsApp } from '@/components/gestao/ResumoWhatsApp'
import { resumoGiroDoDia } from '@/lib/gestao/acoesGiro'
import { dataPt } from '@/components/gestao/Celulas'
import type { Corretora } from '@/lib/corretoras'

// className: no celular o botão do cabeçalho some e a aba Agora mostra o dela, logo abaixo da frase
export function BotaoWhatsApp({ corretora, dia, className }: { corretora: Corretora; dia: string; className?: string }) {
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [texto, setTexto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const abrir = async () => {
    setAberto(true)
    if (texto) return
    setCarregando(true); setErro(null)
    const r = await resumoGiroDoDia(corretora, dia, null)
    setCarregando(false)
    if (r.ok) setTexto(r.dados.texto)
    else setErro(r.erro)
  }

  return (
    <>
      <Button variant="secondary" size="sm" className={className} onClick={abrir} loading={carregando} title={`Resumo de ${dataPt(dia)} para o WhatsApp`}>
        <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title={`Giro de ${dataPt(dia)}`} subtitle="O último dia lançado, no formato da mensagem do grupo." size="md">
        {erro && <Alert tone="loss">{erro}</Alert>}
        {!erro && !texto && <p className="text-dense text-fg-muted">Montando o resumo…</p>}
        {texto && <ResumoWhatsApp texto={texto} />}
      </Modal>
    </>
  )
}
