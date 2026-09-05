/**
 * API-ADM-COL-004 — `POST /api/admin/colaboradores/importar`
 *
 * `multipart/form-data`, nunca `body` Zod: `defineHandler` só faz
 * `request.text()`/`JSON.parse` quando `config.body` está presente
 * (`src/server/http/handler.ts`, `parseBody`) — deixando `body` de fora
 * preserva o stream da requisição intocado até este handler ler
 * `request.formData()`. Campo do arquivo assumido como `arquivo` (nome não
 * fixado pela spec — convenção em português usada no resto do projeto).
 *
 * CSV nunca toca disco (SEC-CONF): lido inteiro em memória
 * (`await arquivo.text()`), processado, descartado. Só o hash SHA-256, as
 * contagens e a lista de erros (por número de linha, nunca valor) vão para
 * auditoria/log.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { defineHandler } from '@/server/http/handler';
import { erroDeValidacao, erroDeNegocio } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { obterPrisma, parseDataCivil } from '@/server/services/colaboradores';

const LIMITE_BYTES = 5 * 1024 * 1024;
const LIMITE_LINHAS = 1000;

interface ErroLinha {
  linha: number;
  campo: string;
  problema: string;
}

interface LinhaValida {
  linha: number;
  matricula: string;
  nome: string;
  rtId: string;
  turnoPadrao: 'DIURNO' | 'NOTURNO';
  escalaAncora: Date;
}

const TurnoSchema = z.enum(['DIURNO', 'NOTURNO']);

function parseCsv(texto: string): string[] {
  return texto
    .split(/\r\n|\n|\r/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
}

function criarHandlerImportar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    handler: async ({ ator, ctx, request }) => {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        throw erroDeValidacao({ _: 'Envie multipart/form-data com o arquivo CSV.' });
      }

      const previewCampo = formData.get('preview');
      const preview = previewCampo === 'true';

      const arquivo = formData.get('arquivo');
      if (!(arquivo instanceof Blob)) {
        throw erroDeValidacao({ arquivo: 'Arquivo CSV é obrigatório.' });
      }
      if (arquivo.size > LIMITE_BYTES) {
        throw erroDeValidacao({ arquivo: 'Arquivo excede o limite de 5 MB.' });
      }

      const conteudo = await arquivo.text();
      const hashArquivo = createHash('sha256').update(conteudo, 'utf8').digest('hex');
      const linhasBrutas = parseCsv(conteudo);

      if (linhasBrutas.length > LIMITE_LINHAS) {
        throw erroDeValidacao({ arquivo: `Arquivo excede o limite de ${LIMITE_LINHAS} linhas.` });
      }

      const rts = await prisma.rt.findMany({ select: { id: true, nome: true } });
      const rtPorNome = new Map(rts.map((rt) => [rt.nome.trim().toLowerCase(), rt.id]));

      const erros: ErroLinha[] = [];
      const validas: LinhaValida[] = [];
      const matriculasNoArquivo = new Map<string, number[]>();

      linhasBrutas.forEach((linhaTexto, indice) => {
        const numeroLinha = indice + 1;
        const campos = linhaTexto.split(';').map((c) => c.trim());
        const [matricula, nome, rtNome, turno, ancoraTexto] = campos;

        if (campos.length !== 5 || !matricula || !nome || !rtNome || !turno || !ancoraTexto) {
          erros.push({ linha: numeroLinha, campo: '_', problema: 'Linha deve ter 5 campos: matricula;nome;rt;turno;ancora.' });
          return;
        }

        let ok = true;
        const rtId = rtPorNome.get(rtNome.toLowerCase());
        if (!rtId) {
          erros.push({ linha: numeroLinha, campo: 'rt', problema: 'RT não encontrada.' });
          ok = false;
        }
        const turnoParse = TurnoSchema.safeParse(turno.toUpperCase());
        if (!turnoParse.success) {
          erros.push({ linha: numeroLinha, campo: 'turno', problema: 'Use DIURNO ou NOTURNO.' });
          ok = false;
        }
        const ancora = parseDataCivil(ancoraTexto);
        if (!ancora) {
          erros.push({ linha: numeroLinha, campo: 'ancora', problema: 'Use o formato AAAA-MM-DD.' });
          ok = false;
        }

        const linhasDaMatricula = matriculasNoArquivo.get(matricula) ?? [];
        linhasDaMatricula.push(numeroLinha);
        matriculasNoArquivo.set(matricula, linhasDaMatricula);

        if (ok && rtId && turnoParse.success && ancora) {
          validas.push({ linha: numeroLinha, matricula, nome, rtId, turnoPadrao: turnoParse.data, escalaAncora: ancora });
        }
      });

      // Matrícula duplicada dentro do próprio arquivo — aponta todas as linhas envolvidas (teste 4).
      for (const [matricula, linhas] of matriculasNoArquivo) {
        if (linhas.length > 1) {
          for (const linha of linhas) {
            erros.push({ linha, campo: 'matricula', problema: `Matrícula "${matricula}" duplicada no arquivo (linhas ${linhas.join(', ')}).` });
          }
        }
      }

      // Matrícula já cadastrada no banco.
      if (validas.length > 0) {
        const matriculasValidas = [...new Set(validas.map((v) => v.matricula))];
        const existentes = await prisma.colaborador.findMany({
          where: { matricula: { in: matriculasValidas } },
          select: { matricula: true },
        });
        const matriculasExistentes = new Set(existentes.map((e) => e.matricula));
        for (const linhaValida of validas) {
          if (matriculasExistentes.has(linhaValida.matricula)) {
            erros.push({ linha: linhaValida.linha, campo: 'matricula', problema: 'Matrícula já cadastrada.' });
          }
        }
      }

      const linhasComErro = new Set(erros.map((e) => e.linha));
      const linhasParaImportar = validas.filter((v) => !linhasComErro.has(v.linha));
      const validosCount = linhasParaImportar.length;

      if (preview) {
        return {
          validos: validosCount,
          erros,
          preview: linhasParaImportar.map((v) => ({ matricula: v.matricula, nome: v.nome, rtId: v.rtId, turnoPadrao: v.turnoPadrao })),
        };
      }

      if (linhasComErro.size > 0) {
        // Tudo ou nada (ACID/A): nenhuma linha é gravada se qualquer linha for inválida.
        return { validos: validosCount, erros };
      }

      const dados = linhasParaImportar.map((v) => ({
        matricula: v.matricula,
        nome: v.nome,
        rtId: v.rtId,
        turnoPadrao: v.turnoPadrao,
        escalaAncora: v.escalaAncora,
        pinHash: null,
        precisaTrocarPin: true,
      }));

      const importados = await emTransacao(prisma, async (tx) => {
        try {
          const resultado = await tx.colaborador.createMany({ data: dados });
          await registrarAuditoria(tx, {
            atorTipo: 'ADMIN',
            atorId: ator.adminId,
            acao: 'COLABORADOR_CRIADO',
            entidade: 'colaborador',
            entidadeId: null,
            // `COLABORADOR_IMPORTADO_LOTE` (nome literal da spec) não existe no
            // catálogo fechado `AcaoAuditoria` (SEC-AUD, `02-seguranca/`,
            // limite rígido) — registrado como `acaoEspecifica` no payload em
            // vez de inventar um valor fora do enum. Ver `_conflitos.md`.
            payload: { acaoEspecifica: 'COLABORADOR_IMPORTADO_LOTE', validos: validosCount, importados: resultado.count, erros: erros.length, hashArquivo },
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            requestId: ctx.requestId,
          });
          return resultado.count;
        } catch (erro) {
          if (typeof erro === 'object' && erro !== null && (erro as { code?: string }).code === 'P2002') {
            throw erroDeNegocio('Uma ou mais matrículas já existem.', 'MATRICULA_JA_EXISTE');
          }
          throw erro;
        }
      });

      return { validos: validosCount, erros, importados };
    },
  });
}

export const POST = criarHandlerImportar(obterPrisma());
