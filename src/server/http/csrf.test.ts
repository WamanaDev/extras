import { describe, expect, it } from 'vitest';
import { METODOS_MUTACAO, verificarCsrf } from './csrf';

describe('verificarCsrf (SEC-INT)', () => {
  it('aceita fetch JSON com o header esperado', () => {
    const headers = new Headers({
      'content-type': 'application/json',
      'x-requested-with': 'fetch',
    });
    expect(verificarCsrf(headers)).toEqual({ ok: true });
  });

  it('recusa submissão de formulário (application/x-www-form-urlencoded)', () => {
    const headers = new Headers({ 'content-type': 'application/x-www-form-urlencoded' });
    expect(verificarCsrf(headers)).toEqual({ ok: false, motivo: 'CONTENT_TYPE_PROIBIDO' });
  });

  it('recusa multipart/form-data', () => {
    const headers = new Headers({ 'content-type': 'multipart/form-data; boundary=x' });
    expect(verificarCsrf(headers)).toEqual({ ok: false, motivo: 'CONTENT_TYPE_PROIBIDO' });
  });

  it('recusa JSON sem o header X-Requested-With', () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    expect(verificarCsrf(headers)).toEqual({ ok: false, motivo: 'HEADER_AUSENTE' });
  });

  it('METODOS_MUTACAO contém os quatro verbos de escrita e não GET', () => {
    expect(METODOS_MUTACAO.has('POST')).toBe(true);
    expect(METODOS_MUTACAO.has('DELETE')).toBe(true);
    expect(METODOS_MUTACAO.has('GET')).toBe(false);
  });
});
