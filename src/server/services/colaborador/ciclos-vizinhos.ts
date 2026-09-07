/**
 * `GET /api/ciclos/vizinhos?ano=&mes=` — pedido do usuário, sem spec de API
 * própria ainda (ver `_conflitos.md`): navegação de mês em
 * `/plantoes-calendario` e `/minha-escala-calendario`.
 *
 * "Ciclo fechado é ciclo cancelado, não serve pra nada" (palavras do
 * usuário) — a navegação enxerga só ciclos `PUBLICADO`. `RASCUNHO` e
 * `FECHADO` são tratados como se não existissem: o "anterior"/"próximo" pula
 * direto para o `PUBLICADO` mais próximo, nunca para de um mês vizinho que
 * calhe de estar fechado ou ainda em rascunho.
 *
 * Tabela pequena (um `PUBLICADO` por mês, tipicamente) — busca todos de uma
 * vez e resolve os vizinhos em memória, mesmo espírito de outras tabelas
 * pequenas do projeto (ex. `codigo_escala`) que não paginam.
 */
import type { PrismaClient } from '@prisma/client';
import { calcularEstadoJanela, type EstadoJanela } from './ciclo-atual';

export type ClienteCiclosVizinhos = Pick<PrismaClient, 'ciclo'>;

export interface CicloResumo {
  id: string;
  ano: number;
  mes: number;
  janela: {
    abertura: string | null;
    fechamento: string | null;
    estado: EstadoJanela;
  };
  permiteCruzada: boolean;
}

export interface VizinhosCiclosResposta {
  anterior: CicloResumo | null;
  atual: CicloResumo | null;
  proximo: CicloResumo | null;
  servidorEm: string;
}

interface LinhaCiclo {
  id: string;
  ano: number;
  mes: number;
  aberturaMarcacao: Date | null;
  fechamentoMarcacao: Date | null;
  permiteCruzada: boolean;
}

function chave(ano: number, mes: number): number {
  return ano * 12 + mes;
}

function serializar(ciclo: LinhaCiclo | null, agora: Date): CicloResumo | null {
  if (!ciclo) return null;
  return {
    id: ciclo.id,
    ano: ciclo.ano,
    mes: ciclo.mes,
    janela: {
      abertura: ciclo.aberturaMarcacao ? ciclo.aberturaMarcacao.toISOString() : null,
      fechamento: ciclo.fechamentoMarcacao ? ciclo.fechamentoMarcacao.toISOString() : null,
      estado: calcularEstadoJanela(ciclo.aberturaMarcacao, ciclo.fechamentoMarcacao, agora),
    },
    permiteCruzada: ciclo.permiteCruzada,
  };
}

/**
 * `atual` é o ciclo `PUBLICADO` com `(ano,mes)` exatamente igual ao pedido —
 * `null` se aquele mês não tiver ciclo publicado (não impede navegar: os
 * vizinhos ainda são resolvidos normalmente). `anterior`/`proximo` são
 * sempre o `PUBLICADO` mais próximo pra cada lado, pulando qualquer mês sem
 * ciclo ou com ciclo `RASCUNHO`/`FECHADO`.
 */
export async function buscarVizinhosCiclos(
  prisma: ClienteCiclosVizinhos,
  ano: number,
  mes: number,
  agora: Date,
): Promise<VizinhosCiclosResposta> {
  const ciclos = await prisma.ciclo.findMany({
    where: { status: 'PUBLICADO' },
    orderBy: [{ ano: 'asc' }, { mes: 'asc' }],
    select: { id: true, ano: true, mes: true, aberturaMarcacao: true, fechamentoMarcacao: true, permiteCruzada: true },
  });

  const alvo = chave(ano, mes);
  let atual: LinhaCiclo | null = null;
  let anterior: LinhaCiclo | null = null;
  let proximo: LinhaCiclo | null = null;

  for (const ciclo of ciclos) {
    const k = chave(ciclo.ano, ciclo.mes);
    if (k === alvo) atual = ciclo;
    else if (k < alvo) anterior = ciclo; // ordem crescente: a última atribuição é sempre a mais próxima do alvo.
    else if (proximo === null) proximo = ciclo; // primeira depois do alvo — nunca sobrescrita depois.
  }

  return {
    anterior: serializar(anterior, agora),
    atual: serializar(atual, agora),
    proximo: serializar(proximo, agora),
    servidorEm: agora.toISOString(),
  };
}
