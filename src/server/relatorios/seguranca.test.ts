/**
 * API-ADM-REL-004 — Testes de aceitação #1-#5 com Prisma mockado.
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { montarPainelSeguranca, calcularInicioJanela } from './seguranca';

const AGORA = new Date('2026-09-04T12:00:00-03:00');

function criarPrismaFake(opts: {
  tentativas?: unknown[];
  colaboradoresBloqueados?: unknown[];
  sessoesAtivas?: number;
}): PrismaClient {
  return {
    tentativaLogin: { findMany: vi.fn().mockResolvedValue(opts.tentativas ?? []) },
    colaborador: { findMany: vi.fn().mockResolvedValue(opts.colaboradoresBloqueados ?? []) },
    sessaoColaborador: { count: vi.fn().mockResolvedValue(opts.sessoesAtivas ?? 0) },
  } as unknown as PrismaClient;
}

function tentativa(matricula: string, ip: string, sucesso: boolean, criadoEm = AGORA) {
  return { matricula, ip, sucesso, criadoEm };
}

describe('montarPainelSeguranca (API-ADM-REL-004)', () => {
  it('#1 contas bloqueadas são listadas', async () => {
    const bloqueado = { id: 'colab-1', nome: 'Fulano', matricula: '0001', bloqueadoAte: new Date('2026-09-04T12:10:00-03:00'), tentativasFalhas: 5 };
    const prisma = criarPrismaFake({ colaboradoresBloqueados: [bloqueado] });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: false });

    expect(painel.contasBloqueadas).toEqual([
      { colaboradorId: 'colab-1', nome: 'Fulano', matricula: '0001', bloqueadoAte: '2026-09-04T15:10:00.000Z', falhas: 5 },
    ]);
  });

  it('#2 IP com 5 matrículas distintas é marcado suspeito', async () => {
    const tentativas = ['0001', '0002', '0003', '0004', '0005'].map((m) => tentativa(m, '203.0.113.9', false));
    const prisma = criarPrismaFake({ tentativas });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: false });

    expect(painel.ipsSuspeitos).toHaveLength(1);
    expect(painel.ipsSuspeitos[0]).toMatchObject({ ip: '203.0.113.9', matriculasDistintas: 5 });
  });

  it('#3 colaborador errando o próprio PIN não é marcado suspeito', async () => {
    const tentativas = Array.from({ length: 5 }, () => tentativa('0001', '198.51.100.4', false));
    const prisma = criarPrismaFake({ tentativas });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: false });

    expect(painel.ipsSuspeitos).toHaveLength(0);
  });

  it('#3b mais de 10 falhas do mesmo IP (mesma matrícula ou não) marca suspeito', async () => {
    const tentativas = Array.from({ length: 11 }, () => tentativa('0001', '198.51.100.4', false));
    const prisma = criarPrismaFake({ tentativas });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: false });

    expect(painel.ipsSuspeitos).toHaveLength(1);
  });

  it('#4 janela 7d agrega tentativas de até 7 dias atrás', async () => {
    const prisma = criarPrismaFake({});

    await montarPainelSeguranca(prisma, AGORA, { janela: '7d', apenasSuspeitas: false });

    const inicioEsperado = new Date(AGORA.getTime() - 7 * 24 * 60 * 60 * 1000);
    expect(prisma.tentativaLogin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { criadoEm: { gte: inicioEsperado } } }),
    );
  });

  it('#5 tentativas com mais de 90 dias ficam fora da janela consultada (expurgo)', () => {
    const inicio24h = calcularInicioJanela(AGORA, '24h');
    const inicio7d = calcularInicioJanela(AGORA, '7d');
    const limite90dias = new Date(AGORA.getTime() - 90 * 24 * 60 * 60 * 1000);

    expect(inicio24h.getTime()).toBeGreaterThanOrEqual(limite90dias.getTime());
    expect(inicio7d.getTime()).toBeGreaterThanOrEqual(limite90dias.getTime());
  });

  it('sessoesAtivas reflete a contagem de sessões não revogadas e não expiradas', async () => {
    const prisma = criarPrismaFake({ sessoesAtivas: 7 });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: false });

    expect(painel.sessoesAtivas).toBe(7);
    expect(prisma.sessaoColaborador.count).toHaveBeenCalledWith({
      where: { revogadaEm: null, expiraEm: { gt: AGORA } },
    });
  });

  it('resumo: tentativas, falhas e taxaFalha calculados sobre a janela', async () => {
    const tentativas = [
      tentativa('0001', '1.1.1.1', true),
      tentativa('0001', '1.1.1.1', false),
      tentativa('0002', '1.1.1.2', false),
    ];
    const prisma = criarPrismaFake({ tentativas });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: false });

    expect(painel.resumo).toEqual({ tentativas: 3, falhas: 2, taxaFalha: 2 / 3 });
  });

  it('apenasSuspeitas filtra contasBloqueadas para as correlacionadas a IP suspeito', async () => {
    const tentativasSuspeitas = ['0001', '0002', '0003', '0004'].map((m) => tentativa(m, '203.0.113.9', false));
    const bloqueadoCorrelato = { id: 'colab-1', nome: 'Suspeito', matricula: '0001', bloqueadoAte: new Date('2026-09-04T13:00:00-03:00'), tentativasFalhas: 5 };
    const bloqueadoRuido = { id: 'colab-9', nome: 'Esqueceu o PIN', matricula: '0009', bloqueadoAte: new Date('2026-09-04T13:00:00-03:00'), tentativasFalhas: 5 };
    const prisma = criarPrismaFake({
      tentativas: tentativasSuspeitas,
      colaboradoresBloqueados: [bloqueadoCorrelato, bloqueadoRuido],
    });

    const painel = await montarPainelSeguranca(prisma, AGORA, { janela: '24h', apenasSuspeitas: true });

    expect(painel.contasBloqueadas.map((c) => c.colaboradorId)).toEqual(['colab-1']);
  });
});
