import type { MetadataRoute } from 'next'

// Manifesto do app: "Adicionar à Tela de Início" no iPhone e "Instalar" no Android abrem
// o Zeve Controle em tela cheia, com ícone próprio, como um aplicativo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Zeve Controle',
    short_name: 'Zeve',
    description: 'Lotes, barras e receita das corretoras Genial, XP e BTG',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0e14',
    theme_color: '#0a0e14',
    lang: 'pt-BR',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icone-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
