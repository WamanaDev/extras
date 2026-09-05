/**
 * Cliente HTTP para Server Components chamarem as próprias rotas de API
 * durante o SSR — mesmo envelope de `./client.ts` (não duplica o parsing de
 * `ErroApi`), só troca o transporte: `fetch` de um Server Component não tem
 * acesso automático aos cookies do navegador, então este helper lê os
 * cookies da requisição corrente (`next/headers`) e os repassa manualmente
 * no header `Cookie` da chamada interna.
 *
 * Usado pelo guard de sessão do layout de `(colaborador)` (FE-001.1) e pelas
 * páginas que buscam dados iniciais no servidor para nunca renderizar tela
 * branca (FE-001.2).
 */
import { cookies, headers } from 'next/headers';
import type { ErroApi, ResultadoApi } from './client';

function ehErroApi(valor: unknown): valor is ErroApi {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'erro' in valor &&
    'mensagem' in valor &&
    typeof (valor as { erro: unknown }).erro === 'string' &&
    typeof (valor as { mensagem: unknown }).mensagem === 'string'
  );
}

async function urlBaseAtual(): Promise<string> {
  const listaHeaders = await headers();
  const host = listaHeaders.get('host') ?? 'localhost:3000';
  const proto = listaHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** `GET` autenticado contra a própria API, repassando os cookies da requisição atual. */
export async function getServidor<T>(caminho: string): Promise<ResultadoApi<T>> {
  const listaCookies = await cookies();
  const cookieHeader = listaCookies
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  const base = await urlBaseAtual();

  let resposta: Response;
  try {
    resposta = await fetch(`${base}${caminho}`, {
      method: 'GET',
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      status: 0,
      erro: {
        erro: 'ERRO_DESCONHECIDO',
        mensagem: 'Não foi possível falar com o servidor. Tente novamente.',
        detalhes: null,
        requestId: '',
      },
    };
  }

  let corpo: unknown = null;
  const texto = await resposta.text();
  if (texto.length > 0) {
    try {
      corpo = JSON.parse(texto);
    } catch {
      corpo = null;
    }
  }

  if (!resposta.ok) {
    if (ehErroApi(corpo)) {
      return { ok: false, status: resposta.status, erro: corpo };
    }
    return {
      ok: false,
      status: resposta.status,
      erro: {
        erro: 'ERRO_DESCONHECIDO',
        mensagem: 'Não foi possível completar a operação. Tente novamente.',
        detalhes: null,
        requestId: '',
      },
    };
  }

  return { ok: true, status: resposta.status, dados: corpo as T, headers: resposta.headers };
}
