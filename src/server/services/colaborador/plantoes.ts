/**
 * API-COL-003 — `GET /api/plantoes?cicloId=`.
 *
 * `ACID`: "Ambas as funções são `STABLE` e rodam na mesma transação de
 * leitura — saldo e grade não podem refletir instantes diferentes." Por
 * isso as duas chamadas (`FN-007 plantoes_para_colaborador`, `FN-008
 * saldo_colaborador`) acontecem dentro de `emTransacao` (`SEC-ACID`, único
 * ponto de entrada para `$transaction` com callback — reaproveitado mesmo
 * sendo leitura, para não abrir uma segunda forma de transação no projeto).
 *
 * `FN-007`/`FN-008` são as únicas fontes de verdade para `motivo`/saldo —
 * este módulo não reimplementa nenhuma regra de RT-cruzada/jornada/limite/
 * vaga (`CIA` — I: "divergência entre o que a UI mostra e o que a marcação
 * recusa é bug de confiança").
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { erroNaoEncontrado } from '@/server/http/erros';

export type ClientePlantoes = PrismaClient;

export type MotivoIndisponivel =
  | 'JA_MARCADO'
  | 'CRUZADA_BLOQUEADA'
  | 'EM_AUSENCIA'
  | 'CONFLITO_DE_HORARIO'
  | 'EXCEDE_JORNADA'
  | 'LIMITE_ATINGIDO'
  | 'SEM_VAGA';

export interface PlantaoGrade {
  id: string;
  data: string;
  tipo: 'DIURNO' | 'NOTURNO';
  rt: string;
  horaInicio: string;
  horaFim: string;
  vagasTotais: number;
  vagasOcupadas: number;
  jaMarcado: boolean;
  disponivel: boolean;
  motivo: MotivoIndisponivel | null;
}

export interface GradePlantoesResposta {
  saldo: { limite: number; usadas: number; restantes: number; permiteCruzada: boolean };
  plantoes: PlantaoGrade[];
}

interface LinhaPlantao {
  plantao_id: string;
  data: Date;
  tipo: 'DIURNO' | 'NOTURNO';
  rt_codigo: string;
  hora_inicio: string;
  hora_fim: string;
  vagas_totais: number;
  vagas_ocupadas: number;
  ja_marcado: boolean;
  disponivel: boolean;
  motivo: MotivoIndisponivel | null;
}

interface LinhaSaldo {
  limite: number;
  usadas: number;
  restantes: number;
  permite_cruzada: boolean;
}

async function executar(
  tx: Prisma.TransactionClient,
  cicloId: string,
  colaboradorId: string,
): Promise<GradePlantoesResposta> {
  const ciclo = await tx.ciclo.findUnique({ where: { id: cicloId } });
  // Teste #6: "Ciclo em rascunho | 404". Ciclo inexistente também é 404
  // (contrato-comum.md: "recurso de terceiro/inexistente → 404").
  if (!ciclo || ciclo.status !== 'PUBLICADO') {
    throw erroNaoEncontrado('Ciclo não encontrado.');
  }

  const [saldoLinhas, plantaoLinhas] = await Promise.all([
    tx.$queryRaw<LinhaSaldo[]>`SELECT * FROM saldo_colaborador(${cicloId}::uuid, ${colaboradorId}::uuid)`,
    tx.$queryRaw<LinhaPlantao[]>`SELECT * FROM plantoes_para_colaborador(${cicloId}::uuid, ${colaboradorId}::uuid)`,
  ]);

  const saldo = saldoLinhas[0];
  if (!saldo) {
    throw erroNaoEncontrado('Ciclo não encontrado.');
  }

  return {
    saldo: {
      limite: saldo.limite,
      usadas: saldo.usadas,
      restantes: saldo.restantes,
      permiteCruzada: saldo.permite_cruzada,
    },
    plantoes: plantaoLinhas.map((linha) => ({
      id: linha.plantao_id,
      data: linha.data.toISOString().slice(0, 10),
      tipo: linha.tipo,
      rt: linha.rt_codigo,
      horaInicio: linha.hora_inicio,
      horaFim: linha.hora_fim,
      vagasTotais: linha.vagas_totais,
      vagasOcupadas: linha.vagas_ocupadas,
      jaMarcado: linha.ja_marcado,
      disponivel: linha.disponivel,
      motivo: linha.motivo,
    })),
  };
}

export async function buscarGradePlantoes(
  prisma: ClientePlantoes,
  cicloId: string,
  colaboradorId: string,
): Promise<GradePlantoesResposta> {
  return emTransacao(prisma, (tx) => executar(tx, cicloId, colaboradorId));
}
