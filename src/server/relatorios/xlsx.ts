/**
 * API-ADM-REL-002 — Geração de `.xlsx` mínimo (teste #2: "colunas tipadas").
 *
 * Sem biblioteca externa (ver `./zip.ts` para o porquê). Cada célula é
 * tipada pelo próprio tipo JS do valor recebido: `number` vira célula
 * numérica (Excel reconhece como número, alinha à direita, permite soma),
 * qualquer outra coisa vira string inline (`t="inlineStr"`, sem precisar de
 * `sharedStrings.xml`). O "tipo por coluna" do relatório nasce naturalmente
 * disso: colunas de contagem/hora/razão (`plantoesBase`, `horasBase`,
 * `aproveitamento`, ...) são sempre número em toda linha de dado; colunas de
 * texto (`matricula`, `nome`, `rt`) são sempre string.
 */
import { gerarZip } from './zip';
import type { CelulaExportacao } from './csv';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

const RELS_RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Relatório" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Referência de célula estilo `A1`, `B1`, ... `AA1` para colunas > 26. */
function referenciaCelula(colunaIndex: number, linhaIndex: number): string {
  let indice = colunaIndex + 1;
  let letras = '';
  while (indice > 0) {
    const resto = (indice - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    indice = Math.floor((indice - 1) / 26);
  }
  return `${letras}${linhaIndex + 1}`;
}

function celulaXml(valor: CelulaExportacao, colunaIndex: number, linhaIndex: number): string {
  const ref = referenciaCelula(colunaIndex, linhaIndex);
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `<c r="${ref}"><v>${valor}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(String(valor))}</t></is></c>`;
}

function linhaXml(linha: ReadonlyArray<CelulaExportacao>, linhaIndex: number): string {
  const celulas = linha.map((valor, colunaIndex) => celulaXml(valor, colunaIndex, linhaIndex)).join('');
  return `<row r="${linhaIndex + 1}">${celulas}</row>`;
}

/** Gera o `.xlsx` completo (Buffer pronto para `Content-Disposition: attachment`) a partir de uma matriz de linhas já formatada por `./exportacao-ciclo.ts`. */
export function gerarXlsx(linhas: ReadonlyArray<ReadonlyArray<CelulaExportacao>>): Buffer {
  const linhasXml = linhas.map((linha, indice) => linhaXml(linha, indice)).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${linhasXml}</sheetData>
</worksheet>`;

  return gerarZip([
    { nome: '[Content_Types].xml', conteudo: Buffer.from(CONTENT_TYPES, 'utf8') },
    { nome: '_rels/.rels', conteudo: Buffer.from(RELS_RAIZ, 'utf8') },
    { nome: 'xl/workbook.xml', conteudo: Buffer.from(WORKBOOK, 'utf8') },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: Buffer.from(WORKBOOK_RELS, 'utf8') },
    { nome: 'xl/worksheets/sheet1.xml', conteudo: Buffer.from(sheet, 'utf8') },
  ]);
}
