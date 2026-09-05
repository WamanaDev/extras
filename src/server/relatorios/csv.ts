/**
 * API-ADM-REL-002 — Serialização CSV.
 *
 * Separador `;` (padrão Excel PT-BR — a spec, teste #1, exige exatamente
 * isso: "abre corretamente, separador `;`"). Recebe uma matriz de linhas já
 * prontas (cabeçalho de origem + linha de título + dados) — a montagem do
 * conteúdo é responsabilidade de `./exportacao-ciclo.ts`, este módulo só
 * serializa.
 */

/** Uma célula tipada: número permanece número (formatação decimal com `.`), texto vai como string. */
export type CelulaExportacao = string | number;

const SEPARADOR = ';';
const QUEBRA_LINHA = '\r\n';

function formatarCelula(valor: CelulaExportacao): string {
  const texto = typeof valor === 'number' ? formatarNumero(valor) : valor;
  if (/[;"\r\n]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function formatarNumero(valor: number): string {
  // Evita notação científica/arredondamento estranho para os números do
  // relatório (contagens inteiras e razões 0..1) — `toString()` já é
  // suficiente para essa faixa de valores.
  return valor.toString();
}

/** `﻿` (BOM) na frente: Excel PT-BR abre CSV UTF-8 sem BOM com acentuação quebrada. */
export function gerarCsv(linhas: ReadonlyArray<ReadonlyArray<CelulaExportacao>>): string {
  const corpo = linhas.map((linha) => linha.map(formatarCelula).join(SEPARADOR)).join(QUEBRA_LINHA);
  return `﻿${corpo}`;
}
