/**
 * API-ADM-REL-002 — `GET /api/admin/relatorios/ciclo/:id/export`.
 *
 * Fluxo da spec: 1. reusa `API-ADM-REL-001` (`montarRelatorioCiclo`) —
 * 2. serializa (`gerarCsv`/`gerarXlsx`, `@/server/relatorios/{csv,xlsx}.ts`)
 * — 3. audita `EXPORTACAO_DADOS` (`registrarExportacaoCiclo`).
 *
 * ## Resposta binária
 * `defineHandler` (`src/server/http/handler.ts`, passo "serialização")
 * repassa direto qualquer `NextResponse` devolvido pelo `handler` — esse
 * ramo (`resultado instanceof NextResponse`) já existe no pipeline
 * justamente para este caso (ver o doc-comment de `handler.ts`, que cita
 * `API-ADM-REL-002` nominalmente). Não é preciso recorrer ao workaround mais
 * antigo de `src/app/api/admin/ciclos/[id]/escala/export/route.ts`
 * (base64 dentro do corpo JSON + uma segunda função `GET` que reempacota) —
 * essa rota foi escrita antes do pipeline ganhar a passagem direta. Os dois
 * padrões coexistem no repositório por essa razão histórica; registrado em
 * `_conflitos.md`.
 *
 * ## Dois clientes Prisma
 * Leitura do relatório usa `obterPrismaRelatoriosReadonly` (role
 * `app_readonly`, só `SELECT` — igual à REL-001). A gravação de
 * `EXPORTACAO_DADOS` precisa de `INSERT` em `audit_log`, que `app_readonly`
 * não tem (revogado explicitamente, `02-seguranca/confidencialidade.md`) —
 * por isso usa `obterPrisma` (role `app_server`), nunca o readonly.
 */
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { obterPrismaRelatoriosReadonly } from '@/server/relatorios/prisma-cliente';
import { montarRelatorioCiclo } from '@/server/relatorios/ciclo';
import {
  montarLinhasExportacao,
  registrarExportacaoCiclo,
  nomeArquivoExportacao,
  CONTENT_TYPE_POR_FORMATO,
  type FormatoExportacao,
} from '@/server/relatorios/exportacao-ciclo';
import { gerarCsv } from '@/server/relatorios/csv';
import { gerarXlsx } from '@/server/relatorios/xlsx';

const ParamsSchema = z.object({ id: z.string().uuid() });
const QuerySchema = z.object({ formato: z.enum(['csv', 'xlsx']) });

export const GET = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'leitura_por_sessao' },
  params: ParamsSchema,
  query: QuerySchema,
  cache: 'pessoal',
  handler: async ({ ator, params, query, ctx }) => {
    const formato = query.formato as FormatoExportacao;

    const prismaLeitura = await obterPrismaRelatoriosReadonly();
    const relatorio = await montarRelatorioCiclo(prismaLeitura, params.id);

    const linhas = montarLinhasExportacao(relatorio, {
      cicloId: params.id,
      geradoEmIso: ctx.agora.toISOString(),
      adminId: ator.adminId,
    });

    const conteudo = formato === 'csv' ? Buffer.from(gerarCsv(linhas), 'utf8') : gerarXlsx(linhas);

    const prismaEscrita = await obterPrisma();
    await registrarExportacaoCiclo(prismaEscrita, {
      atorId: ator.adminId,
      cicloId: params.id,
      formato,
      registros: relatorio.porColaborador.length,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    const response = new NextResponse(new Uint8Array(conteudo), { status: 200 });
    response.headers.set('Content-Type', CONTENT_TYPE_POR_FORMATO[formato]);
    response.headers.set('Content-Disposition', `attachment; filename="${nomeArquivoExportacao(params.id, formato)}"`);
    return response;
  },
});
