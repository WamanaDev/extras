/**
 * API-ADM-REL-002 — Testes de aceitação #3 ("Auditoria registrada"),
 * #4 ("Cabeçalho de origem presente") e #5 ("Colunas da exportação batem com
 * `COLUNAS_EXPORTACAO`, identificação por matrícula").
 * (#1/#2 — CSV/XLSX — estão em `./csv.test.ts`/`./xlsx.test.ts`.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  COLUNAS_EXPORTACAO,
  montarLinhasExportacao,
  nomeArquivoExportacao,
  registrarExportacaoCiclo,
  CONTENT_TYPE_POR_FORMATO,
} from './exportacao-ciclo';
import type { RelatorioCiclo } from './ciclo';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const RELATORIO: RelatorioCiclo = {
  porColaborador: [
    {
      id: 'colab-1',
      nome: 'Fulano de Tal',
      matricula: '0001',
      rt: 'RT1',
      plantoesBase: 10,
      extras: 2,
      extrasCruzadas: 1,
      horasBase: 120,
      horasExtras: 14,
      folgas: 4,
      limite: 4,
      aproveitamento: 0.5,
    },
  ],
  porRt: [],
  resumo: { colaboradores: 1, extrasTotais: 2, horasTotais: 134, vagasNaoPreenchidas: 0 },
};

describe('montarLinhasExportacao (API-ADM-REL-002)', () => {
  it('#4 cabeçalho com ciclo, data/hora de geração e id do admin', () => {
    const linhas = montarLinhasExportacao(RELATORIO, {
      cicloId: 'ciclo-1',
      geradoEmIso: '2026-09-04T12:00:00.000Z',
      adminId: 'admin-1',
    });

    expect(linhas[0]).toEqual(['Ciclo', 'ciclo-1']);
    expect(linhas[1]).toEqual(['Gerado em', '2026-09-04T12:00:00.000Z']);
    expect(linhas[2]).toEqual(['Gerado por (admin)', 'admin-1']);
  });

  it('#5 identificação do colaborador via matrícula — nenhuma coluna referencia CPF', () => {
    expect(COLUNAS_EXPORTACAO.some((c) => /cpf/i.test(c.chave) || /cpf/i.test(c.titulo))).toBe(false);
    expect(COLUNAS_EXPORTACAO.some((c) => c.chave === 'matricula')).toBe(true);

    const linhas = montarLinhasExportacao(RELATORIO, {
      cicloId: 'ciclo-1',
      geradoEmIso: '2026-09-04T12:00:00.000Z',
      adminId: 'admin-1',
    });
    const conteudo = JSON.stringify(linhas);
    expect(conteudo).toContain(RELATORIO.porColaborador[0]?.matricula);
  });

  it('linha de título segue a ordem de COLUNAS_EXPORTACAO e dados batem com o relatório', () => {
    const linhas = montarLinhasExportacao(RELATORIO, {
      cicloId: 'ciclo-1',
      geradoEmIso: '2026-09-04T12:00:00.000Z',
      adminId: 'admin-1',
    });
    const linhaTitulo = linhas[4];
    expect(linhaTitulo).toEqual(COLUNAS_EXPORTACAO.map((c) => c.titulo));
    const linhaDados = linhas[5];
    expect(linhaDados).toEqual(['0001', 'Fulano de Tal', 'RT1', 10, 2, 1, 120, 14, 4, 4, 0.5]);
  });
});

describe('registrarExportacaoCiclo (API-ADM-REL-002, #3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('grava EXPORTACAO_DADOS com escopo, formato e contagem', async () => {
    const tx = {};
    const prisma = { $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)) } as unknown as PrismaClient;

    await registrarExportacaoCiclo(prisma, {
      atorId: 'admin-1',
      cicloId: 'ciclo-1',
      formato: 'csv',
      registros: 42,
      ip: '10.0.0.1',
      userAgent: 'vitest',
      requestId: 'req-1',
    });

    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        atorTipo: 'ADMIN',
        atorId: 'admin-1',
        acao: 'EXPORTACAO_DADOS',
        entidade: 'ciclo',
        entidadeId: 'ciclo-1',
        payload: { escopo: 'relatorio_ciclo', formato: 'csv', registros: 42 },
      }),
    );
  });
});

describe('nomeArquivoExportacao / CONTENT_TYPE_POR_FORMATO', () => {
  it('nomeia o arquivo com a extensão do formato', () => {
    expect(nomeArquivoExportacao('ciclo-1', 'csv')).toBe('relatorio-ciclo-ciclo-1.csv');
    expect(nomeArquivoExportacao('ciclo-1', 'xlsx')).toBe('relatorio-ciclo-ciclo-1.xlsx');
  });

  it('content-type correto por formato', () => {
    expect(CONTENT_TYPE_POR_FORMATO.csv).toBe('text/csv; charset=utf-8');
    expect(CONTENT_TYPE_POR_FORMATO.xlsx).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  });
});
