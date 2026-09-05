/**
 * Testes de aceitação de `API-ADM-PAR-001` (tabela "Testes de aceitação" da
 * spec, linhas 1-7). `PortaParticipacoes` é substituída por um fake em
 * memória — equivalente a mockar o Prisma na fronteira em que
 * `definirParticipacao` o usa (ver doc-comment de `./tipos.ts`).
 */
import { describe, expect, it } from 'vitest';
import { ErroHttp } from '@/server/http/erros';
import { definirParticipacao, type EntradaDefinirParticipacao } from './definir';
import type {
  CicloResumo,
  ColaboradorResumo,
  DadosParticipacao,
  EventoAuditoriaEntrada,
  ParticipacaoResumo,
  PortaParticipacoes,
} from './tipos';

const CICLO_ID = 'ciclo-1';
const COLABORADOR_ID = 'colab-1';

interface FakeState {
  ciclo: CicloResumo | null;
  colaborador: ColaboradorResumo | null;
  participacao: ParticipacaoResumo | null;
  usadas: number;
  chamadas: string[];
  auditorias: EventoAuditoriaEntrada[];
  salvo: DadosParticipacao | null;
}

function criarFake(overrides: Partial<FakeState> = {}): { porta: PortaParticipacoes; estado: FakeState } {
  const estado: FakeState = {
    ciclo: { id: CICLO_ID, status: 'PUBLICADO', limitePadrao: 5 },
    colaborador: { id: COLABORADOR_ID, nome: 'Ana Souza' },
    participacao: null,
    usadas: 0,
    chamadas: [],
    auditorias: [],
    salvo: null,
    ...overrides,
  };

  const porta: PortaParticipacoes = {
    async buscarCiclo() {
      estado.chamadas.push('buscarCiclo');
      return estado.ciclo;
    },
    async buscarColaborador() {
      estado.chamadas.push('buscarColaborador');
      return estado.colaborador;
    },
    async buscarColaboradoresPorFiltro() {
      return [];
    },
    async buscarParticipacao() {
      estado.chamadas.push('buscarParticipacao');
      return estado.participacao;
    },
    async contarUsadas() {
      estado.chamadas.push('contarUsadas');
      return estado.usadas;
    },
    async salvarParticipacao(_cicloId, _colaboradorId, dados) {
      estado.chamadas.push('salvarParticipacao');
      estado.salvo = dados;
    },
    async travarColaborador() {
      estado.chamadas.push('travarColaborador');
    },
    async travarColaboradores() {
      estado.chamadas.push('travarColaboradores');
    },
    async registrarAuditoria(evento) {
      estado.chamadas.push('registrarAuditoria');
      estado.auditorias.push(evento);
    },
  };

  return { porta, estado };
}

function entrada(overrides: Partial<EntradaDefinirParticipacao['body']> = {}): EntradaDefinirParticipacao {
  return {
    cicloId: CICLO_ID,
    colaboradorId: COLABORADOR_ID,
    atorTipo: 'ADMIN',
    atorId: 'admin-1',
    ip: '203.0.113.1',
    userAgent: 'vitest',
    requestId: 'req-1',
    body: overrides,
  };
}

