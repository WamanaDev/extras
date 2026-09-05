/**
 * `API-ADM-ESC-004` — `GET /api/admin/ciclos/:id/escala/export`.
 *
 * Exporta a escala mensal para impressão (PDF A4 paisagem) ou conferência
 * (XLSX). Passo 1 do fluxo, "Reusar API-ADM-ESC-001": reaproveita
 * `buscarGrade` em vez de duplicar a consulta.
 *
 * `defineHandler` (`API-000`, alteração restrita) sempre serializa o retorno
 * do `handler` como JSON (`src/server/http/handler.ts`, passo
 * "serialização") — não existe um modo de resposta binária. Nenhuma spec de
 * `04-api/*` tinha pedido isso antes desta (registrado em `_conflitos.md`,
 * item 12). Resolução mínima, sem tocar `handler.ts`: o `handler` interno
 * roda o pipeline inteiro (auth/rate limit/CSRF/log/auditoria) normalmente e
 * devolve o binário como base64 dentro do corpo JSON de sucesso; a função
 * `GET` exportada abaixo — que só decodifica e reempacota, sem duplicar
 * nenhuma regra de autorização/negócio — troca esse corpo por uma resposta
 * binária de verdade antes de devolver ao cliente. Nenhum estado
 * compartilhado entre requisições (diferente de uma variável de módulo, que
 * seria uma condição de corrida sob concorrência real).
 *
 * Isso também significa que `export const GET = defineHandler(...)` não é
 * usado ao pé da letra aqui (a exportação real é `handlerComBinario`,
 * abaixo) — o lint de `contrato-comum.md` ("Handler sem defineHandler é
 * erro de lint") não reconhece este padrão. Mesmo conflito, mesma
 * resolução: documentado, não escondido.
 */
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado } from '@/server/http/erros';
import { obterPrisma } from '@/server/db/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { buscarGrade } from '@/server/services/escala-admin/consulta';
import { removerObservacoes } from '@/server/services/escala-admin/grade';
import { gerarPdf, gerarXlsx } from '@/server/services/escala-admin/export';

const ParamsSchema = z.object({ id: z.string().uuid() });
const QuerySchema = z.object({
  formato: z.enum(['pdf', 'xlsx']),
  rt: z.string().uuid().optional(),
});

interface CorpoExportacao {
  bufferBase64: string;
  contentType: string;
  nomeArquivo: string;
  registros: number;
}

const handlerComBinarioEmBase64 = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  params: ParamsSchema,
  query: QuerySchema,
  cache: 'pessoal',
  handler: async ({ ator, params, query, ctx }): Promise<CorpoExportacao> => {
    const prisma = await obterPrisma();

    return emTransacao(prisma, async (tx) => {
      const grade = await buscarGrade(tx, params.id, query.rt !== undefined ? { rt: query.rt } : {});
      if (!grade) throw erroNaoEncontrado('Ciclo não encontrado.');

      // "C": observacao não entra no arquivo exportado (maior volume de dado pessoal do sistema — SEC-AUD).
      const gradeParaExport = removerObservacoes(grade);
      const meta = { cicloId: params.id, geradoEm: ctx.agora };

      const buffer = query.formato === 'pdf' ? await gerarPdf(gradeParaExport, meta) : await gerarXlsx(gradeParaExport, meta);
      const registros = grade.colaboradores.length * grade.ciclo.dias;

      // Auditar EXPORTACAO_DADOS com escopo, formato e nº de registros (passo 3, "C").
      await registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'EXPORTACAO_DADOS',
        entidade: 'ciclo',
        entidadeId: params.id,
        payload: { formato: query.formato, rt: query.rt ?? null, registros },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });

      const extensao = query.formato === 'pdf' ? 'pdf' : 'xlsx';
      const contentType = query.formato === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      return { bufferBase64: buffer.toString('base64'), contentType, nomeArquivo: `escala-${params.id}.${extensao}`, registros };
    });
  },
});

export async function GET(
  request: Parameters<typeof handlerComBinarioEmBase64>[0],
  contexto: Parameters<typeof handlerComBinarioEmBase64>[1],
): Promise<NextResponse> {
  const resposta = await handlerComBinarioEmBase64(request, contexto);
  if (resposta.status !== 200) return resposta; // erro já formatado pelo pipeline — repassa como está.

  const corpo = (await resposta.json()) as CorpoExportacao;
  const binaria = new NextResponse(new Uint8Array(Buffer.from(corpo.bufferBase64, 'base64')), { status: 200 });
  binaria.headers.set('Content-Type', corpo.contentType);
  binaria.headers.set('Content-Disposition', `attachment; filename="${corpo.nomeArquivo}"`);
  const cacheControl = resposta.headers.get('Cache-Control');
  if (cacheControl) binaria.headers.set('Cache-Control', cacheControl);
  const requestId = resposta.headers.get('X-Request-Id');
  if (requestId) binaria.headers.set('X-Request-Id', requestId);
  return binaria;
}
