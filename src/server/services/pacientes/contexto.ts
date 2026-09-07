/**
 * Helper compartilhado pelas rotas do módulo de pacientes: resolve a RT do
 * colaborador autenticado (RNP-01) — nenhuma rota aceita `rtId` do cliente
 * para decidir escopo (`API-000` "Ator").
 */
import type { PrismaClient } from '@prisma/client';
import { erroSemPermissao } from '@/server/http/erros';

export async function obterRtDoColaborador(prisma: PrismaClient, colaboradorId: string): Promise<string> {
  const colaborador = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { rtId: true, ativo: true } });
  if (!colaborador || !colaborador.ativo) throw erroSemPermissao('Sua conta não está ativa.');
  return colaborador.rtId;
}
