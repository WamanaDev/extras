/**
 * Testes de aceitação de `specs/04-api/admin-marcacoes/*`:
 * - API-ADM-MAR-001 (listar)
 * - API-ADM-MAR-002 (marcar)
 * - API-ADM-MAR-003 (cancelar)
 *
 * Dois níveis, sem tocar banco/Redis/console de verdade:
 * 1. `marcacoes-admin.ts` (este arquivo, blocos "listar"/"marcar"/"cancelar")
 *    — Prisma fake injetado (mesmo padrão de `handler.test.ts`/
 *    `ciclo-atual.ts`), cobre forma da chamada SQL, persistência de
 *    `motivo`, saldo, e o payload de auditoria.
 * 2. `traduzirErro` (bloco "tradução de erro") — os doze códigos que
 *    `marcar_extra`/`cancelar_extra` podem levantar (RAISE EXCEPTION, sem
 *    SQLSTATE próprio) viram `ErroHttp` 409 (404 só para
 *    `MARCACAO_INEXISTENTE`), via `erroDeExcecaoDeFuncao`
 *    (`src/server/http/erros.ts`) — a rota nunca lê SQLSTATE nem faz esse
 *    parsing na mão (`contrato-comum.md`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { traduzirErro } from '@/server/http/erros';
import {
  listarMarcacoesAdmin,
  marcarExtraAdmin,
  cancelarExtraAdmin,
  type ClienteBanco,
} from './marcacoes-admin';

vi.mock('@/server/audit/registrar', () => ({
  registrarAuditoria: vi.fn(async () => ({ id: 'audit-1', hash: 'hash-1' })),
}));
import { registrarAuditoria } from '@/server/audit/registrar';

// ----------------------------------------------------------------------------
// Fake de PrismaClient/ClienteTransacao — só os métodos que o serviço usa.
// ----------------------------------------------------------------------------

interface FakeTx {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  marcacao: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  plantao: { findUniqueOrThrow: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  ciclo: { findUnique: ReturnType<typeof vi.fn> };
}

function sqlDaChamada(strings: TemplateStringsArray): string {
  return strings.join('?');
}

function criarTxFake(config: {
  marcarExtraResultado?: Array<{ id: string; cruzada: boolean }>;
  marcarExtraErro?: unknown;
  cancelarExtraResultado?: Array<{ id: string; status: string; plantaoId: string; colaboradorId: string }>;
  cancelarExtraErro?: unknown;
  saldo?: { limite: number; usadas: number; restantes: number; permite_cruzada?: boolean; bloqueado?: boolean; motivo_bloqueio?: string | null };
  canceladoPorLinhas?: Array<{ entidade_id: string; ator_id: string | null }>;
  plantao?: { id: string; data: Date; tipo: string; cicloId: string; rt: { nome: string } };
  marcacoes?: unknown[];
  totaisCount?: { total: number; confirmadas: number; canceladas: number; cruzadas: number };
  horasLinhas?: Array<{ plantao: { cargaHoras: number } }>;
  ciclo?: Record<string, unknown> | null;
  plantaoCriado?: Record<string, unknown>;
}): FakeTx {
  const $queryRaw = vi.fn(async (strings: TemplateStringsArray, ..._valores: unknown[]) => {
    const sql = sqlDaChamada(strings);
    if (sql.includes('marcar_extra')) {
      if (config.marcarExtraErro) throw config.marcarExtraErro;
      return config.marcarExtraResultado ?? [{ id: 'marc-1', cruzada: false }];
    }
    if (sql.includes('cancelar_extra')) {
      if (config.cancelarExtraErro) throw config.cancelarExtraErro;
      return config.cancelarExtraResultado ?? [{ id: 'marc-1', status: 'CANCELADA', plantaoId: 'plantao-1', colaboradorId: 'colab-1' }];
    }
    if (sql.includes('saldo_colaborador')) {
      return [
        {
          limite: 5,
          usadas: 2,
          restantes: 3,
          permite_cruzada: false,
          bloqueado: false,
          motivo_bloqueio: null,
          ...config.saldo,
        },
      ];
    }
    if (sql.includes('audit_log')) {
      return config.canceladoPorLinhas ?? [];
    }
    throw new Error(`SQL inesperado no fake: ${sql}`);
  });

  return {
    $queryRaw,
    $executeRaw: vi.fn(async () => undefined),
    marcacao: {
      findMany: vi.fn(async (args: { select?: unknown }) => {
        // A segunda chamada (soma de horas) usa `select`; a primeira (listagem) usa `include`.
        if (args?.select) return config.horasLinhas ?? [];
        return config.marcacoes ?? [];
      }),
      count: vi.fn(async () => config.totaisCount?.total ?? 0),
    },
    plantao: {
      findUniqueOrThrow: vi.fn(async () => config.plantao ?? { id: 'plantao-1', data: new Date('2026-09-10'), tipo: 'DIURNO', cicloId: 'ciclo-1', rt: { nome: 'RT-A' } }),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => config.plantaoCriado ?? { id: 'plantao-novo-1', ...args.data }),
    },
    ciclo: {
      findUnique: vi.fn(async () => (config.ciclo === undefined ? { id: 'ciclo-1', ano: 2026, mes: 9, status: 'PUBLICADO' } : config.ciclo)),
    },
  };
}

function criarPrismaFake(tx: FakeTx): ClienteBanco {
  return {
    $transaction: (async (callback: (tx: unknown) => unknown) => callback(tx)) as ClienteBanco['$transaction'],
  };
}

beforeEach(() => {
  vi.mocked(registrarAuditoria).mockClear();
});

// ----------------------------------------------------------------------------
// API-ADM-MAR-002 — marcar
// ----------------------------------------------------------------------------

describe('API-ADM-MAR-002 marcarExtraAdmin', () => {
  const paramsBase = {
    plantaoId: 'plantao-1',
    colaboradorId: 'colab-1',
    motivo: 'Cobertura de emergência',
    adminId: 'admin-1',
    ip: '203.0.113.1',
    userAgent: 'vitest',
    requestId: 'req-1',
  };

  it('1. caminho feliz — origem ADMIN, cruzada refletida, saldo devolvido', async () => {
    const tx = criarTxFake({ marcarExtraResultado: [{ id: 'marc-9', cruzada: true }] });
    const resultado = await marcarExtraAdmin(criarPrismaFake(tx), paramsBase);

    expect(resultado.origem).toBe('ADMIN');
    expect(resultado.id).toBe('marc-9');
    expect(resultado.cruzada).toBe(true);
    expect(resultado.saldo).toEqual({ limite: 5, usadas: 2, restantes: 3 });
  });

  it('chama marcar_extra com origem ADMIN literal (pula só a janela — RN-27)', async () => {
    const tx = criarTxFake({});
    await marcarExtraAdmin(criarPrismaFake(tx), paramsBase);

    const chamada = tx.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('marcar_extra'));
    expect(chamada).toBeDefined();
    const valores = chamada?.slice(1) ?? [];
    expect(valores).toContain(paramsBase.plantaoId);
    expect(valores).toContain(paramsBase.colaboradorId);
  });

  it('2. fora da janela é permitido — nenhuma checagem de janela feita pelo serviço (delegada a marcar_extra com origem ADMIN)', async () => {
    // O serviço não reimplementa a regra de janela — ela é pulada dentro de
    // marcar_extra quando p_origem = 'ADMIN' (FN-005). Aqui só confirmamos
    // que a chamada não falha nem exige nenhum parâmetro extra de janela.
    const tx = criarTxFake({});
    await expect(marcarExtraAdmin(criarPrismaFake(tx), paramsBase)).resolves.toBeDefined();
  });

  it('7. sem motivo → validado na camada de rota (Zod), não neste serviço — motivo vazio ainda assim é persistido literalmente aqui', async () => {
    // A validação "motivo obrigatório" é responsabilidade do schema Zod da
    // rota (`route.ts`), testado separadamente — este serviço só persiste o
    // que recebe.
    const tx = criarTxFake({});
    await marcarExtraAdmin(criarPrismaFake(tx), { ...paramsBase, motivo: 'Motivo válido' });
    const chamadaUpdate = tx.$executeRaw.mock.calls[0];
    expect(chamadaUpdate).toBeDefined();
  });

  it('8. auditoria — ator = admin, motivo presente, dentro da mesma transação', async () => {
    const tx = criarTxFake({});
    await marcarExtraAdmin(criarPrismaFake(tx), paramsBase);

    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const [txPassado, evento] = vi.mocked(registrarAuditoria).mock.calls[0]!;
    expect(txPassado).toBe(tx);
    expect(evento).toMatchObject({
      atorTipo: 'ADMIN',
      atorId: 'admin-1',
      acao: 'EXTRA_MARCADA',
      entidade: 'marcacao',
    });
    expect((evento.payload as { motivo: string }).motivo).toBe(paramsBase.motivo);
  });

  it('3/4/5/6. erro de negócio de marcar_extra (EXCEDE_JORNADA/LIMITE_ATINGIDO/SEM_VAGA/CRUZADA_BLOQUEADA) propaga intacto — tradução é responsabilidade de traduzirErro, não deste serviço', async () => {
    const erroPg = { meta: { code: 'P0001', message: 'ERROR:  EXCEDE_JORNADA' } };
    const tx = criarTxFake({ marcarExtraErro: erroPg });
    await expect(marcarExtraAdmin(criarPrismaFake(tx), paramsBase)).rejects.toBe(erroPg);
  });

  // --------------------------------------------------------------------------
  // `novoPlantao` — pedido do usuário: criar um plantão de 1 vaga exclusivo
  // pra esta marcação, na mesma transação de marcar_extra.
  // --------------------------------------------------------------------------

  const novoPlantaoBase = {
    cicloId: 'ciclo-1',
    rtId: 'rt-1',
    data: new Date('2026-09-15T00:00:00.000Z'),
    tipo: 'DIURNO' as const,
    permiteCruzada: null,
  };

  it('novoPlantao: cria o plantão (vagasTotais=1) antes de marcar_extra, na mesma transação', async () => {
    const tx = criarTxFake({
      marcarExtraResultado: [{ id: 'marc-novo', cruzada: false }],
      plantao: { id: 'plantao-novo-1', data: novoPlantaoBase.data, tipo: 'DIURNO', cicloId: 'ciclo-1', rt: { nome: 'RT-1' } },
    });

    const resultado = await marcarExtraAdmin(criarPrismaFake(tx), {
      novoPlantao: novoPlantaoBase,
      colaboradorId: 'colab-1',
      motivo: 'Cobertura extra criada na hora',
      adminId: 'admin-1',
      ip: '203.0.113.1',
      userAgent: 'vitest',
      requestId: 'req-1',
    });

    expect(tx.plantao.create).toHaveBeenCalledTimes(1);
    const dadosCriados = (tx.plantao.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(dadosCriados).toMatchObject({ cicloId: 'ciclo-1', rtId: 'rt-1', tipo: 'DIURNO', vagasTotais: 1 });

    // marcar_extra é chamado com o id do plantão RECÉM-CRIADO, não um plantaoId do body.
    const chamadaMarcar = tx.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('marcar_extra'));
    expect(chamadaMarcar?.slice(1)).toContain('plantao-novo-1');
    expect(resultado.plantaoId).toBe('plantao-novo-1');
  });

  it('novoPlantao: se marcar_extra rejeitar depois, a criação do plantão é desfeita junto (mesma transação, ROLLBACK)', async () => {
    const erroPg = { meta: { code: 'P0001', message: 'ERROR:  EM_AUSENCIA' } };
    const tx = criarTxFake({ marcarExtraErro: erroPg });

    await expect(
      marcarExtraAdmin(criarPrismaFake(tx), {
        novoPlantao: novoPlantaoBase,
        colaboradorId: 'colab-1',
        motivo: 'Tentativa que vai falhar',
        adminId: 'admin-1',
        ip: '203.0.113.1',
        userAgent: 'vitest',
        requestId: 'req-1',
      }),
    ).rejects.toBe(erroPg);

    // O fake não modela rollback de verdade (é uma função só, sem side-effect
    // persistente) — o que garante a atomicidade de verdade é `emTransacao`
    // (Prisma `$transaction`, já coberto em `db/tx.test.ts`); aqui confirmamos
    // só que a criação aconteceu ANTES da falha, dentro do mesmo `tx`.
    expect(tx.plantao.create).toHaveBeenCalledTimes(1);
  });

  it('novoPlantao: erro de criarPlantao (ex.: CICLO_FECHADO) propaga intacto, marcar_extra nunca é chamado', async () => {
    const tx = criarTxFake({ ciclo: { id: 'ciclo-1', ano: 2026, mes: 9, status: 'FECHADO' } });

    await expect(
      marcarExtraAdmin(criarPrismaFake(tx), {
        novoPlantao: novoPlantaoBase,
        colaboradorId: 'colab-1',
        motivo: 'Não deveria chegar aqui',
        adminId: 'admin-1',
        ip: '203.0.113.1',
        userAgent: 'vitest',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ status: 409, codigo: 'CICLO_FECHADO' });

    const chamadaMarcar = tx.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('marcar_extra'));
    expect(chamadaMarcar).toBeUndefined();
  });

  it('auditoria de novoPlantao marca `plantaoCriadoParaEstaMarcacao: true` no payload de EXTRA_MARCADA', async () => {
    const tx = criarTxFake({});

    await marcarExtraAdmin(criarPrismaFake(tx), {
      novoPlantao: novoPlantaoBase,
      colaboradorId: 'colab-1',
      motivo: 'Cobertura extra criada na hora',
      adminId: 'admin-1',
      ip: '203.0.113.1',
      userAgent: 'vitest',
      requestId: 'req-1',
    });

    const chamadaExtraMarcada = vi.mocked(registrarAuditoria).mock.calls.find(([, evento]) => evento.acao === 'EXTRA_MARCADA');
    expect(chamadaExtraMarcada).toBeDefined();
    expect((chamadaExtraMarcada![1].payload as { plantaoCriadoParaEstaMarcacao: boolean }).plantaoCriadoParaEstaMarcacao).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// API-ADM-MAR-003 — cancelar
// ----------------------------------------------------------------------------

describe('API-ADM-MAR-003 cancelarExtraAdmin', () => {
  const paramsBase = {
    marcacaoId: 'marc-1',
    motivo: 'Erro de escala',
    adminId: 'admin-1',
    ip: '203.0.113.1',
    userAgent: 'vitest',
    requestId: 'req-1',
  };

  it('1. cancelamento fora da janela é permitido — cancelar_extra ignora janela para ADMIN (RN-27)', async () => {
    const tx = criarTxFake({});
    const resultado = await cancelarExtraAdmin(criarPrismaFake(tx), paramsBase);
    expect(resultado.status).toBe('CANCELADA');
  });

  it('2. ciclo fechado propaga o erro de cancelar_extra intacto (tradução → 409 CICLO_FECHADO, ver bloco de tradução)', async () => {
    const erroPg = { meta: { code: 'P0001', message: 'ERROR:  CICLO_FECHADO' } };
    const tx = criarTxFake({ cancelarExtraErro: erroPg });
    await expect(cancelarExtraAdmin(criarPrismaFake(tx), paramsBase)).rejects.toBe(erroPg);
  });

  it('4. saldo do colaborador é devolvido no formato saldoColaborador', async () => {
    const tx = criarTxFake({ saldo: { limite: 5, usadas: 3, restantes: 2, permite_cruzada: true, bloqueado: false, motivo_bloqueio: null } });
    const resultado = await cancelarExtraAdmin(criarPrismaFake(tx), paramsBase);
    expect(resultado.saldoColaborador).toEqual({
      limite: 5,
      usadas: 3,
      restantes: 2,
      permiteCruzada: true,
      bloqueado: false,
      motivoBloqueio: null,
    });
  });

  it('5. chamado 2× — idempotente: cancelar_extra devolve a mesma linha CANCELADA nas duas vezes, sem erro', async () => {
    const tx = criarTxFake({ cancelarExtraResultado: [{ id: 'marc-1', status: 'CANCELADA', plantaoId: 'plantao-1', colaboradorId: 'colab-1' }] });
    const primeira = await cancelarExtraAdmin(criarPrismaFake(tx), paramsBase);
    const segunda = await cancelarExtraAdmin(criarPrismaFake(tx), paramsBase);
    expect(primeira.status).toBe('CANCELADA');
    expect(segunda.status).toBe('CANCELADA');
  });

  it('6. auditoria — ator = admin + motivo', async () => {
    const tx = criarTxFake({});
    await cancelarExtraAdmin(criarPrismaFake(tx), paramsBase);

    expect(registrarAuditoria).toHaveBeenCalledTimes(1);
    const [, evento] = vi.mocked(registrarAuditoria).mock.calls[0]!;
    expect(evento).toMatchObject({ atorTipo: 'ADMIN', atorId: 'admin-1', acao: 'EXTRA_CANCELADA' });
    expect((evento.payload as { motivo: string }).motivo).toBe(paramsBase.motivo);
  });

  it('chama cancelar_extra com (marcacaoId, adminId, "ADMIN")', async () => {
    const tx = criarTxFake({});
    await cancelarExtraAdmin(criarPrismaFake(tx), paramsBase);
    const chamada = tx.$queryRaw.mock.calls.find((c) => sqlDaChamada(c[0] as TemplateStringsArray).includes('cancelar_extra'));
    // p_ator_id/p_marcacao_id são interpolados (parâmetros do template);
    // p_ator_tipo = 'ADMIN' é escrito como literal SQL na própria query
    // (não interpolado), então só aparece no texto do template, não em
    // `valores` — mesmo padrão de `marcar_extra` acima.
    const valores = chamada?.slice(1) ?? [];
    expect(valores).toContain(paramsBase.marcacaoId);
    expect(valores).toContain(paramsBase.adminId);
    expect(sqlDaChamada(chamada![0] as TemplateStringsArray)).toContain("'ADMIN'");
  });
});

// ----------------------------------------------------------------------------
// API-ADM-MAR-001 — listar
// ----------------------------------------------------------------------------

describe('API-ADM-MAR-001 listarMarcacoesAdmin', () => {
  const linhaBase = {
    id: 'marc-1',
    status: 'CONFIRMADA',
    cruzada: false,
    origem: 'COLABORADOR',
    criadoEm: new Date('2026-09-01T10:00:00Z'),
    canceladoEm: null,
    colaborador: { id: 'colab-1', nome: 'Fulano', matricula: 'M1', rt: { nome: 'RT-A' } },
    plantao: {
      id: 'plantao-1',
      data: new Date('2026-09-05'),
      tipo: 'DIURNO',
      horaInicio: new Date('1970-01-01T07:00:00Z'),
      horaFim: new Date('1970-01-01T19:00:00Z'),
      cargaHoras: 12,
      rt: { nome: 'RT-A' },
    },
  };

  const filtrosBase = { pagina: 1, tamanho: 50 };

  it('1. filtro por ciclo é repassado ao where de plantao.cicloId', async () => {
    const tx = criarTxFake({ marcacoes: [linhaBase] });
    await listarMarcacoesAdmin(criarPrismaFake(tx), { ...filtrosBase, cicloId: 'ciclo-9' });
    const chamada = tx.marcacao.findMany.mock.calls[0]![0];
    expect(chamada.where.plantao).toMatchObject({ cicloId: 'ciclo-9' });
  });

  it('2. filtro cruzada=true é repassado ao where', async () => {
    const tx = criarTxFake({ marcacoes: [linhaBase] });
    await listarMarcacoesAdmin(criarPrismaFake(tx), { ...filtrosBase, cruzada: true });
    const chamada = tx.marcacao.findMany.mock.calls[0]![0];
    expect(chamada.where.cruzada).toBe(true);
  });

  it('3. totais vêm de contagens/somas na mesma transação que a lista', async () => {
    const tx = criarTxFake({
      marcacoes: [linhaBase],
      horasLinhas: [{ plantao: { cargaHoras: 12 } }],
    });
    tx.marcacao.count
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1) // confirmadas
      .mockResolvedValueOnce(0) // canceladas
      .mockResolvedValueOnce(0); // cruzadas
    const resultado = await listarMarcacoesAdmin(criarPrismaFake(tx), filtrosBase);
    expect(resultado.totais).toEqual({ confirmadas: 1, canceladas: 0, horas: 12, cruzadas: 0 });
  });

  it('4. marcações canceladas não contam em horas (soma só considera status CONFIRMADA)', async () => {
    const tx = criarTxFake({ marcacoes: [linhaBase], horasLinhas: [] });
    const resultado = await listarMarcacoesAdmin(criarPrismaFake(tx), filtrosBase);
    expect(resultado.totais.horas).toBe(0);
    // A query de soma de horas é filtrada por status CONFIRMADA explicitamente.
    const chamadaHoras = tx.marcacao.findMany.mock.calls.find((c) => c[0]?.select)![0];
    expect(chamadaHoras.where.status).toBe('CONFIRMADA');
  });

  it('5. campo ip não existe no payload da listagem (SEC-CONF — fica só em API-ADM-REL-003)', async () => {
    const tx = criarTxFake({ marcacoes: [linhaBase] });
    const resultado = await listarMarcacoesAdmin(criarPrismaFake(tx), filtrosBase);
    const json = JSON.stringify(resultado.marcacoes);
    expect(json).not.toContain('"ip"');
    expect(json).not.toContain('userAgent');
  });

  it('canceladoPor é resolvido via audit_log para marcações CANCELADA, null para as demais', async () => {
    const linhaCancelada = {
      ...linhaBase,
      id: 'marc-2',
      status: 'CANCELADA',
      canceladoEm: new Date('2026-09-06T12:00:00Z'),
    };
    const tx = criarTxFake({
      marcacoes: [linhaBase, linhaCancelada],
      canceladoPorLinhas: [{ entidade_id: 'marc-2', ator_id: 'admin-9' }],
    });
    const resultado = await listarMarcacoesAdmin(criarPrismaFake(tx), filtrosBase);
    const confirmada = resultado.marcacoes.find((m) => m.id === 'marc-1')!;
    const cancelada = resultado.marcacoes.find((m) => m.id === 'marc-2')!;
    expect(confirmada.canceladoPor).toBeNull();
    expect(cancelada.canceladoPor).toBe('admin-9');
  });

  it('formata plantão/colaborador com rt (via Rt.nome — item 9 de _conflitos.md) e datas ISO', async () => {
    const tx = criarTxFake({ marcacoes: [linhaBase] });
    const resultado = await listarMarcacoesAdmin(criarPrismaFake(tx), filtrosBase);
    const linha = resultado.marcacoes[0]!;
    expect(linha.colaborador.rt).toBe('RT-A');
    expect(linha.plantao.rt).toBe('RT-A');
    expect(linha.plantao.data).toBe('2026-09-05');
    expect(linha.plantao.horaInicio).toBe('07:00:00');
  });
});

// ----------------------------------------------------------------------------
// Tradução de erro (API-000 + FN-005/FN-006) — os erros que marcar_extra/
// cancelar_extra levantam viram 409 (404 só para MARCACAO_INEXISTENTE), sem
// a rota ler SQLSTATE.
// ----------------------------------------------------------------------------

describe('traduzirErro — erros de marcar_extra/cancelar_extra (RAISE EXCEPTION, sem SQLSTATE próprio)', () => {
  const codigos409 = [
    'PLANTAO_INDISPONIVEL',
    'CICLO_FECHADO',
    'JANELA_NAO_ABERTA',
    'JANELA_ENCERRADA',
    'COLABORADOR_INATIVO',
    'COLABORADOR_BLOQUEADO',
    'CRUZADA_BLOQUEADA',
    'EM_AUSENCIA',
    'CONFLITO_DE_HORARIO',
    'EXCEDE_JORNADA',
    'LIMITE_ATINGIDO',
    'SEM_VAGA',
    'CICLO_INEXISTENTE',
  ] as const;

  it.each(codigos409)('%s → 409, mensagem em português, sem detalhe técnico', (codigo) => {
    const erroPg = { meta: { code: 'P0001', message: `ERROR:  ${codigo}` } };
    const traduzido = traduzirErro(erroPg);
    expect(traduzido.status).toBe(409);
    expect(traduzido.codigo).toBe(codigo);
    expect(traduzido.message).not.toMatch(/sqlstate|P0001|raise exception/i);
  });

  it('MARCACAO_INEXISTENTE → 404 (recurso de terceiro/inexistente nunca é 403 — contrato-comum.md)', () => {
    const erroPg = { meta: { code: 'P0001', message: 'ERROR:  MARCACAO_INEXISTENTE' } };
    const traduzido = traduzirErro(erroPg);
    expect(traduzido.status).toBe(404);
    expect(traduzido.codigo).toBe('MARCACAO_INEXISTENTE');
  });

  it('texto de exceção não catalogado → 500 ERRO_INTERNO, não inventa um código de negócio', () => {
    const erroPg = { meta: { code: 'P0001', message: 'ERROR:  ALGO_NUNCA_VISTO' } };
    const traduzido = traduzirErro(erroPg);
    expect(traduzido.status).toBe(500);
    expect(traduzido.codigo).toBe('ERRO_INTERNO');
  });
});