describe('API-ADM-PAR-001 — definirParticipacao', () => {
  it('1. define override — aplicado', async () => {
    const { porta, estado } = criarFake();
    const resultado = await definirParticipacao(porta, entrada({ limiteOverride: 8 }));

    expect(resultado.limiteOverride).toBe(8);
    expect(estado.salvo?.limiteOverride).toBe(8);
  });

  it('2. volta limiteOverride para null — herda do ciclo', async () => {
    const { porta } = criarFake({
      participacao: { limiteOverride: 8, permiteCruzada: null, bloqueado: false, motivo: null },
    });
    const resultado = await definirParticipacao(porta, entrada({ limiteOverride: null }));

    expect(resultado.limiteOverride).toBeNull();
  });

  it('3. reduzir abaixo do usado — exige impacto + confirmação', async () => {
    const { porta } = criarFake({ usadas: 4 });

    await expect(definirParticipacao(porta, entrada({ limiteOverride: 2, motivo: 'ajuste' }))).rejects.toMatchObject({
      status: 409,
      codigo: 'IMPACTO_NAO_CONFIRMADO',
    });

    const { porta: porta2, estado: estado2 } = criarFake({ usadas: 4 });
    const resultado = await definirParticipacao(
      porta2,
      entrada({ limiteOverride: 2, motivo: 'ajuste combinado com a RT', confirmarImpacto: true }),
    );
    expect(resultado.limiteOverride).toBe(2);
    expect(estado2.chamadas).toContain('salvarParticipacao');
  });

  it('4. bloquear com extras marcadas — impacto listado (recusa sem confirmação)', async () => {
    const { porta } = criarFake({ usadas: 3 });

    const erro = await definirParticipacao(porta, entrada({ bloqueado: true, motivo: 'afastamento' })).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(409);
    expect((erro as ErroHttp).codigo).toBe('IMPACTO_NAO_CONFIRMADO');
    expect((erro as ErroHttp).message).toContain('3');
  });

  it('5. bloquear sem motivo — 422 MOTIVO_OBRIGATORIO', async () => {
    const { porta } = criarFake({ usadas: 0 });

    const erro = await definirParticipacao(porta, entrada({ bloqueado: true, confirmarImpacto: true })).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect((erro as ErroHttp).status).toBe(422);
    expect((erro as ErroHttp).codigo).toBe('MOTIVO_OBRIGATORIO');
  });

  it('6. concorrente com marcação em andamento — serializado pelo advisory lock (travado antes de qualquer leitura)', async () => {
    const { porta, estado } = criarFake();
    await definirParticipacao(porta, entrada({ permiteCruzada: false }));

    expect(estado.chamadas[0]).toBe('travarColaborador');
    // lock ocorre antes de qualquer leitura de ciclo/participação/contagem.
    expect(estado.chamadas.indexOf('travarColaborador')).toBeLessThan(estado.chamadas.indexOf('buscarCiclo'));
  });

  it('7. auditoria — antes → depois', async () => {
    const { porta, estado } = criarFake({
      participacao: { limiteOverride: 5, permiteCruzada: null, bloqueado: false, motivo: null },
    });

    await definirParticipacao(porta, entrada({ limiteOverride: 8 }));

    expect(estado.auditorias).toHaveLength(1);
    const evento = estado.auditorias[0];
    if (!evento) throw new Error('auditoria não registrada');
    expect(evento.acao).toBe('LIMITE_ALTERADO');
    expect(evento.payload).toMatchObject({
      antes: { limiteOverride: 5 },
      depois: { limiteOverride: 8 },
    });
  });

  it('recurso inexistente (ciclo) — 404, nunca 403 (contrato-comum)', async () => {
    const { porta } = criarFake({ ciclo: null });
    await expect(definirParticipacao(porta, entrada({ limiteOverride: 1 }))).rejects.toMatchObject({
      status: 404,
      codigo: 'RECURSO_NAO_ENCONTRADO',
    });
  });

  it('ciclo fechado — 409 CICLO_FECHADO', async () => {
    const { porta } = criarFake({ ciclo: { id: CICLO_ID, status: 'FECHADO', limitePadrao: 5 } });
    await expect(definirParticipacao(porta, entrada({ limiteOverride: 1 }))).rejects.toMatchObject({
      status: 409,
      codigo: 'CICLO_FECHADO',
    });
  });

  it('não grava nada quando a validação de impacto recusa (efeito colateral nenhum além de leitura)', async () => {
    const { porta, estado } = criarFake({ usadas: 3 });
    await definirParticipacao(porta, entrada({ bloqueado: true, motivo: 'x' })).catch(() => {});
    expect(estado.chamadas).not.toContain('salvarParticipacao');
    expect(estado.chamadas).not.toContain('registrarAuditoria');
  });

  it('mudança só de permiteCruzada audita CRUZADA_ALTERADA, não LIMITE_ALTERADO', async () => {
    const { porta, estado } = criarFake();
    await definirParticipacao(porta, entrada({ permiteCruzada: false }));
    expect(estado.auditorias.map((e) => e.acao)).toEqual(['CRUZADA_ALTERADA']);
  });

  it('nenhuma mudança de fato não gera auditoria', async () => {
    const { porta, estado } = criarFake();
    await definirParticipacao(porta, entrada({}));
    expect(estado.auditorias).toHaveLength(0);
  });
});
