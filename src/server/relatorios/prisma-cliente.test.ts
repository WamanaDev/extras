/**
 * API-ADM-REL-001 — Teste #5 ("Executa em `app_readonly`").
 *
 * `obterPrismaRelatoriosReadonly` é o único ponto que decide a connection
 * string usada pelo relatório de ciclo — se `DATABASE_URL_READONLY` (role
 * `app_readonly`, ver doc-comment de `./prisma-cliente.ts`) está configurada,
 * ela é usada; senão cai para `DATABASE_URL` (role `app_server`, mesmos
 * dados, sem a isolação de role dedicada — GAP já registrado em
 * `_conflitos.md`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PrismaClientMock = vi.fn().mockImplementation((opcoes?: unknown) => ({ __opcoes: opcoes }));

vi.mock('@prisma/client', () => ({ PrismaClient: PrismaClientMock }));

describe('obterPrismaRelatoriosReadonly (API-ADM-REL-001, #5)', () => {
  const originalReadonly = process.env.DATABASE_URL_READONLY;
  const originalPadrao = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    PrismaClientMock.mockClear();
    process.env.DATABASE_URL_READONLY = originalReadonly;
    process.env.DATABASE_URL = originalPadrao;
  });

  it('usa DATABASE_URL_READONLY (role app_readonly) quando configurada', async () => {
    process.env.DATABASE_URL_READONLY = 'postgres://app_readonly@host/db';
    process.env.DATABASE_URL = 'postgres://app_server@host/db';

    const { obterPrismaRelatoriosReadonly, _resetarSingletonsParaTeste } = await import('./prisma-cliente');
    _resetarSingletonsParaTeste();

    await obterPrismaRelatoriosReadonly();

    expect(PrismaClientMock).toHaveBeenCalledWith({
      datasources: { db: { url: 'postgres://app_readonly@host/db' } },
    });
  });

  it('cai para DATABASE_URL (app_server) quando a variável readonly não está configurada', async () => {
    delete process.env.DATABASE_URL_READONLY;
    process.env.DATABASE_URL = 'postgres://app_server@host/db';

    const { obterPrismaRelatoriosReadonly, _resetarSingletonsParaTeste } = await import('./prisma-cliente');
    _resetarSingletonsParaTeste();

    await obterPrismaRelatoriosReadonly();

    expect(PrismaClientMock).toHaveBeenCalledWith({
      datasources: { db: { url: 'postgres://app_server@host/db' } },
    });
  });
});
