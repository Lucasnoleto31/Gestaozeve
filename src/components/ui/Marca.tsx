// Marca do Zeve Controle: um "Z" geométrico. O mesmo desenho do ícone do site (src/app/icon.svg
// e apple-icon.png); aqui vai só o Z, em currentColor, dentro do quadrado azul que cada tela monta.
export function Marca({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <path d="M14 16h36v8L28 40h22v8H14v-8l22-16H14z" fill="currentColor" />
    </svg>
  )
}
