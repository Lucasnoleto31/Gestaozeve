// Pedaços que só aparecem no celular (DESIGN.md §8) e que as abas do Funil repetem.
import { Dica } from '@/components/ui/Dica'

// A palavra que acompanha o número na linha de apoio da lista ("26 tombaram"); no computador o cabeçalho
// da coluna já diz. Sem `varios`, a palavra não muda com o número ("em contato", "por dia").
export function Palavra({ n, um, varios }: { n?: number; um: string; varios?: string }) {
  return <span className="md:hidden"> {n === 1 || !varios ? um : varios}</span>
}

// A explicação do bloco atrás do "i", colada na última palavra do título: o espaço que não quebra, dentro de
// um trecho sem quebra de linha, impede o "i" de cair sozinho na linha de baixo. No computador a explicação
// é o subtítulo do bloco, como sempre.
export function DicaNoTitulo({ texto }: { texto: string }) {
  return <span className="whitespace-nowrap md:hidden">{' '}<Dica texto={texto} /></span>
}
