/**
 * Adaptador real de `PortaParticipacoes` — a única peça deste diretório que
 * toca `@prisma/client`/`tx: ClienteTransacao`. Usado pelas duas rotas de
 * `admin-participacoes`; a lógica de negócio (`./definir.ts`, `./lote.ts`)
 * não depende deste arquivo, só da interface em `./tipos.ts` — é o que
 * permite os testes de aceitação substituírem toda a camada de dados por um
 * fake em memória sem gerar/mocar o Prisma Client.
 *
 * Reaproveita infra já pronta em vez de recriar:
 * - `travarColaborador`/`travarColaboradores` de `@/server/db/tx` (`SEC-ACID`,
 *   ordem fixa de locks — item 4 de `API-ADM-PAR-002`).
 * - `registrarAuditoria` de `@/server/audit/registrar` (`AUD-2`, dentro da
 *   transação do chamador).
 *
 * `participacao_ciclo` não tem `@@unique([cicloId, colaboradorId])` declarado
 * em `prisma/schema.prisma` (só o índice único `participacao_unica` existe na
 * migration SQL — ver `_conflitos.md`), então `upsert`/`findUnique` do Prisma
 * não têm o campo composto disponível. `salvarParticipacao` por isso faz
 * `findFirst` + `update`/`create` em vez de `upsert` tipado — a segurança sob
 * concorrência continua vindo do advisory lock por colaborador (`travarColaborador`,
 * sempre chamado antes desta porta ser usada para o mesmo colaborador) mais o
 * índice único como rede de segurança no banco.
 */
import { travarColaborador, travarColaboradores } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import type { ClienteTransacao } from '@/server/db/tx';
import type {
  CicloResumo,
  ColaboradorResumo,
  DadosParticipacao,
  EventoAuditoriaEntrada,
  FiltroLote,
  ParticipacaoResumo,
  PortaParticipacoes,
} from './tipos';

export function adaptarPrisma(tx: ClienteTransacao): PortaParticipacoes {
  return {
    async buscarCiclo(cicloId): Promise<CicloResumo | null> {
      const ciclo = await tx.ciclo.findUnique({
        where: { id: cicloId },
        select: { id: true, status: true, limitePadrao: true },
      });
      if (!ciclo) return null;
      return { id: ciclo.id, status: ciclo.status, limitePadrao: ciclo.limitePadrao };
    },

    async buscarColaborador(colaboradorId): Promise<ColaboradorResumo | null> {
      const colaborador = await tx.colaborador.findUnique({
        where: { id: colaboradorId },
        select: { id: true, nome: true, ativo: true },
      });
      if (!colaborador || !colaborador.ativo) return null;
      return { id: colaborador.id, nome: colaborador.nome };
    },

    async buscarColaboradoresPorFiltro(filtro: FiltroLote): Promise<ColaboradorResumo[]> {
      const colaboradores = await tx.colaborador.findMany({
        where: {
          ativo: true,
          ...(filtro.rtId ? { rtId: filtro.rtId } : {}),
          ...(filtro.turno ? { turnoPadrao: filtro.turno } : {}),
          ...(filtro.colaboradorIds ? { id: { in: filtro.colaboradorIds } } : {}),
        },
        select: { id: true, nome: true },
        orderBy: { id: 'asc' },
      });
      return colaboradores;
    },

    async buscarParticipacao(cicloId, colaboradorId): Promise<ParticipacaoResumo | null> {
      const participacao = await tx.participacaoCiclo.findFirst({
        where: { cicloId, colaboradorId },
        select: { limiteOverride: true, permiteCruzada: true, bloqueado: true, motivo: true },
      });
      return participacao;
    },

    async contarUsadas(cicloId, colaboradorId): Promise<number> {
      return tx.marcacao.count({
        where: { colaboradorId, status: 'CONFIRMADA', plantao: { cicloId } },
      });
    },

    async salvarParticipacao(cicloId, colaboradorId, dados: DadosParticipacao): Promise<void> {
      const existente = await tx.participacaoCiclo.findFirst({
        where: { cicloId, colaboradorId },
        select: { id: true },
      });

      if (existente) {
        await tx.participacaoCiclo.update({
          where: { id: existente.id },
          data: {
            ...(dados.limiteOverride !== undefined ? { limiteOverride: dados.limiteOverride } : {}),
            ...(dados.permiteCruzada !== undefined ? { permiteCruzada: dados.permiteCruzada } : {}),
            ...(dados.bloqueado !== undefined ? { bloqueado: dados.bloqueado } : {}),
            ...(dados.motivo !== undefined ? { motivo: dados.motivo } : {}),
          },
        });
        return;
      }

      await tx.participacaoCiclo.create({
        data: {
          cicloId,
          colaboradorId,
          limiteOverride: dados.limiteOverride ?? null,
          permiteCruzada: dados.permiteCruzada ?? null,
          bloqueado: dados.bloqueado ?? false,
          motivo: dados.motivo ?? null,
        },
      });
    },

    async travarColaborador(colaboradorId): Promise<void> {
      await travarColaborador(tx, colaboradorId);
    },

    async travarColaboradores(colaboradorIds): Promise<void> {
      await travarColaboradores(tx, colaboradorIds);
    },

    async registrarAuditoria(evento: EventoAuditoriaEntrada): Promise<void> {
      await registrarAuditoria(tx, evento);
    },
  };
}
