/**
 * Guard de sessão do grupo `(colaborador)` (FE-001.1): toda página abaixo
 * exige uma sessão de colaborador válida — verificado aqui, uma vez, contra
 * `GET /api/auth/me` (API-AUTH-005), nunca reimplementado ou adivinhado a
 * partir de um cookie presente no cliente (SEC-INT).
 *
 * Server Component: roda no servidor antes de qualquer página filha
 * renderizar, então uma sessão ausente/expirada nunca chega a mostrar tela
 * do colaborador, nem por um instante.
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getServidor } from '@/lib/api/servidor';
import { NavColaborador } from './_components/NavColaborador';

interface RespostaMeColaborador {
  tipo: 'COLABORADOR';
  colaborador: { id: string; nome: string; matricula: string; rt: { codigo: string; nome: string } };
  expiraEm: string;
}
interface RespostaMeAdmin {
  tipo: 'ADMIN';
  admin: { id: string; email: string | null; nome: string | null };
}
type RespostaMe = RespostaMeColaborador | RespostaMeAdmin;

export default async function ColaboradorLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const resultado = await getServidor<RespostaMe>('/api/auth/me');

  if (!resultado.ok || resultado.dados.tipo !== 'COLABORADOR') {
    redirect('/login');
  }

  const { colaborador } = resultado.dados;

  return (
    <div className="min-h-screen bg-slate-50">
      <NavColaborador nome={colaborador.nome} matricula={colaborador.matricula} rtNome={colaborador.rt.nome} />
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:pb-6 sm:pt-6">{children}</main>
    </div>
  );
}
