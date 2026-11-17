import { describe, expect, it } from 'vitest';
import {
  DURACAO_SEGUNDO_FATOR_SEGUNDOS,
  assinarCookieSegundoFator,
  cookieSegundoFatorValido,
  gerarCodigo,
  mascararWhatsapp,
  normalizarWhatsapp,
  sessionIdDoAccessToken,
  whatsappDoAppMetadata,
} from './segundo-fator';

const SEGREDO = 'x'.repeat(32);
const AGORA = new Date('2026-11-17T12:00:00Z');

describe('normalizarWhatsapp', () => {
  it.each([
    ['(11) 98765-4321', '5511987654321'],
    ['11 3456-7890', '551134567890'],
    ['+55 11 98765-4321', '5511987654321'],
    ['5511987654321', '5511987654321'],
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarWhatsapp(entrada)).toBe(esperado);
  });

  it.each(['', '123', '987654321', '1'.repeat(16)])('rejeita %s', (entrada) => {
    expect(normalizarWhatsapp(entrada)).toBeNull();
  });

  it('lê só app_metadata.whatsapp válido', () => {
    expect(whatsappDoAppMetadata({ whatsapp: '11987654321' })).toBe('5511987654321');
    expect(whatsappDoAppMetadata({ whatsapp: 'abc' })).toBeNull();
    expect(whatsappDoAppMetadata({})).toBeNull();
    expect(whatsappDoAppMetadata(undefined)).toBeNull();
  });

  it('mascara mostrando só os 4 últimos dígitos', () => {
    expect(mascararWhatsapp('5511987654321')).toBe('•••• 4321');
  });
});

describe('gerarCodigo', () => {
  it('sempre 6 dígitos', () => {
    for (let i = 0; i < 200; i++) expect(gerarCodigo()).toMatch(/^\d{6}$/);
  });
});

describe('cookie admin_2fa', () => {
  const valor = assinarCookieSegundoFator(SEGREDO, 'user-1', 'sessao-1', AGORA);

  it('vale para o mesmo usuário e sessão dentro do prazo', () => {
    expect(cookieSegundoFatorValido(SEGREDO, valor, 'user-1', 'sessao-1', AGORA)).toBe(true);
  });

  it('não vale para outro usuário, outra sessão, outro segredo ou ausente', () => {
    expect(cookieSegundoFatorValido(SEGREDO, valor, 'user-2', 'sessao-1', AGORA)).toBe(false);
    expect(cookieSegundoFatorValido(SEGREDO, valor, 'user-1', 'sessao-2', AGORA)).toBe(false);
    expect(cookieSegundoFatorValido('y'.repeat(32), valor, 'user-1', 'sessao-1', AGORA)).toBe(false);
    expect(cookieSegundoFatorValido(SEGREDO, undefined, 'user-1', 'sessao-1', AGORA)).toBe(false);
  });

  it('expira depois de 4h', () => {
    const depois = new Date(AGORA.getTime() + DURACAO_SEGUNDO_FATOR_SEGUNDOS * 1000 + 1000);
    expect(cookieSegundoFatorValido(SEGREDO, valor, 'user-1', 'sessao-1', depois)).toBe(false);
  });

  it('rejeita prazo adulterado', () => {
    const [sessao, , assinatura] = valor.split('.');
    const adulterado = `${sessao}.${Math.floor(AGORA.getTime() / 1000) + 10 * 365 * 86400}.${assinatura}`;
    expect(cookieSegundoFatorValido(SEGREDO, adulterado, 'user-1', 'sessao-1', AGORA)).toBe(false);
  });
});

describe('sessionIdDoAccessToken', () => {
  it('extrai a claim session_id', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'u', session_id: 'abc-123' })).toString('base64url');
    expect(sessionIdDoAccessToken(`h.${payload}.s`)).toBe('abc-123');
  });
  it('null para token malformado ou sem a claim', () => {
    expect(sessionIdDoAccessToken('lixo')).toBeNull();
    expect(sessionIdDoAccessToken(`h.${Buffer.from('{}').toString('base64url')}.s`)).toBeNull();
  });
});
