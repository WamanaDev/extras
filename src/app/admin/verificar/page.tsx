'use client';

/**
 * `/admin/verificar` — pede o código do WhatsApp para uma sessão de senha já
 * aberta: logo depois de definir a senha do convite (`/admin/definir-senha`)
 * ou quando o segundo fator de 4h expira (o layout de `/admin/*` manda pra
 * cá). Ao abrir, dispara o envio do código.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { post } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/Logo';
import { VerificacaoWhatsapp } from '@/components/admin/VerificacaoWhatsapp';

type Estado = { tipo: 'ENVIANDO' } | { tipo: 'PRONTO'; destino: string } | { tipo: 'ERRO'; mensagem: string };

export default function VerificarPage(): JSX.Element {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: 'ENVIANDO' });
  // StrictMode roda efeitos 2x em dev — sem isso mandaria dois códigos.
  const jaEnviou = useRef(false);

  useEffect(() => {
    if (jaEnviou.current) return;
    jaEnviou.current = true;
    void (async () => {
      const resultado = await post<{ destino?: string; jaVerificado?: boolean }>('/api/auth/admin/codigo/enviar');
      if (!resultado.ok) {
        if (resultado.status === 401) {
          router.replace('/admin/login');
          return;
        }
        setEstado({ tipo: 'ERRO', mensagem: resultado.erro.mensagem });
        return;
      }
      if (resultado.dados.jaVerificado) {
        router.replace('/admin');
        return;
      }
      setEstado({ tipo: 'PRONTO', destino: resultado.dados.destino ?? '' });
    })();
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <Logo size={40} className="mb-4" />
      <h1 className="mb-6 text-xl font-semibold text-slate-900">Confirme seu acesso</h1>
      {estado.tipo === 'ENVIANDO' ? <p className="text-sm text-slate-600">Enviando código pelo WhatsApp…</p> : null}
      {estado.tipo === 'PRONTO' ? <VerificacaoWhatsapp destino={estado.destino} /> : null}
      {estado.tipo === 'ERRO' ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-red-800">
            {estado.mensagem}
          </p>
          <Button className="w-full" onClick={() => router.push('/admin/login')}>
            Ir para o login
          </Button>
        </div>
      ) : null}
    </main>
  );
}
