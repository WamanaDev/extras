/**
 * API-ADM-REL-002 — Teste de aceitação #1 ("CSV — abre corretamente, separador `;`").
 */
import { describe, expect, it } from 'vitest';
import { gerarCsv } from './csv';

describe('gerarCsv (API-ADM-REL-002, #1)', () => {
  it('usa ; como separador e \\r\\n como quebra de linha', () => {
    const csv = gerarCsv([
      ['Matrícula', 'Nome', 'Extras'],
      ['0001', 'Fulano', 3],
    ]);

    const semBom = csv.replace(/^﻿/, '');
    expect(semBom).toBe('Matrícula;Nome;Extras\r\n0001;Fulano;3');
  });

  it('escapa célula com ; ou aspas', () => {
    const csv = gerarCsv([['a;b', 'c"d']]);
    const semBom = csv.replace(/^﻿/, '');
    expect(semBom).toBe('"a;b";"c""d"');
  });

  it('tem BOM na frente (Excel PT-BR abre acentuação corretamente)', () => {
    const csv = gerarCsv([['á']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
