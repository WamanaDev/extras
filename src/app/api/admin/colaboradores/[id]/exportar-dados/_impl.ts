/**
 * Implementação de `GET /api/admin/colaboradores/:id/exportar-dados` (API-ADM-COL-009).
 *
 * Separado de `route.ts` — ver docstring de `desbloquear/_impl.ts` (mesmo
 * motivo: Next.js 15 só aceita métodos HTTP como export de `route.ts`; aqui
 * a lista de exports extras era maior — fábrica, tipos e helpers de PDF).
 *
 * Atende o pedido de acesso do titular (LGPD art. 18) — reúne tudo que o
 * sistema guarda sobre a pessoa. Nunca inclui `pinHash` (CIA "C" da spec:
 * hash de credencial não é dado que o titular precise, e exportá-lo cria
 * uma cópia fora do banco). `observacaoRetencao` explicita o limite de
 * `02-seguranca/confidencialidade.md` ("Retenção e expurgo" / "LGPD"): a
 * exclusão é limitada pela guarda trabalhista de 5 anos após o desligamento
 * — texto fixo, retenção em si não é reimplementada aqui (limite rígido).
 *
 * Leitura inteira numa única transação (ACID da spec: "o pacote precisa ser
 * um retrato coerente").
 *
 * `?formato=pdf` reaproveita `pdfkit` (já presente em `package.json` desde
 * `API-ADM-ESC-004`, `src/server/services/escala-admin/export.ts`) em vez de
 * trazer outra dependência. Como `defineHandler` só serializa o retorno do
 * handler como JSON (mesmo conflito documentado em `_conflitos.md`, item 12,
 * e na mesma rota de referência acima), o PDF viaja em base64 dentro do
 * corpo do handler interno e a função `GET` (em `route.ts`) troca isso por
 * uma resposta binária de verdade — sem duplicar autenticação/auditoria.
 */
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { defineHandler } from '@/server/http/handler';
import { erroNaoEncontrado } from '@/server/http/erros';
import { emTransacao, type ClienteTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { formatarDataCivil } from '@/server/services/colaboradores';

const ParamsSchema = z.object({ id: z.string().uuid() });
const QuerySchema = z.object({ formato: z.enum(['json', 'pdf']).default('json') });

const OBSERVACAO_RETENCAO =
  'A exclusão destes dados é limitada pela obrigação de guarda trabalhista: registros de escala e ' +
  'marcação são retidos por 5 anos após o desligamento (base legal: execução de contrato de trabalho, ' +
  'art. 7º, V, e obrigação legal, art. 7º, II, da LGPD). O direito ao esquecimento não se aplica antes ' +
  'desse prazo — findo ele, o cadastro é apagado e o nome é pseudonimizado.';

interface CadastroExportado {
  id: string;
  matricula: string;
  nome: string;
  rt: { id: string; nome: string };
  turnoPadrao: string;
  escalaAncora: string;
  escalaPeriodo: number;
  escalaHoraInicio: string | null;
  escalaHoraFim: string | null;
  pinDefinido: boolean;
  precisaTrocarPin: boolean;
  ativo: boolean;
  criadoEm: string;
}

interface EscalaExportada {
  data: string;
  codigo: string;
  horaInicio: string | null;
  horaFim: string | null;
}

interface MarcacaoExportada {
  id: string;
  plantaoId: string;
  status: string;
  origem: string;
  cruzada: boolean;
  inicioEm: string;
  fimEm: string;
  motivo: string | null;
  criadoEm: string;
  canceladoEm: string | null;
}

interface TrocaEscalaExportada {
  id: string;
  vigenciaInicio: string;
  turno: string;
  ancora: string;
  periodo: number;
  motivo: string;
  criadoEm: string;
}

interface AcessoExportado {
  criadoEm: string;
  sucesso: boolean;
  motivo: string | null;
  ip: string;
}

export interface PacoteExportado {
  cadastro: CadastroExportado;
  escalas: EscalaExportada[];
  marcacoes: MarcacaoExportada[];
  trocasEscala: TrocaEscalaExportada[];
  acessos: AcessoExportado[];
  geradoEm: string;
  observacaoRetencao: string;
}

function formatarHora(hora: Date | null): string | null {
  return hora ? hora.toISOString().slice(11, 19) : null;
}

async function reunirPacote(tx: ClienteTransacao, colaboradorId: string, agora: Date): Promise<PacoteExportado> {
  const colaborador = await tx.colaborador.findUnique({
    where: { id: colaboradorId },
    include: { rt: { select: { id: true, nome: true } } },
  });
  if (!colaborador) throw erroNaoEncontrado('Colaborador não encontrado.');

  const [escalas, marcacoes, trocasEscala, acessos] = await Promise.all([
    tx.escalaDia.findMany({
      where: { colaboradorId },
      orderBy: { data: 'asc' },
      include: { codigoEscala: { select: { codigo: true } } },
    }),
    tx.marcacao.findMany({ where: { colaboradorId }, orderBy: { criadoEm: 'asc' } }),
    tx.trocaEscala.findMany({ where: { colaboradorId }, orderBy: { criadoEm: 'asc' } }),
    // "Acessos" = tentativas de login (sucesso e falha) — histórico mais completo
    // de tentativa de acesso do titular; sessões ativas não carregam informação
    // adicional além do que já está em `cadastro` (nunca expõe `tokenHash`).
    tx.tentativaLogin.findMany({ where: { colaboradorId }, orderBy: { criadoEm: 'desc' } }),
  ]);

  return {
    cadastro: {
      id: colaborador.id,
      matricula: colaborador.matricula,
      nome: colaborador.nome,
      rt: colaborador.rt,
      turnoPadrao: colaborador.turnoPadrao,
      escalaAncora: formatarDataCivil(colaborador.escalaAncora),
      escalaPeriodo: colaborador.escalaPeriodo,
      escalaHoraInicio: formatarHora(colaborador.escalaHoraInicio),
      escalaHoraFim: formatarHora(colaborador.escalaHoraFim),
      pinDefinido: colaborador.pinHash !== null,
      precisaTrocarPin: colaborador.precisaTrocarPin,
      ativo: colaborador.ativo,
      criadoEm: colaborador.criadoEm.toISOString(),
    },
    escalas: escalas.map((e) => ({
      data: formatarDataCivil(e.data),
      codigo: e.codigoEscala.codigo,
      horaInicio: formatarHora(e.horaInicio),
      horaFim: formatarHora(e.horaFim),
    })),
    marcacoes: marcacoes.map((m) => ({
      id: m.id,
      plantaoId: m.plantaoId,
      status: m.status,
      origem: m.origem,
      cruzada: m.cruzada,
      inicioEm: m.inicioEm.toISOString(),
      fimEm: m.fimEm.toISOString(),
      motivo: m.motivo,
      criadoEm: m.criadoEm.toISOString(),
      canceladoEm: m.canceladoEm ? m.canceladoEm.toISOString() : null,
    })),
    trocasEscala: trocasEscala.map((t) => ({
      id: t.id,
      vigenciaInicio: formatarDataCivil(t.vigenciaInicio),
      turno: t.turno,
      ancora: formatarDataCivil(t.ancora),
      periodo: t.periodo,
      motivo: t.motivo,
      criadoEm: t.criadoEm.toISOString(),
    })),
    acessos: acessos.map((a) => ({
      criadoEm: a.criadoEm.toISOString(),
      sucesso: a.sucesso,
      motivo: a.motivo,
      ip: a.ip,
    })),
    geradoEm: agora.toISOString(),
    observacaoRetencao: OBSERVACAO_RETENCAO,
  };
}

/** PDF simples, texto corrido — a spec não define layout; a exportação em si (dados corretos, sem hash de credencial) é o requisito, não formatação de impressão. */
function gerarPdfDoPacote(pacote: PacoteExportado): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const partes: Buffer[] = [];
    doc.on('data', (parte: Buffer) => partes.push(parte));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    doc.fontSize(14).text(`Exportação de dados — ${pacote.cadastro.nome} (matrícula ${pacote.cadastro.matricula})`);
    doc.moveDown();
    doc.fontSize(10);
    doc.text(`RT: ${pacote.cadastro.rt.nome}`);
    doc.text(`Turno padrão: ${pacote.cadastro.turnoPadrao}`);
    doc.text(`Âncora de escala: ${pacote.cadastro.escalaAncora} (período ${pacote.cadastro.escalaPeriodo})`);
    doc.text(`Ativo: ${pacote.cadastro.ativo ? 'sim' : 'não'}`);
    doc.moveDown();
    doc.text(`Dias de escala registrados: ${pacote.escalas.length}`);
    doc.text(`Marcações registradas: ${pacote.marcacoes.length}`);
    doc.text(`Trocas de escala registradas: ${pacote.trocasEscala.length}`);
    doc.text(`Tentativas de acesso registradas: ${pacote.acessos.length}`);
    doc.moveDown();
    doc.fontSize(9).text(pacote.observacaoRetencao, { align: 'justify' });
    doc.moveDown();
    doc.fontSize(8).text(`Gerado em ${pacote.geradoEm}`);

    doc.end();
  });
}

export interface CorpoExportacao {
  formato: 'json' | 'pdf';
  pacote?: PacoteExportado;
  bufferBase64?: string;
}

export function criarHandlerExportarDados(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    params: ParamsSchema,
    query: QuerySchema,
    cache: 'pessoal',
    handler: async ({ params, query, ator, ctx }): Promise<CorpoExportacao> => {
      return emTransacao(prisma, async (tx) => {
        const pacote = await reunirPacote(tx, params.id, ctx.agora);

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'EXPORTACAO_DADOS',
          entidade: 'colaborador',
          entidadeId: params.id,
          payload: {
            escopo: 'colaborador',
            formato: query.formato,
            registros: {
              escalas: pacote.escalas.length,
              marcacoes: pacote.marcacoes.length,
              trocasEscala: pacote.trocasEscala.length,
              acessos: pacote.acessos.length,
            },
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        if (query.formato === 'json') {
          return { formato: 'json', pacote };
        }

        const buffer = await gerarPdfDoPacote(pacote);
        return { formato: 'pdf', bufferBase64: buffer.toString('base64') };
      });
    },
  });
}
