import { redirect } from 'next/navigation';

/**
 * `/` não tem spec própria em `06-frontend/paginas.md` — o mapa só define
 * `/login` (colaborador) e `/admin/login` (admin), nenhuma tela na raiz.
 * Redireciona pro ponto de entrada do colaborador; quem precisa do admin
 * já sabe ir direto em `/admin/login`.
 */
export default function HomePage(): never {
  redirect('/login');
}
