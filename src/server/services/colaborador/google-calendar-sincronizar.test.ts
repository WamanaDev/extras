/**
 * Testes de `sincronizarGoogleCalendar` — pedido do usuário. Cobre: só dias
 * TRABALHADOS (`presenca: true`) viram evento (folga não interessa numa
 * agenda pessoal), extras confirmadas sempre viram evento, e sem conta
 * conectada lança `GoogleCalendarNaoConectadoError` (a rota traduz numa
 * mensagem clara em vez de erro genérico).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const obterAccessTokenMock = vi.fn(async (..._args: unknown[]) => 'access-token-de-teste');
const upsertEventoMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/server/integracoes/google-calendar', () => ({
  obterAccessToken: (...args: unknown[]) => obterAccessTokenMock(...args),
  upsertEvento: (...args: unknown[]) => upsertEventoMock(...args),
  idEventoEscala: (id: string) => `esc${id}`,
  idEventoExtra: (id: string) => `ext${id}`,
}));

import { sincronizarGoogleCalendar, GoogleCalendarNaoConectadoError, type ClienteSincronizarGoogleCalendar } from './google-calendar-sincronizar';

const CONTA = { colaboradorId: 'colab-1', refreshTokenCifrado: 'cifrado-1', calendarioId: 'primary' };

function criarPrismaFake(config: {
  conta?: typeof CONTA | null;
  diasTrabalhados?: Array<{ id: string; inicioEm: Date; fimEm: Date; codigoEscala: { descricao: string } }>;
  extras?: Array<{ id: string; inicioEm: Date; fimEm: Date; plantao: { rt: { nome: string } } }>;
}): ClienteSincronizarGoogleCalendar {
  return {
    googleCalendarConta: {
      findUnique: vi.fn(async () => (config.conta === undefined ? CONTA : config.conta)),
      update: vi.fn(async () => undefined),
    },
    escalaDia: { findMany: vi.fn(async () => config.diasTrabalhados ?? []) },
    marcacao: { findMany: vi.fn(async () => config.extras ?? []) },
  } as unknown as ClienteSincronizarGoogleCalendar;
}

describe('sincronizarGoogleCalendar', () => {
  beforeEach(() => {
    obterAccessTokenMock.mockClear();
    upsertEventoMock.mockClear();
  });

  it('sem conta conectada → lança GoogleCalendarNaoConectadoError, nunca chama a API do Google', async () => {
    const prisma = criarPrismaFake({ conta: null });

    await expect(sincronizarGoogleCalendar(prisma, 'colab-1', 'ciclo-1')).rejects.toBeInstanceOf(GoogleCalendarNaoConectadoError);
    expect(obterAccessTokenMock).not.toHaveBeenCalled();
  });

  it('cria um evento por dia trabalhado e um por extra confirmada, com ids determinísticos', async () => {
    const prisma = criarPrismaFake({
      diasTrabalhados: [
        { id: 'esc-1', inicioEm: new Date('2026-09-01T07:00:00-03:00'), fimEm: new Date('2026-09-01T19:00:00-03:00'), codigoEscala: { descricao: 'Disponível' } },
      ],
      extras: [{ id: 'marc-1', inicioEm: new Date('2026-09-05T19:00:00-03:00'), fimEm: new Date('2026-09-06T07:00:00-03:00'), plantao: { rt: { nome: 'RT-1' } } }],
    });

    const resultado = await sincronizarGoogleCalendar(prisma, 'colab-1', 'ciclo-1');

    expect(resultado).toEqual({ eventosEscala: 1, eventosExtra: 1 });
    expect(upsertEventoMock).toHaveBeenCalledTimes(2);
    expect(upsertEventoMock).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'access-token-de-teste', calendarioId: 'primary', evento: expect.objectContaining({ id: 'escesc-1' }) }),
    );
    expect(upsertEventoMock).toHaveBeenCalledWith(expect.objectContaining({ evento: expect.objectContaining({ id: 'extmarc-1', titulo: expect.stringContaining('RT-1') }) }));
  });

  it('busca dias trabalhados filtrando por presenca=true (folga não vira evento na agenda)', async () => {
    const prisma = criarPrismaFake({});

    await sincronizarGoogleCalendar(prisma, 'colab-1', 'ciclo-1');

    expect(prisma.escalaDia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ codigoEscala: { presenca: true } }) }),
    );
  });

  it('nenhum dia trabalhado nem extra → 0/0, sem chamar upsertEvento', async () => {
    const prisma = criarPrismaFake({});

    const resultado = await sincronizarGoogleCalendar(prisma, 'colab-1', 'ciclo-1');

    expect(resultado).toEqual({ eventosEscala: 0, eventosExtra: 0 });
    expect(upsertEventoMock).not.toHaveBeenCalled();
  });

  it('toca atualizadoEm da conta ao final de uma sincronização bem-sucedida', async () => {
    const prisma = criarPrismaFake({});

    await sincronizarGoogleCalendar(prisma, 'colab-1', 'ciclo-1');

    expect(prisma.googleCalendarConta.update).toHaveBeenCalledWith({ where: { colaboradorId: 'colab-1' }, data: { atualizadoEm: expect.any(Date) } });
  });
});
