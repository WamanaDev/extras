/**
 * API-ADM-COL-006 — `POST /api/admin/colaboradores/:id/trocar-escala`
 *
 * Nunca sobrescreve `colaborador.escalaAncora`/`turnoPadrao` — insere uma
 * linha em `troca_escala` (histórico). `gerar_escala_mensal` (`FN-002`, já
 * implementada em `prisma/migrations/20260101000007_funcoes`) lê o histórico
 * de `troca_escala` via `LEFT JOIN LATERAL` antes de decidir a âncora vigente
 * de cada dia — inserir a troca primeiro e só então rechamar a função é
 * suficiente para a regeneração refletir a nova âncora, sem duplicar a lógica
 * de "âncora vigente" aqui (ela já existe em `src/lib/escala/ancora.ts` para
 * o preview, e na função SQL para a regeneração real).
 *
 * `valida_descanso` (`FN-004`, mesma migration) é a decisão final de jornada
 * — reaproveitada via `SELECT valida_descanso(...)`, nunca reimplementada em
 * TS (a lógica espelho de `src/lib/escala/blocos.ts` é só para a UI
 * antecipar bloqueio, não para a rota decidir).
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado, erroDeNegocio, ErroHttp } from '@/server/http/erros';
import { emTransacao, travarColaborador, type ClienteTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { previewMeses } from '@/lib/escala/ancora';
import { obterPrisma, parseDataCivil, formatarDataCivil } from '@/server/services/colaboradores';

const ParamsSchema = z.object({ id: z.string().uuid() });

const TrocarEscalaSchema = z
  .object({
    vigenciaInicio: z.string(),
    turno: z.enum(['DIURNO', 'NOTURNO']),
    ancora: z.string(),
    periodo: z.number().int().min(1).optional(),
    motivo: z.string().trim().min(1, 'Motivo é obrigatório.'),
    regerarEscala: z.boolean().optional(),
  })
  .strict();

interface ViolacaoJornada {
  marcacaoId: string;
  motivo: string;
}

async function regenerarCiclosAbertos(
  tx: ClienteTransacao,
  colaboradorId: string,
  vigenciaInicio: Date,
): Promise<{ criados: number; removidos: number }> {
  const ciclosAbertos = await tx.ciclo.findMany({
    where: { status: { not: 'FECHADO' } },
  });

  let criados = 0;
  let removidos = 0;

  for (const ciclo of ciclosAbertos) {
    const fimDoMes = new Date(Date.UTC(ciclo.ano, ciclo.mes, 0));
    if (fimDoMes.getTime() < vigenciaInicio.getTime()) continue; // ciclo inteiro antes da vigência — intocado (teste 3).

    // Dias `D` deste colaborador, neste ciclo, a partir da vigência, sem
    // marcação confirmada vinculada (plantão no mesmo dia) — únicos
    // candidatos a remoção (Fluxo, passo 3: F/FT/FE e dias com extra ficam).
    // eslint-disable-next-line no-await-in-loop -- poucos ciclos abertos por vez; cada iteração depende do resultado da anterior (removidos/criados acumulados).
    const diasD = await tx.escalaDia.findMany({
      where: { colaboradorId, cicloId: ciclo.id, data: { gte: vigenciaInicio }, codigoEscala: { codigo: 'D' } },
      select: { id: true, data: true },
    });

    if (diasD.length > 0) {
      const datas = diasD.map((d) => d.data);
      // eslint-disable-next-line no-await-in-loop
      const marcacoesNasDatas = await tx.marcacao.findMany({
        where: { colaboradorId, status: 'CONFIRMADA', plantao: { data: { in: datas } } },
        select: { plantao: { select: { data: true } } },
      });
      const datasComExtra = new Set(marcacoesNasDatas.map((m) => m.plantao.data.getTime()));
      const idsParaRemover = diasD.filter((d) => !datasComExtra.has(d.data.getTime())).map((d) => d.id);

      if (idsParaRemover.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        const resultado = await tx.escalaDia.deleteMany({ where: { id: { in: idsParaRemover } } });
        removidos += resultado.count;
      }
    }

    // eslint-disable-next-line no-await-in-loop
    const linhas = await tx.$queryRaw<Array<{ gerar_escala_mensal: number }>>`SELECT gerar_escala_mensal(${ciclo.id}::uuid)`;
    criados += linhas[0]?.gerar_escala_mensal ?? 0;
  }

  return { criados, removidos };
}

async function revalidarJornada(tx: ClienteTransacao, colaboradorId: string, vigenciaInicio: Date): Promise<ViolacaoJornada[]> {
  const marcacoes = await tx.marcacao.findMany({
    where: { colaboradorId, status: 'CONFIRMADA', plantao: { data: { gte: vigenciaInicio } } },
    select: { id: true, inicioEm: true, fimEm: true, plantao: { select: { ciclo: { select: { maxBlocosSeguidos: true } } } } },
  });

  const violacoes: ViolacaoJornada[] = [];
  for (const marcacao of marcacoes) {
    // eslint-disable-next-line no-await-in-loop -- FN-004 é a decisão final (SEC-ACID) — não há como paralelizar sem perder a leitura consistente dentro da mesma tx.
    const linhas = await tx.$queryRaw<Array<{ valida_descanso: string | null }>>`
      SELECT valida_descanso(${colaboradorId}::uuid, ${marcacao.inicioEm}::timestamptz, ${marcacao.fimEm}::timestamptz, ${marcacao.plantao.ciclo.maxBlocosSeguidos}::int)
    `;
    const resultado = linhas[0]?.valida_descanso ?? null;
    if (resultado !== null) violacoes.push({ marcacaoId: marcacao.id, motivo: resultado });
  }
  return violacoes;
}

function criarHandlerTrocarEscala(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    body: TrocarEscalaSchema,
    handler: async ({ params, body, ator, ctx }) => {
      const colaborador = await prisma.colaborador.findUnique({ where: { id: params.id } });
      if (!colaborador) throw erroNaoEncontrado('Colaborador não encontrado.');

      const vigenciaInicio = parseDataCivil(body.vigenciaInicio);
      if (!vigenciaInicio) throw erroDeNegocio('Data de vigência inválida.', 'REGRA_DE_NEGOCIO');
      const ancora = parseDataCivil(body.ancora);
      if (!ancora) throw new ErroHttp({ status: 422, codigo: 'ANCORA_INVALIDA', mensagem: 'Data de âncora inválida.', detalhes: { ancora: 'Use o formato AAAA-MM-DD.' } });

      const hoje = new Date(Date.UTC(ctx.agora.getUTCFullYear(), ctx.agora.getUTCMonth(), ctx.agora.getUTCDate()));
      if (vigenciaInicio.getTime() < hoje.getTime()) {
        throw erroDeNegocio('A vigência não pode ser retroativa.', 'VIGENCIA_NO_PASSADO');
      }

      const cicloDaVigencia = await prisma.ciclo.findFirst({
        where: { ano: vigenciaInicio.getUTCFullYear(), mes: vigenciaInicio.getUTCMonth() + 1 },
      });
      if (cicloDaVigencia && cicloDaVigencia.status === 'FECHADO') {
        throw erroDeNegocio('O ciclo desta vigência já está fechado.', 'CICLO_FECHADO');
      }

      const periodo = body.periodo ?? 2;

      const resultado = await emTransacao(prisma, async (tx) => {
        await travarColaborador(tx, params.id);

        const troca = await tx.trocaEscala.create({
          data: {
            colaboradorId: params.id,
            vigenciaInicio,
            turno: body.turno,
            ancora,
            periodo,
            motivo: body.motivo,
            criadoPorId: ator.adminId,
          },
        });

        let escalaRegerada: { criados: number; removidos: number } | undefined;
        if (body.regerarEscala) {
          escalaRegerada = await regenerarCiclosAbertos(tx, params.id, vigenciaInicio);
        }

        const violacoes = await revalidarJornada(tx, params.id, vigenciaInicio);
        if (violacoes.length > 0) {
          // Lança dentro da transação — desfaz troca + regeneração juntas (ACID/A).
          throw erroDeNegocio(
            `A troca de escala cria ${violacoes.length} violação(ões) de jornada.`,
            'EXCEDE_JORNADA',
          );
        }

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'ESCALA_TROCADA',
          entidade: 'colaborador',
          entidadeId: params.id,
          payload: {
            anterior: { turno: colaborador.turnoPadrao, ancora: formatarDataCivil(colaborador.escalaAncora), periodo: colaborador.escalaPeriodo },
            nova: { turno: body.turno, ancora: formatarDataCivil(ancora), periodo },
            motivo: body.motivo,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return { troca, escalaRegerada };
      });

      const previewMesesResultado = previewMeses(ancora, periodo, vigenciaInicio.getUTCFullYear(), vigenciaInicio.getUTCMonth() + 1, 3);

      return {
        troca: {
          id: resultado.troca.id,
          vigenciaInicio: formatarDataCivil(vigenciaInicio),
          turno: resultado.troca.turno,
          ancora: formatarDataCivil(ancora),
          periodo,
          motivo: resultado.troca.motivo,
        },
        previewMeses: previewMesesResultado,
        ...(resultado.escalaRegerada !== undefined ? { escalaRegerada: resultado.escalaRegerada } : {}),
      };
    },
  });
}

export const POST = criarHandlerTrocarEscala(obterPrisma());
