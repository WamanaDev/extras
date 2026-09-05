/**
 * Testes de aceitação de `API-ADM-PAR-002` (tabela "Testes de aceitação" da
 * spec, linhas 1-6). Mesmo padrão de fake de `./definir.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { ErroHttp } from '@/server/http/erros';
import { aplicarParticipacaoEmLote, TETO_LOTE, type EntradaLoteParticipacao } from './lote';
import type {
  CicloResumo,
  ColaboradorResumo,
  EventoAuditoriaEntrada,
  FiltroLote,
  ParticipacaoResumo,
  PortaParticipacoes,
} from './tipos';

const CICLO_ID = 'ciclo-1';

interface Registro extends ColaboradorResumo {
  rtId: string;
  turno: 'DIURNO' | 'NOTURNO';
  usadas: number;
  participacao: ParticipacaoResumo | null;
}

interface FakeState {
  ciclo: CicloResumo | null;
  colaboradores: Registro[];
  chamadas: string[];
  travados: string[][];
  auditorias: EventoAuditoriaEntrada[];
  salvos: Record<string, unknown>;
}

function criarFake(colaboradores: Registro[], overrides: Partial<FakeState> = {}): { porta: PortaParticipacoes; estado: FakeState } {
  const estado: FakeState = {
    ciclo: { id: CICLO_ID, status: 'PUBLICADO', limitePadrao: 5 },
    colaboradores,
    chamadas: [],
    travados: [],
    auditorias: [],
    salvos: {},
    ...overrides,
  };

  const porta: PortaParticipacoes = {
    async buscarCiclo() {
      return estado.ciclo;
    },
    async buscarColaborador(colaboradorId) {
      const c = estado.colaboradores.find((x) => x.id === colaboradorId);
      return c ? { id: c.id, nome: c.nome } : null;
    },
    async buscarColaboradoresPorFiltro(filtro: FiltroLote) {
      estado.chamadas.push('buscarColaboradoresPorFiltro');
      return estado.colaboradores
        .filter((c) => (filtro.rtId ? c.rtId === filtro.rtId : true))
        .filter((c) => (filtro.turno ? c.turno === filtro.turno : true))
        .filter((c) => (filtro.colaboradorIds ? filtro.colaboradorIds.includes(c.id) : true))
        .map((c) => ({ id: c.id, nome: c.nome }));
    },
    async buscarParticipacao(_cicloId, colaboradorId) {
      return estado.colaboradores.find((c) => c.id === colaboradorId)?.participacao ?? null;
    },
    async contarUsadas(_cicloId, colaboradorId) {
      return estado.colaboradores.find((c) => c.id === colaboradorId)?.usadas ?? 0;
    },
    async salvarParticipacao(_cicloId, colaboradorId, dados) {
      estado.chamadas.push('salvarParticipacao');
      estado.salvos[colaboradorId] = dados;
    },
    async travarColaborador() {},
    async travarColaboradores(ids) {
      estado.chamadas.push('travarColaboradores');
      estado.travados.push([...ids].sort());
    },
    async registrarAuditoria(evento) {
      estado.chamadas.push('registrarAuditoria');
      estado.auditorias.push(evento);
    },
  };

  return { porta, estado };
}

function entrada(overrides: Partial<EntradaLoteParticipacao['body']> & { filtro: FiltroLote; motivo?: string }): EntradaLoteParticipacao {
  return {
    cicloId: CICLO_ID,
    atorTipo: 'ADMIN',
    atorId: 'admin-1',
    ip: '203.0.113.1',
    userAgent: 'vitest',
    requestId: 'req-1',
    body: { motivo: 'ajuste em lote', ...overrides },
  };
}

const RT_A = 'rt-a';
const RT_B = 'rt-b';

function colaborador(id: string, rtId: string, turno: 'DIURNO' | 'NOTURNO', usadas = 0): Registro {
  return { id, nome: `Colaborador ${id}`, rtId, turno, usadas, participacao: null };
}

describe('API-ADM-PAR-002 — aplicarParticipacaoEmLote', () => {
  it('1. filtro por RT — só afeta a RT informada', async () => {
    const { porta, estado } = criarFake([
      colaborador('c1', RT_A, 'DIURNO'),
      colaborador('c2', RT_A, 'DIURNO'),
      colaborador('c3', RT_B, 'DIURNO'),
    ]);

    const resultado = await aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 6 }));

    expect(resultado.afetados).toBe(2);
    expect(Object.keys(estado.salvos).sort()).toEqual(['c1', 'c2']);
  });

  it('2. preview — nada gravado', async () => {
    const { porta, estado } = criarFake([colaborador('c1', RT_A, 'DIURNO')]);

    const resultado = await aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 6, preview: true }));

    expect(resultado.afetados).toBe(1);
    expect(estado.chamadas).not.toContain('salvarParticipacao');
    expect(estado.chamadas).not.toContain('registrarAuditoria');
    expect(estado.chamadas).not.toContain('travarColaboradores');
  });

  it('3. alguém acima do novo limite — impacto listado, recusa sem confirmação', async () => {
    const { porta } = criarFake([colaborador('c1', RT_A, 'DIURNO', 7)]);

    const erro = await aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 3 })).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(409);
    expect((erro as ErroHttp).codigo).toBe('IMPACTO_NAO_CONFIRMADO');

    const { porta: porta2, estado: estado2 } = criarFake([colaborador('c1', RT_A, 'DIURNO', 7)]);
    const resultado = await aplicarParticipacaoEmLote(
      porta2,
      entrada({ filtro: { rtId: RT_A }, limiteOverride: 3, confirmarImpacto: true }),
    );
    expect(resultado.afetados).toBe(1);
    expect(estado2.chamadas).toContain('salvarParticipacao');
  });

  it('4. falha no meio — nada é persistido pela função de negócio após o erro (rollback total é responsabilidade da transação do chamador)', async () => {
    const colaboradores = [colaborador('c1', RT_A, 'DIURNO'), colaborador('c2', RT_A, 'DIURNO')];
    const { porta, estado } = criarFake(colaboradores);
    // Simula falha no segundo `salvarParticipacao` — a função de negócio não
    // engole a exceção, então a `emTransacao` real do adaptador (não exercida
    // aqui) faria rollback de tudo, inclusive o primeiro `salvarParticipacao`.
    let chamada = 0;
    porta.salvarParticipacao = async (_cicloId, colaboradorId, dados) => {
      chamada += 1;
      estado.chamadas.push('salvarParticipacao');
      if (chamada === 2) throw new Error('falha simulada de escrita');
      estado.salvos[colaboradorId] = dados;
    };

    await expect(
      aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 6, confirmarImpacto: true })),
    ).rejects.toThrow('falha simulada de escrita');

    // A função propaga a exceção sem gravar auditoria — nada "conclui" o lote.
    expect(estado.chamadas).not.toContain('registrarAuditoria');
  });

  it('5. dois lotes concorrentes com interseção — locks sempre na mesma ordem crescente de id (sem deadlock)', async () => {
    const colaboradores = [colaborador('c3', RT_A, 'DIURNO'), colaborador('c1', RT_A, 'DIURNO'), colaborador('c2', RT_A, 'DIURNO')];
    const { porta, estado } = criarFake(colaboradores);

    await aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 6, confirmarImpacto: true }));

    expect(estado.travados).toEqual([['c1', 'c2', 'c3']]);
  });

  it('6. 300 colaboradores — 422 (teto de 200 por chamada)', async () => {
    const muitos = Array.from({ length: 300 }, (_, i) => colaborador(`c${i}`, RT_A, 'DIURNO'));
    const { porta } = criarFake(muitos);

    const erro = await aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 6 })).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(422);
    expect((erro as ErroHttp).codigo).toBe('LOTE_MUITO_GRANDE');
  });

  it('TETO_LOTE é 200 (ACID "D" da spec)', () => {
    expect(TETO_LOTE).toBe(200);
  });

  it('auditoria única com filtro e contagem, mais uma linha por afetado no payload', async () => {
    const { porta, estado } = criarFake([colaborador('c1', RT_A, 'DIURNO'), colaborador('c2', RT_A, 'DIURNO')]);

    await aplicarParticipacaoEmLote(porta, entrada({ filtro: { rtId: RT_A }, limiteOverride: 6 }));

    expect(estado.auditorias).toHaveLength(1);
    const evento = estado.auditorias[0];
    if (!evento) throw new Error('auditoria não registrada');
    expect(evento.payload).toMatchObject({ contagem: 2, filtro: { rtId: RT_A } });
    expect((evento.payload as { afetados: string[] }).afetados.sort()).toEqual(['c1', 'c2']);
  });
});
