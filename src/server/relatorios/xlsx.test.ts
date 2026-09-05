/**
 * API-ADM-REL-002 — Teste de aceitação #2 ("XLSX — colunas tipadas").
 *
 * Sem biblioteca de leitura de XLSX no projeto (`./zip.ts`, doc-comment):
 * o teste abre o ZIP resultante à mão (mesmo formato local-file-header que
 * `./zip.ts` escreve) e verifica no XML de `xl/worksheets/sheet1.xml` que
 * célula numérica vira `<c ...><v>` (sem `t=`) e célula de texto vira
 * `<c ... t="inlineStr">`.
 */
import { describe, expect, it } from 'vitest';
import { gerarXlsx } from './xlsx';

/** Lê as entradas de um ZIP STORE (sem compressão) — o único método que `./zip.ts` escreve. */
function lerEntradasZip(buffer: Buffer): Map<string, Buffer> {
  const entradas = new Map<string, Buffer>();
  let offset = 0;
  while (offset < buffer.length) {
    const assinatura = buffer.readUInt32LE(offset);
    if (assinatura !== 0x04034b50) break; // fim dos local file headers
    const tamanhoNome = buffer.readUInt16LE(offset + 26);
    const tamanhoExtra = buffer.readUInt16LE(offset + 28);
    const tamanhoDado = buffer.readUInt32LE(offset + 18);
    const inicioNome = offset + 30;
    const nome = buffer.toString('utf8', inicioNome, inicioNome + tamanhoNome);
    const inicioDado = inicioNome + tamanhoNome + tamanhoExtra;
    entradas.set(nome, buffer.subarray(inicioDado, inicioDado + tamanhoDado));
    offset = inicioDado + tamanhoDado;
  }
  return entradas;
}

describe('gerarXlsx (API-ADM-REL-002, #2)', () => {
  it('célula numérica vira <v> tipado; célula de texto vira inlineStr', () => {
    const buffer = gerarXlsx([
      ['Matrícula', 'Extras', 'Aproveitamento'],
      ['0001', 3, 0.5],
    ]);

    const entradas = lerEntradasZip(buffer);
    const sheet = entradas.get('xl/worksheets/sheet1.xml');
    expect(sheet).toBeDefined();
    const xml = sheet!.toString('utf8');

    // Linha 1 (cabeçalho): tudo texto.
    expect(xml).toContain('<c r="A1" t="inlineStr"><is><t xml:space="preserve">Matrícula</t></is></c>');
    // Linha 2: matrícula é texto, extras/aproveitamento são número (sem t=).
    expect(xml).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">0001</t></is></c>');
    expect(xml).toContain('<c r="B2"><v>3</v></c>');
    expect(xml).toContain('<c r="C2"><v>0.5</v></c>');
  });

  it('produz um ZIP válido (assinatura local file header em cada entrada)', () => {
    const buffer = gerarXlsx([['x']]);
    const entradas = lerEntradasZip(buffer);
    expect([...entradas.keys()]).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']),
    );
  });
});
