/**
 * Testes de `enviarLembretesDeExtra` — pedido do usuário: aviso automático
 * de extra confirmada, disparado por cron. Cobre a regra de qual dia cada
 * turno aponta (NOTURNO → hoje, DIURNO → amanhã), o dedupe por `link`, e que
 * `criarNotificacao` (mockado) recebe os campos certos.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const criarNotificacaoMock = vi.fn();
vi.mock('./criar', () => ({
  criarNotificacao: (...args: unknown[]) => criarNotificacaoMock(...args),
}));

import { enviarLembretesDeExtra, type ClienteLembreteExtra } from './lembrete-extra';

// Terça-feira, 12:00 BRT — meio do dia, não influencia qual "hoje"/"amanhã" é usado (comparação é só de data civil).
const AGORA = new Date('2026-09-08T12:00:00-03:00');

interface MarcacaoFixture {
  id: string;
  colaboradorId: string;
  rtNome: string;
}

function criarPrismaFake(config: { marcacoes: MarcacaoFixture[]; notificacoesExistentes?: Set<string> }): ClienteLembreteExtra {
  const notificacoesExistentes = config.notificacoesExistentes ?? new Set<string>();
  return {
    marcacao: {
      findMany: vi.fn(async () => config.marcacoes.map((m) => ({ id: m.id, colaboradorId: m.colaboradorId, plantao: { rt: { nome: m.rtNome } } }))),
    },
    notificacao: {
      findFirst: vi.fn(async ({ where }: { where: { colaboradorId: string; link: string } }) =>
        notificacoesExistentes.has(`${where.colaboradorId}:${where.link}`) ? { id: 'notif-existente' } : null,
      ),
    },
  } as unknown as ClienteLembreteExtra;
}

describe('enviarLembretesDeExtra', () => {
  beforeEach(() => {
    criarNotificacaoMock.mockReset();
    criarNotificacaoMock.mockResolvedValue({ id: 'notif-nova' });
  });

  it('NOTURNO consulta o plantão de HOJE (mesma data civil de `agora`)', async () => {
    const prisma = criarPrismaFake({ marcacoes: [] });

    await enviarLembretesDeExtra(prisma, 'NOTURNO', AGORA);

    expect(prisma.marcacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMADA', plantao: { data: new Date('2026-09-08T00:00:00.000Z'), tipo: 'NOTURNO' } },
      }),
    );
  });

  it('DIURNO consulta o plantão de AMANHÃ (data civil + 1 dia)', async () => {
    const prisma = criarPrismaFake({ marcacoes: [] });

    await enviarLembretesDeExtra(prisma, 'DIURNO', AGORA);

    expect(prisma.marcacao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'CONFIRMADA', plantao: { data: new Date('2026-09-09T00:00:00.000Z'), tipo: 'DIURNO' } },
      }),
    );
  });

  it('notifica cada colaborador com extra confirmada, mensagem menciona o horário e a RT do plantão', async () => {
    const prisma = criarPrismaFake({ marcacoes: [{ id: 'marc-1', colaboradorId: 'colab-1', rtNome: 'RT-1' }] });

    const resultado = await enviarLembretesDeExtra(prisma, 'NOTURNO', AGORA);

    expect(criarNotificacaoMock).toHaveBeenCalledWith(prisma, {
      colaboradorId: 'colab-1',
      tipo: 'LEMBRETE_EXTRA',
      titulo: 'Lembrete de extra',
      mensagem: 'Você tem uma extra confirmada hoje às 19:00 (RT RT-1).',
      link: '/minhas-extras?marcacaoId=marc-1',
    });
    expect(resultado.notificadas).toBe(1);
    expect(resultado.jaNotificadas).toBe(0);
  });

  it('DIURNO menciona "amanhã" e o horário 07:00 na mensagem', async () => {
    const prisma = criarPrismaFake({ marcacoes: [{ id: 'marc-2', colaboradorId: 'colab-2', rtNome: 'RT-2' }] });

    await enviarLembretesDeExtra(prisma, 'DIURNO', AGORA);

    expect(criarNotificacaoMock).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ mensagem: 'Você tem uma extra confirmada amanhã às 07:00 (RT RT-2).' }),
    );
  });

  it('dedupe: já existe notificação com o mesmo link para o colaborador → não chama criarNotificacao de novo', async () => {
    const prisma = criarPrismaFake({
      marcacoes: [{ id: 'marc-1', colaboradorId: 'colab-1', rtNome: 'RT-1' }],
      notificacoesExistentes: new Set(['colab-1:/minhas-extras?marcacaoId=marc-1']),
    });

    const resultado = await enviarLembretesDeExtra(prisma, 'NOTURNO', AGORA);

    expect(criarNotificacaoMock).not.toHaveBeenCalled();
    expect(resultado).toEqual({ turno: 'NOTURNO', dataAlvo: '2026-09-08', notificadas: 0, jaNotificadas: 1 });
  });

  it('múltiplos colaboradores: cada um notificado uma vez, independentemente', async () => {
    const prisma = criarPrismaFake({
      marcacoes: [
        { id: 'marc-1', colaboradorId: 'colab-1', rtNome: 'RT-1' },
        { id: 'marc-2', colaboradorId: 'colab-2', rtNome: 'RT-2' },
      ],
    });

    const resultado = await enviarLembretesDeExtra(prisma, 'NOTURNO', AGORA);

    expect(criarNotificacaoMock).toHaveBeenCalledTimes(2);
    expect(resultado.notificadas).toBe(2);
  });

  it('nenhuma extra confirmada no turno/dia → notificadas: 0, sem chamar criarNotificacao', async () => {
    const prisma = criarPrismaFake({ marcacoes: [] });

    const resultado = await enviarLembretesDeExtra(prisma, 'DIURNO', AGORA);

    expect(criarNotificacaoMock).not.toHaveBeenCalled();
    expect(resultado.notificadas).toBe(0);
  });
});
