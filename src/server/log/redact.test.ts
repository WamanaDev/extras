import { describe, expect, it } from 'vitest';
import { redigir, redigirParaLog } from './redact';

describe('redigir — chaves bloqueadas (SEC-CONF)', () => {
  it('redige pin, token, cookie, authorization, tokenHash e senha', () => {
    const entrada = {
      pin: '1234',
      token: 'abc',
      cookie: 'sid=abc',
      authorization: 'Bearer xyz',
      tokenHash: 'deadbeef',
      senha: 'segredo',
      nome: 'Maria',
    };
    const saida = redigir(entrada) as Record<string, unknown>;
    expect(saida.pin).toBe('[REDIGIDO]');
    expect(saida.token).toBe('[REDIGIDO]');
    expect(saida.cookie).toBe('[REDIGIDO]');
    expect(saida.authorization).toBe('[REDIGIDO]');
    expect(saida.tokenHash).toBe('[REDIGIDO]');
    expect(saida.senha).toBe('[REDIGIDO]');
    expect(saida.nome).toBe('Maria');
  });

  it('é case-insensitive e ignora separadores', () => {
    const saida = redigir({ PIN: '1234', Token_Hash: 'deadbeef' }) as Record<string, unknown>;
    expect(saida.PIN).toBe('[REDIGIDO]');
    expect(saida.Token_Hash).toBe('[REDIGIDO]');
  });

  it('recursa em objetos e arrays aninhados (payload antes/depois de auditoria)', () => {
    const entrada = {
      payload: {
        antes: { pin: '1234', nome: 'A' },
        depois: [{ pin: '4321' }, { nome: 'B' }],
      },
    };
    const saida = redigir(entrada) as {
      payload: { antes: { pin: string; nome: string }; depois: Array<Record<string, unknown>> };
    };
    expect(saida.payload.antes.pin).toBe('[REDIGIDO]');
    expect(saida.payload.antes.nome).toBe('A');
    expect(saida.payload.depois[0]?.pin).toBe('[REDIGIDO]');
  });

  it('corta ciclos sem estourar pilha', () => {
    const obj: Record<string, unknown> = { nome: 'A' };
    obj.self = obj;
    expect(() => redigir(obj)).not.toThrow();
  });
});

describe('redigirParaLog', () => {
  it('produz JSON sem chaves bloqueadas em claro', () => {
    const json = redigirParaLog({ pin: '1234', mensagem: 'contato 99988877766' });
    expect(json).not.toContain('1234');
    expect(json).toContain('[REDIGIDO]');
  });
});
