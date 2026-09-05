/**
 * API-AUTH-003 — RN-30: testes de `validarForcaPin`.
 */
import { describe, expect, it } from 'vitest';
import { validarForcaPin } from './pin';

const MATRICULA = '8901'; // colaborador.matricula

describe('RN-30 validarForcaPin', () => {
  it('2. sequência crescente/decrescente e repetido → fraco', () => {
    expect(validarForcaPin('1234', MATRICULA)).toBe('SEQUENCIA');
    expect(validarForcaPin('4321', MATRICULA)).toBe('SEQUENCIA');
    expect(validarForcaPin('1111', MATRICULA)).toBe('REPETIDO');
  });

  it('3. igual à matrícula → fraco', () => {
    expect(validarForcaPin('8901', MATRICULA)).toBe('IGUAL_MATRICULA');
  });

  it('PIN comum (fora de sequência/repetição/matrícula) → fraco', () => {
    expect(validarForcaPin('1212', MATRICULA)).toBe('COMUM');
  });

  it('PIN forte é aceito (null)', () => {
    expect(validarForcaPin('7053', MATRICULA)).toBeNull();
    expect(validarForcaPin('582917', MATRICULA)).toBeNull();
  });

  it('sequência de 6 dígitos também é pega', () => {
    expect(validarForcaPin('123456', MATRICULA)).toBe('SEQUENCIA');
  });
});
