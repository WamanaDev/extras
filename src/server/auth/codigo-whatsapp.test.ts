import { describe, expect, it } from 'vitest';
import { emitirCodigo, verificarCodigo, type ArmazemCodigo, type RegistroCodigo } from './codigo-whatsapp';
import { MAX_TENTATIVAS_CODIGO } from './segundo-fator';

const SEGREDO = 'x'.repeat(32);

function armazemMemoria(): ArmazemCodigo & { dados: Map<string, RegistroCodigo> } {
  const dados = new Map<string, RegistroCodigo>();
  return {
    dados,
    async salvar(userId, registro) {
      dados.set(userId, registro);
    },
    async obter(userId) {
      return dados.get(userId) ?? null;
    },
    async atualizar(userId, registro) {
      dados.set(userId, registro);
    },
    async apagar(userId) {
      dados.delete(userId);
    },
  };
}

async function preparar() {
  const armazem = armazemMemoria();
  const mensagens: Array<{ numero: string; texto: string }> = [];
  const enviador = { enviarTexto: async (numero: string, texto: string) => void mensagens.push({ numero, texto }) };
  await emitirCodigo({ armazem, enviador, segredo: SEGREDO, gerar: () => '123456' }, { userId: 'u1', sessionId: 's1', whatsapp: '5511987654321' });
  return { armazem, mensagens };
}

describe('código de login por WhatsApp', () => {
  it('envia o código e não guarda em claro', async () => {
    const { armazem, mensagens } = await preparar();
    expect(mensagens).toHaveLength(1);
    expect(mensagens[0]!.numero).toBe('5511987654321');
    expect(mensagens[0]!.texto).toContain('123456');
    expect(JSON.stringify([...armazem.dados.values()])).not.toContain('123456');
  });

  it('código certo → OK uma única vez', async () => {
    const { armazem } = await preparar();
    expect(await verificarCodigo({ armazem, segredo: SEGREDO }, { userId: 'u1', sessionId: 's1', codigo: '123456' })).toBe('OK');
    expect(await verificarCodigo({ armazem, segredo: SEGREDO }, { userId: 'u1', sessionId: 's1', codigo: '123456' })).toBe('EXPIRADO');
  });

  it('código de outra sessão não vale', async () => {
    const { armazem } = await preparar();
    expect(await verificarCodigo({ armazem, segredo: SEGREDO }, { userId: 'u1', sessionId: 's2', codigo: '123456' })).toBe('EXPIRADO');
  });

  it(`bloqueia depois de ${MAX_TENTATIVAS_CODIGO} erros, mesmo que depois acerte`, async () => {
    const { armazem } = await preparar();
    const deps = { armazem, segredo: SEGREDO };
    const p = { userId: 'u1', sessionId: 's1' };
    for (let i = 1; i < MAX_TENTATIVAS_CODIGO; i++) {
      expect(await verificarCodigo(deps, { ...p, codigo: '000000' })).toBe('INVALIDO');
    }
    expect(await verificarCodigo(deps, { ...p, codigo: '000000' })).toBe('TENTATIVAS_ESGOTADAS');
    expect(await verificarCodigo(deps, { ...p, codigo: '123456' })).toBe('EXPIRADO');
  });

  it('se o envio falha, o código não fica valendo', async () => {
    const armazem = armazemMemoria();
    const enviador = { enviarTexto: async () => Promise.reject(new Error('fora do ar')) };
    await expect(
      emitirCodigo({ armazem, enviador, segredo: SEGREDO, gerar: () => '123456' }, { userId: 'u1', sessionId: 's1', whatsapp: '5511987654321' }),
    ).rejects.toThrow('fora do ar');
    expect(armazem.dados.size).toBe(0);
  });
});
