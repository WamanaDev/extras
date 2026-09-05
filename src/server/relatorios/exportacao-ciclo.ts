/**
 * API-ADM-REL-002 — `GET /api/admin/relatorios/ciclo/:id/export`.
 *
 * Reusa `API-ADM-REL-001` (`./ciclo.ts`, "Fluxo": "1. Reusar `API-ADM-REL-001`")
 * e serializa o `porColaborador` do relatório em CSV/XLSX (`./csv.ts`/`./xlsx.ts`).
 *
 * ## CIA
 * "C: arquivo com nome e carga horária de toda a equipe. Auditado (`SEC-AUD`)"
 * — `registrarExportacaoCiclo` grava `EXPORTACAO_DADOS` (`AUD-2`: mesma
 * transação da ação; aqui a "ação" é só a geração do arquivo, sem mutação de
 * dado de negócio, mas o registro de auditoria continua obrigatório pelo
 * catálogo de `02-seguranca/auditoria.md`).
 * "I: cabeçalho com ciclo, data/hora de geração e id do admin" —
 * `linhasDeCabecalho` monta essas três linhas antes da tabela de dados.
 * `COLUNAS_EXPORTACAO` só referencia campos já expostos por `RelatorioCiclo`
 * (identificação do colaborador via `matricula`).
 */
import type { PrismaClient } from '@prisma/client';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria, type AtorTipo } from '@/server/audit/registrar';
import type { CelulaExportacao } from './csv';
import type { LinhaPorColaborador, RelatorioCiclo } from './ciclo';

export type FormatoExportacao = 'csv' | 'xlsx';

interface ColunaExportacao {
  chave: keyof LinhaPorColaborador;
  titulo: string;
}

/** Ordem e rótulo das colunas do arquivo — nunca inclui `id` (uuid interno, sem valor para conferência com a folha) nem qualquer campo de CPF (não existe em `LinhaPorColaborador`, ver cabeçalho do módulo). */
export const COLUNAS_EXPORTACAO: readonly ColunaExportacao[] = [
  { chave: 'matricula', titulo: 'Matrícula' },
  { chave: 'nome', titulo: 'Nome' },
  { chave: 'rt', titulo: 'RT' },
  { chave: 'plantoesBase', titulo: 'Plantões base' },
  { chave: 'extras', titulo: 'Extras' },
  { chave: 'extrasCruzadas', titulo: 'Extras cruzadas' },
  { chave: 'horasBase', titulo: 'Horas base' },
  { chave: 'horasExtras', titulo: 'Horas extras' },
  { chave: 'folgas', titulo: 'Folgas' },
  { chave: 'limite', titulo: 'Limite' },
  { chave: 'aproveitamento', titulo: 'Aproveitamento' },
];

export interface MetadadosExportacao {
  cicloId: string;
  geradoEmIso: string;
  adminId: string;
}

/** Monta a matriz de linhas (metadados de origem + cabeçalho + dados) — pura, testável sem I/O. */
export function montarLinhasExportacao(relatorio: RelatorioCiclo, metadados: MetadadosExportacao): CelulaExportacao[][] {
  const cabecalhoOrigem: CelulaExportacao[][] = [
    ['Ciclo', metadados.cicloId],
    ['Gerado em', metadados.geradoEmIso],
    ['Gerado por (admin)', metadados.adminId],
    [],
  ];
  const linhaTitulo = COLUNAS_EXPORTACAO.map((coluna) => coluna.titulo);
  const linhasDados = relatorio.porColaborador.map((linha) =>
    COLUNAS_EXPORTACAO.map((coluna) => linha[coluna.chave] as CelulaExportacao),
  );
  return [...cabecalhoOrigem, linhaTitulo, ...linhasDados];
}

export interface ParametrosAuditoriaExportacao {
  atorId: string;
  cicloId: string;
  formato: FormatoExportacao;
  registros: number;
  ip: string;
  userAgent: string;
  requestId: string;
}

/** `EXPORTACAO_DADOS` — "escopo, formato e nº de registros" (`02-seguranca/auditoria.md`, tabela "Eventos auditados"). */
export async function registrarExportacaoCiclo(prisma: PrismaClient, params: ParametrosAuditoriaExportacao): Promise<void> {
  const atorTipo: AtorTipo = 'ADMIN';
  await emTransacao(prisma, async (tx) => {
    await registrarAuditoria(tx, {
      atorTipo,
      atorId: params.atorId,
      acao: 'EXPORTACAO_DADOS',
      entidade: 'ciclo',
      entidadeId: params.cicloId,
      payload: { escopo: 'relatorio_ciclo', formato: params.formato, registros: params.registros },
      ip: params.ip,
      userAgent: params.userAgent,
      requestId: params.requestId,
    });
  });
}

export function nomeArquivoExportacao(cicloId: string, formato: FormatoExportacao): string {
  return `relatorio-ciclo-${cicloId}.${formato}`;
}

export const CONTENT_TYPE_POR_FORMATO: Record<FormatoExportacao, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
