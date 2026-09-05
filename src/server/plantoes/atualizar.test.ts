/**
 * API-ADM-PLA-003 — testes de aceitação (`specs/04-api/admin-plantoes/API-ADM-PLA-003-atualizar.md`)
 * com `tx` mockado. `validaJornada` (`@/server/services/jornada`) e
 * `travarColaboradoresComBackoff` (`./locks`) são mockados na fronteira —
 * cada um já tem cobertura própria (`jornada.test.ts`); aqui o que importa é
 * que `atualizarPlantao` os chame na ordem certa e reaja certo ao resultado.
 *
 * Teste #6 da spec ("concorrente com marcação, sem deadlock") e #7 ("lock
 * indisponível em 3s") não são reproduzíveis com um mock em processo único
 * batendo em `pg_try_advisory_xact_lock` de verdade — mesmo padrão já
 * registrado em `src/server/db/tx.test.ts`/`ciclos/criar.test.ts` para
 * concorrência real. #7 é coberto aqui pelo equivalente determinístico:
 * `travarColaboradoresComBackoff` rejeitando com `SISTEMA_OCUPADO`, que é
 * exatamente o que a função lança quando o laço de `./locks.ts` esgota o
 * prazo de 3s. #6 (ordem de locks plantão→colaborador, nunca o inverso) é
 * coberto verificando a ordem de chamadas do mock abaixo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClienteTransacao } from '@/server/db/tx';
import type { ContextoAuditoria } from './criar';
import type { AtualizarPlantaoInput } from './atualizar';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn().mockResolvedValue({ id: 'audit-1', hash: 'hash-1' }),
}));

const travarColaboradoresComBackoff = vi.fn().mockResolvedValue(undefined);
vi.mock('./locks', () => ({
  travarColaboradoresComBackoff: (...args: unknown[]) => travarColaboradoresComBackoff(...args),
}));

const validaJornada = vi.fn().mockResolvedValue(null);
vi.mock('@/server/services/jornada', () => ({
  validaJornada: (...args: unknown[]) => validaJornada(...args),
}));

const CTX: ContextoAuditoria = { atorId: 'admin-1', ip: '10.0.0.1', userAgent: 'vitest', requestId: 'req-1' };

const PLANTAO_BASE = {
  id: 'plantao-1',
  cicloId: 'ciclo-1',
  vagasTotais: 3,
  vagasOcupadas: 1,
  horaInicio: new Date(Date.UTC(1970, 0, 1, 19, 0)),
  horaFim: new Date(Date.UTC(1970, 0, 1, 7, 0)),
  inicioEm: new Date('2026-09-04T22:00:00.000Z'),
  fimEm: new Date('2026-09-05T10:00:00.000Z'),
};
const CICLO_ABERTO = { id: 'ciclo-1', status: 'RASCUNHO', maxBlocosSeguidos: 2 };

interface OverridesTx {
  plantao?: Record<string, unknown> | null;
  ciclo?: Record<string, unknown> | null;
  marcacoesConfirmadas?: Array<{ id: string; colaboradorId: string }>;
  plantaoAtualizado?: Record<string, unknown>;
}

function criarTxFake(overrides: OverridesTx = {}) {
  const chamadas: string[] = [];
  const executeRaw = vi.fn().mockImplementation(async () => {
    chamadas.push('FOR_UPDATE');
    return undefined;
  });
  const update = vi.fn().mockImplementation(async () => {
    chamadas.push('plantao.update');
    return overrides.plantaoAtualizado ?? { ...PLANTAO_BASE, ...overrides.plantao };
  });
  const updateMany = vi.fn().mockImplementation(async () => {
    chamadas.push('marcacao.updateMany');
    return { count: overrides.marcacoesConfirmadas?.length ?? 0 };
  });

  const tx = {
    $executeRaw: executeRaw,
    plantao: {
      findUnique: vi.fn().mockResolvedValue(overrides.plantao === undefined ? PLANTAO_BASE : overrides.plantao),
      update,
    },
    ciclo: { findUnique: vi.fn().mockResolvedValue(overrides.ciclo === undefined ? CICLO_ABERTO : overrides.ciclo) },
    marcacao: {
      findMany: vi.fn().mockImplementation(async () => {
        chamadas.push('marcacao.findMany');
        return overrides.marcacoesConfirmadas ?? [];
      }),
      updateMany,
    },
    escalaDia: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as ClienteTransacao;

  return { tx, chamadas, update, updateMany };
}

function input(overrides: Partial<AtualizarPlantaoInput> = {}): AtualizarPlantaoInput {
  return { ...overrides };
}

describe('API-ADM-PLA-003 — atualizarPlantao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    travarColaboradoresComBackoff.mockResolvedValue(undefined);
    validaJornada.mockResolvedValue(null);
  });

  it('1. aumentar vagas — aplicado', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx, update } = criarTxFake({ plantaoAtualizado: { ...PLANTAO_BASE, vagasTotais: 5 } });

    const resultado = await atualizarPlantao(tx, 'plantao-1', input({ vagasTotais: 5 }), CTX);

    expect(resultado.vagasTotais).toBe(5);
    expect(update.mock.calls[0]?.[0]?.data).toMatchObject({ vagasTotais: 5 });
  });

  it('2. reduzir abaixo das ocupadas — 409 VAGAS_MENOR_QUE_OCUPADAS', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx } = criarTxFake(); // vagasOcupadas: 1

    await expect(atualizarPlantao(tx, 'plantao-1', input({ vagasTotais: 0 }), CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'VAGAS_MENOR_QUE_OCUPADAS',
    });
  });

  it('3. alterar horário sem marcações confirmadas — aplicado sem locks nem revalidação de jornada', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx, update } = criarTxFake({ marcacoesConfirmadas: [] });

    const resultado = await atualizarPlantao(tx, 'plantao-1', input({ horaInicio: '20:00', horaFim: '08:00' }), CTX);

    expect(update).toHaveBeenCalled();
    expect(travarColaboradoresComBackoff).not.toHaveBeenCalled();
    expect(validaJornada).not.toHaveBeenCalled();
    expect(resultado).toBeDefined();
  });

  it('3b. alterar horário com marcações confirmadas sem confirmarImpacto — 409 IMPACTO_NAO_CONFIRMADO, nada aplicado', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx, update } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    const erro = await atualizarPlantao(tx, 'plantao-1', input({ horaInicio: '20:00' }), CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'IMPACTO_NAO_CONFIRMADO' });
    expect(erro.detalhes).toHaveProperty('afetado_0', 'colab-1');
    expect(update).not.toHaveBeenCalled();
  });

  it('4. alterar horário com marcações, confirmado — intervalos propagados na mesma transação', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const plantaoAtualizado = {
      ...PLANTAO_BASE,
      inicioEm: new Date('2026-09-04T23:00:00.000Z'),
      fimEm: new Date('2026-09-05T11:00:00.000Z'),
    };
    const { tx, updateMany } = criarTxFake({
      marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }],
      plantaoAtualizado,
    });

    await atualizarPlantao(tx, 'plantao-1', input({ horaInicio: '20:00', horaFim: '08:00', confirmarImpacto: true }), CTX);

    expect(updateMany).toHaveBeenCalledWith({
      where: { plantaoId: 'plantao-1', status: 'CONFIRMADA' },
      data: { inicioEm: plantaoAtualizado.inicioEm, fimEm: plantaoAtualizado.fimEm },
    });
  });

  it('5. alteração criando jornada inválida (36h) para alguém — 409 com a lista', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    validaJornada.mockResolvedValue('EXCEDE_JORNADA');
    const { tx } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    const erro = await atualizarPlantao(
      tx,
      'plantao-1',
      input({ horaInicio: '20:00', horaFim: '08:00', confirmarImpacto: true }),
      CTX,
    ).catch((e) => e);

    expect(erro).toMatchObject({ status: 409, codigo: 'EXCEDE_JORNADA' });
    expect(erro.detalhes).toHaveProperty('afetado_0', 'colab-1:EXCEDE_JORNADA');
  });

  it('6. ordem de locks — plantão (FOR UPDATE) antes de colaborador (advisory lock), nunca o inverso', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx, chamadas } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });
    travarColaboradoresComBackoff.mockImplementation(async () => {
      chamadas.push('travarColaboradoresComBackoff');
    });

    await atualizarPlantao(tx, 'plantao-1', input({ horaInicio: '20:00', confirmarImpacto: true }), CTX);

    expect(chamadas.indexOf('FOR_UPDATE')).toBeLessThan(chamadas.indexOf('travarColaboradoresComBackoff'));
  });

  it('7. lock de colaborador indisponível em 3s — SISTEMA_OCUPADO (503), nada aplicado', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { ErroHttp } = await import('@/server/http/erros');
    travarColaboradoresComBackoff.mockRejectedValue(
      new ErroHttp({ status: 503, codigo: 'SISTEMA_OCUPADO', mensagem: 'Sistema ocupado no momento. Tente novamente em instantes.', retryAfterSegundos: 1 }),
    );
    const { tx, update } = criarTxFake({ marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }] });

    const erro = await atualizarPlantao(tx, 'plantao-1', input({ horaInicio: '20:00', confirmarImpacto: true }), CTX).catch((e) => e);

    expect(erro).toMatchObject({ status: 503, codigo: 'SISTEMA_OCUPADO' });
    expect(update).not.toHaveBeenCalled();
  });

  it('8. intervalo de marcacao vs plantao após update — idênticos (mesmo objeto Date do plantão atualizado)', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const plantaoAtualizado = {
      ...PLANTAO_BASE,
      inicioEm: new Date('2026-09-04T23:00:00.000Z'),
      fimEm: new Date('2026-09-05T11:00:00.000Z'),
    };
    const { tx, updateMany } = criarTxFake({
      marcacoesConfirmadas: [{ id: 'marc-1', colaboradorId: 'colab-1' }, { id: 'marc-2', colaboradorId: 'colab-2' }],
      plantaoAtualizado,
    });

    await atualizarPlantao(tx, 'plantao-1', input({ horaInicio: '20:00', horaFim: '08:00', confirmarImpacto: true }), CTX);

    const dadosPropagados = updateMany.mock.calls[0]?.[0]?.data;
    expect(dadosPropagados.inicioEm).toEqual(plantaoAtualizado.inicioEm);
    expect(dadosPropagados.fimEm).toEqual(plantaoAtualizado.fimEm);
  });

  it('ciclo fechado — 409 CICLO_FECHADO', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx } = criarTxFake({ ciclo: { ...CICLO_ABERTO, status: 'FECHADO' } });

    await expect(atualizarPlantao(tx, 'plantao-1', input({ vagasTotais: 5 }), CTX)).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_FECHADO',
    });
  });

  it('plantão inexistente — 404, nunca 403', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx } = criarTxFake({ plantao: null });

    await expect(atualizarPlantao(tx, 'plantao-x', input({ vagasTotais: 5 }), CTX)).rejects.toMatchObject({ status: 404 });
  });

  it('auditoria antes → depois', async () => {
    const { atualizarPlantao } = await import('./atualizar');
    const { tx } = criarTxFake({ plantaoAtualizado: { ...PLANTAO_BASE, vagasTotais: 5 } });

    await atualizarPlantao(tx, 'plantao-1', input({ vagasTotais: 5 }), CTX);

    const { registrarAuditoria } = await import('@/server/audit/registrar');
    expect(registrarAuditoria).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        acao: 'PLANTAO_ALTERADO',
        payload: expect.objectContaining({ antes: expect.anything(), depois: expect.objectContaining({ vagasTotais: 5 }) }),
      }),
    );
  });
});
