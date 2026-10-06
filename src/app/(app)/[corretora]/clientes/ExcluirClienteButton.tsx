'use client'

// Exclui o cliente da corretora (lista própria, ex.: BTG) depois de confirmar.
// variante "icone" fica na lista (atualiza a tabela); "botao" fica na ficha (volta para a lista).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { excluirClienteDaCorretora } from '@/lib/gestao/acoes'
import { CORRETORA_LABEL, type Corretora } from '@/lib/corretoras'

export function ExcluirClienteButton({ corretora, clienteId, nome, base, variante = 'icone' }: {
  corretora: Corretora
  clienteId: string
  nome: string
  base: string
  variante?: 'icone' | 'botao'
}) {
  const router = useRouter()
  const { avisar } = useToast()
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const label = CORRETORA_LABEL[corretora]

  const excluir = async () => {
    setOcupado(true); setErro(null)
    const r = await excluirClienteDaCorretora(corretora, clienteId)
    setOcupado(false)
    if (!r.ok) { setErro(r.erro); return }
    setAberto(false)
    avisar({ titulo: 'Cliente excluído', detalhe: r.dados.cadastroRemovido ? `${nome} saiu do cadastro.` : `${nome} saiu da ${label}; continua cadastrado em outra corretora.`, tom: 'neutral' })
    if (variante === 'botao') router.push(`${base}/clientes`)
    else router.refresh()
  }

  return (
    <>
      {variante === 'icone'
        ? <IconButton tone="danger" title="Excluir cliente" aria-label={`Excluir ${nome}`} onClick={() => setAberto(true)}><Trash2 className="h-4 w-4" aria-hidden /></IconButton>
        : <Button variant="secondary" size="sm" onClick={() => setAberto(true)}><Trash2 className="h-3.5 w-3.5 text-loss" aria-hidden />Excluir</Button>}
      <Modal open={aberto} onClose={() => setAberto(false)} title="Excluir cliente" subtitle={nome}
        footer={<><Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button><Button variant="danger" onClick={excluir} loading={ocupado}>Excluir</Button></>}>
        {erro && <Alert tone="danger" className="mb-3">{erro}</Alert>}
        <p className="text-dense text-fg-muted">
          Sai da lista da {label} com a conta, a tarifa e os campos manuais. Os lotes dele ficam como &quot;não cadastrados&quot; e voltam a ligar se o cliente for cadastrado de novo com o mesmo CPF. Não dá para desfazer.
        </p>
      </Modal>
    </>
  )
}
