'use client';

/**
 * Rede de segurança contra tela branca (FE-001.2) para falhas inesperadas
 * (bug, exceção não tratada) — não é o caminho de erro de negócio da API
 * (esse é sempre tratado inline em cada página com `erro.mensagem`,
 * FE-001.3). Esta mensagem é genérica de propósito: não inventa detalhe
 * técnico nem finge ser uma resposta da API.
 */
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErroColaborador({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): JSX.Element {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm text-red-800">
        Algo deu errado ao carregar esta página. Tente novamente.
      </p>
      <Button className="mt-4" onClick={reset}>
        Tentar de novo
      </Button>
    </div>
  );
}
