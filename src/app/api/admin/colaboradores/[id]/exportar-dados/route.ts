/**
 * API-ADM-COL-009 — `GET /api/admin/colaboradores/:id/exportar-dados`
 *
 * Lógica em `./_impl.ts` (Next.js só aceita métodos HTTP como export de
 * `route.ts` — ver docstring de `_impl.ts`). Este arquivo só troca o
 * envelope JSON do pipeline por uma resposta binária de verdade quando
 * `?formato=pdf`, sem duplicar autenticação/auditoria.
 */
import { NextResponse } from 'next/server';
import { obterPrisma } from '@/server/services/colaboradores';
import { criarHandlerExportarDados, type CorpoExportacao } from './_impl';

const handlerInterno = criarHandlerExportarDados(obterPrisma());

export async function GET(
  request: Parameters<typeof handlerInterno>[0],
  contexto: Parameters<typeof handlerInterno>[1],
): Promise<NextResponse> {
  const resposta = await handlerInterno(request, contexto);
  if (resposta.status !== 200) return resposta; // erro já formatado pelo pipeline — repassa como está.

  const corpo = (await resposta.json()) as CorpoExportacao;
  if (corpo.formato === 'json') {
    return NextResponse.json(corpo.pacote, {
      status: 200,
      headers: {
        'Cache-Control': resposta.headers.get('Cache-Control') ?? 'private, no-store',
        'X-Request-Id': resposta.headers.get('X-Request-Id') ?? '',
      },
    });
  }

  const binaria = new NextResponse(new Uint8Array(Buffer.from(corpo.bufferBase64 ?? '', 'base64')), { status: 200 });
  binaria.headers.set('Content-Type', 'application/pdf');
  binaria.headers.set('Content-Disposition', 'attachment; filename="exportacao-dados.pdf"');
  const cacheControl = resposta.headers.get('Cache-Control');
  if (cacheControl) binaria.headers.set('Cache-Control', cacheControl);
  const requestId = resposta.headers.get('X-Request-Id');
  if (requestId) binaria.headers.set('X-Request-Id', requestId);
  return binaria;
}
