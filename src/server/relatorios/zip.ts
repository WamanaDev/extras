/**
 * API-ADM-REL-002 — Escritor ZIP mínimo (método STORE, sem compressão).
 *
 * `.xlsx` é um contêiner ZIP (OOXML). Não há nenhuma dependência de ZIP/XLSX
 * no `package.json` deste projeto (`xlsx`, `exceljs`, `jszip`, ...) — ver
 * `_conflitos.md`: em vez de acrescentar uma dependência nova ao
 * `package.json` compartilhado (risco real de colisão editando o mesmo
 * arquivo que outros 8 agentes desta onda podem tocar em paralelo, além de
 * exigir `pnpm install` fora do escopo deste agente), este módulo escreve um
 * ZIP válido à mão, só com o que `./xlsx.ts` precisa: entradas STORE (sem
 * DEFLATE) com CRC-32 calculado localmente. ZIP aceita STORE como método de
 * compressão válido (method 0) — Excel abre normalmente.
 *
 * Formato: um "local file header" + dados por entrada, seguido do "central
 * directory" e do "end of central directory record" — layout mínimo da
 * especificação PKZIP, sem nenhuma feature opcional (sem comentário, sem
 * Zip64, sem data descriptor).
 */

interface EntradaZip {
  nome: string;
  conteudo: Buffer;
}

const TABELA_CRC32 = construirTabelaCrc32();

function construirTabelaCrc32(): Uint32Array {
  const tabela = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
    tabela[i] = c >>> 0;
  }
  return tabela;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i] as number;
    crc = (TABELA_CRC32[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Data/hora DOS fixa (2026-01-01 00:00:00) — o conteúdo do XLSX não depende de timestamp de arquivo, então um valor fixo é suficiente e determinístico em teste. */
const DOS_DATA = ((2026 - 1980) << 9) | (1 << 5) | 1;
const DOS_HORA = 0;

export function gerarZip(entradas: readonly EntradaZip[]): Buffer {
  const partesLocais: Buffer[] = [];
  const partesCentrais: Buffer[] = [];
  let offset = 0;

  for (const entrada of entradas) {
    const nomeBuffer = Buffer.from(entrada.nome, 'utf8');
    const crc = crc32(entrada.conteudo);
    const tamanho = entrada.conteudo.length;

    const cabecalhoLocal = Buffer.alloc(30);
    cabecalhoLocal.writeUInt32LE(0x04034b50, 0);
    cabecalhoLocal.writeUInt16LE(20, 4); // versão mínima
    cabecalhoLocal.writeUInt16LE(0, 6); // flags
    cabecalhoLocal.writeUInt16LE(0, 8); // método: 0 = STORE
    cabecalhoLocal.writeUInt16LE(DOS_HORA, 10);
    cabecalhoLocal.writeUInt16LE(DOS_DATA, 12);
    cabecalhoLocal.writeUInt32LE(crc, 14);
    cabecalhoLocal.writeUInt32LE(tamanho, 18); // compactado == original (STORE)
    cabecalhoLocal.writeUInt32LE(tamanho, 22);
    cabecalhoLocal.writeUInt16LE(nomeBuffer.length, 26);
    cabecalhoLocal.writeUInt16LE(0, 28); // extra field length

    partesLocais.push(cabecalhoLocal, nomeBuffer, entrada.conteudo);

    const cabecalhoCentral = Buffer.alloc(46);
    cabecalhoCentral.writeUInt32LE(0x02014b50, 0);
    cabecalhoCentral.writeUInt16LE(20, 4); // versão que criou
    cabecalhoCentral.writeUInt16LE(20, 6); // versão mínima
    cabecalhoCentral.writeUInt16LE(0, 8); // flags
    cabecalhoCentral.writeUInt16LE(0, 10); // método
    cabecalhoCentral.writeUInt16LE(DOS_HORA, 12);
    cabecalhoCentral.writeUInt16LE(DOS_DATA, 14);
    cabecalhoCentral.writeUInt32LE(crc, 16);
    cabecalhoCentral.writeUInt32LE(tamanho, 20);
    cabecalhoCentral.writeUInt32LE(tamanho, 24);
    cabecalhoCentral.writeUInt16LE(nomeBuffer.length, 28);
    cabecalhoCentral.writeUInt16LE(0, 30); // extra field length
    cabecalhoCentral.writeUInt16LE(0, 32); // comment length
    cabecalhoCentral.writeUInt16LE(0, 34); // disk number start
    cabecalhoCentral.writeUInt16LE(0, 36); // internal attrs
    cabecalhoCentral.writeUInt32LE(0, 38); // external attrs
    cabecalhoCentral.writeUInt32LE(offset, 42); // offset do local header

    partesCentrais.push(cabecalhoCentral, nomeBuffer);

    offset += cabecalhoLocal.length + nomeBuffer.length + tamanho;
  }

  const inicioCentral = offset;
  const tamanhoCentral = partesCentrais.reduce((soma, parte) => soma + parte.length, 0);

  const fimCentral = Buffer.alloc(22);
  fimCentral.writeUInt32LE(0x06054b50, 0);
  fimCentral.writeUInt16LE(0, 4); // disco atual
  fimCentral.writeUInt16LE(0, 6); // disco do central directory
  fimCentral.writeUInt16LE(entradas.length, 8); // entradas neste disco
  fimCentral.writeUInt16LE(entradas.length, 10); // entradas totais
  fimCentral.writeUInt32LE(tamanhoCentral, 12);
  fimCentral.writeUInt32LE(inicioCentral, 16);
  fimCentral.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...partesLocais, ...partesCentrais, fimCentral]);
}
