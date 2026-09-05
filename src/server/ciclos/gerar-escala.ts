/**
 * API-ADM-CIC-003 — `POST /api/admin/ciclos/:id/gerar-escala`.
 *
 * Materializa a escala base do mês chamando `gerar_escala_mensal` (FN-002,
 * `prisma/migrations/20260101000007_funcoes/migration.sql`) dentro de
 * `emTransacao`. Idempotente: a função usa `ON CONFLICT DO NOTHING`
 * (RN-05) — reexecutar não duplica nem apaga ausência já lançada.
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { AtorAdmin, ContextoRequisicao } from '@/server/http/handler';
import { erroCiclo, mensagemBrutaDoErro } from './compartilhado';

export interface ColaboradorPulado {
  colaboradorId: string;
  nome: string;
  matricula: string;
  motivo: 'SEM_ANCORA' | 'SEM_TURNO';
}

export interface ResultadoGerarEscala {
  criados: number;
  jaExistentes: number;
  pulados: ColaboradorPulado[];
}

export async function gerarEscala(
  prisma: PrismaClient,
  cicloId: string,
  ator: AtorAdmin,
  ctx: ContextoRequisicao,
): Promise<ResultadoGerarEscala> {
  return emTransacao(prisma, async (tx) => {
    let criados: number;
    try {
      const resultado = await tx.$queryRaw<Array<{ gerar_escala_mensal: number }>>`
        SELECT gerar_escala_mensal(${cicloId}::uuid) AS gerar_escala_mensal
      `;
      criados = Number(resultado[0]?.gerar_escala_mensal ?? 0);
    } catch (erroCapturado) {
      const mensagem = mensagemBrutaDoErro(erroCapturado);
      if (mensagem.includes('CICLO_FECHADO')) {
        throw erroCiclo(409, 'CICLO_FECHADO', 'Ciclo fechado não pode gerar escala.');
      }
      if (mensagem.includes('CICLO_INEXISTENTE')) {
        throw erroNaoEncontrado();
      }
      throw erroCapturado;
    }

    const totalAtual = await tx.escalaDia.count({ where: { cicloId } });
    const jaExistentes = Math.max(totalAtual - criados, 0);

    // Colaboradores ativos sem nenhuma linha de escala neste ciclo — no
    // schema atual `escalaAncora`/`turnoPadrao` são NOT NULL (ver
    // `_conflitos.md` item 7(c)), então este cenário só ocorre por
    // divergência de paridade em meses muito curtos; `SEM_TURNO` é o motivo
    // usado por padrão (não há como distinguir SEM_ANCORA com o schema
    // atual — coluna nunca é nula).
    const colaboradoresSemEscala = await tx.colaborador.findMany({
      where: { ativo: true, escalasDia: { none: { cicloId } } },
      select: { id: true, nome: true, matricula: true },
    });
    const pulados: ColaboradorPulado[] = colaboradoresSemEscala.map((c) => ({
      colaboradorId: c.id,
      nome: c.nome,
      matricula: c.matricula,
      motivo: 'SEM_TURNO',
    }));

    await registrarAuditoria(tx, {
      atorTipo: 'ADMIN',
      atorId: ator.adminId,
      acao: 'ESCALA_GERADA',
      entidade: 'ciclo',
      entidadeId: cicloId,
      payload: { criados, jaExistentes, pulados: pulados.length },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return { criados, jaExistentes, pulados };
  });
}
