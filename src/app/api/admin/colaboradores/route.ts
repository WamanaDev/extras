/**
 * API-ADM-COL-001 — `GET /api/admin/colaboradores` (listar)
 * API-ADM-COL-002 — `POST /api/admin/colaboradores` (criar)
 *
 * Mesmo arquivo para os dois métodos, como o entregável de ambas as specs
 * aponta (`src/app/api/admin/colaboradores/route.ts`).
 *
 * Cada rota expõe uma fábrica `criarHandlerX(prisma)` — permite injetar um
 * Prisma Client fake em teste, sem tocar banco de verdade nem depender do
 * singleton de produção (mesmo motivo do `criarDefineHandler` em
 * `src/server/http/handler.ts`: determinismo em teste). `GET`/`POST`
 * exportados usam o singleton real (`obterPrisma`, `src/server/services/colaboradores.ts`).
 */
import { z, type ZodSchema } from 'zod';
import type { PrismaClient, Prisma } from '@prisma/client';
import { defineHandler, paginacaoQuerySchema } from '@/server/http/handler';
import { erroDeNegocio, erroDeValidacao, ErroHttp } from '@/server/http/erros';
import { emTransacao } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { previewMeses } from '@/lib/escala/ancora';
import { obterPrisma, parseDataCivil, formatarDataCivil } from '@/server/services/colaboradores';

// ----------------------------------------------------------------------------
// GET — API-ADM-COL-001
// ----------------------------------------------------------------------------

const ListarQuerySchema = z
  .object({
    rt: z.string().uuid().optional(),
    ativo: z.enum(['true', 'false']).optional(),
    q: z.string().trim().min(1).max(200).optional(),
  })
  .merge(paginacaoQuerySchema);

type ListarQuerySaida = z.infer<typeof ListarQuerySchema>;

interface ColaboradorListagemLinha {
  id: string;
  nome: string;
  matricula: string;
  rt: { id: string; nome: string };
  turnoPadrao: string;
  escalaAncora: string;
  escalaPeriodo: number;
  ativo: boolean;
  pinDefinido: boolean;
  bloqueado: boolean;
  sessoesAtivas: number;
}

function serializarListagem(
  colaborador: {
    id: string;
    nome: string;
    matricula: string;
    turnoPadrao: string;
    escalaAncora: Date;
    escalaPeriodo: number;
    ativo: boolean;
    pinHash: string | null;
    bloqueadoAte: Date | null;
    rt: { id: string; nome: string };
    _count: { sessoes: number };
  },
  agora: Date,
): ColaboradorListagemLinha {
  return {
    id: colaborador.id,
    nome: colaborador.nome,
    matricula: colaborador.matricula,
    rt: colaborador.rt,
    turnoPadrao: colaborador.turnoPadrao,
    escalaAncora: formatarDataCivil(colaborador.escalaAncora),
    escalaPeriodo: colaborador.escalaPeriodo,
    ativo: colaborador.ativo,
    pinDefinido: colaborador.pinHash !== null,
    bloqueado: colaborador.bloqueadoAte !== null && colaborador.bloqueadoAte.getTime() > agora.getTime(),
    sessoesAtivas: colaborador._count.sessoes,
  };
}

function criarHandlerListar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    // Ver `admin/marcacoes/route.ts` — mesmo cast, mesma causa raiz
    // (`_conflitos.md`, item 13): `ListarQuerySchema` mescla
    // `paginacaoQuerySchema` (`.default()`), então Input diverge de Output e
    // não satisfaz `ZodSchema<TQuery>` sob `exactOptionalPropertyTypes`.
    query: ListarQuerySchema as unknown as ZodSchema<ListarQuerySaida>,
    paginacao: true,
    cache: 'pessoal',
    handler: async ({ query, ctx }) => {
      const where: Prisma.ColaboradorWhereInput = {};
      if (query.rt) where.rtId = query.rt;
      if (query.ativo !== undefined) where.ativo = query.ativo === 'true';
      if (query.q) {
        where.OR = [
          { nome: { contains: query.q, mode: 'insensitive' } },
          { matricula: { contains: query.q, mode: 'insensitive' } },
        ];
      }

      const [linhas, total] = await Promise.all([
        prisma.colaborador.findMany({
          where,
          skip: (query.pagina - 1) * query.tamanho,
          take: query.tamanho,
          orderBy: { nome: 'asc' },
          include: {
            rt: { select: { id: true, nome: true } },
            _count: { select: { sessoes: { where: { revogadaEm: null, expiraEm: { gt: ctx.agora } } } } },
          },
        }),
        prisma.colaborador.count({ where }),
      ]);

      return { itens: linhas.map((linha) => serializarListagem(linha, ctx.agora)), total };
    },
  });
}

export const GET = criarHandlerListar(obterPrisma());

// ----------------------------------------------------------------------------
// POST — API-ADM-COL-002
// ----------------------------------------------------------------------------

const CriarColaboradorSchema = z
  .object({
    matricula: z.string().trim().min(1, 'Matrícula é obrigatória.'),
    nome: z.string().trim().min(1, 'Nome é obrigatório.'),
    rtId: z.string().uuid('RT inválida.'),
    turnoPadrao: z.enum(['DIURNO', 'NOTURNO']),
    escalaAncora: z.string(),
    escalaPeriodo: z.number().int().min(1).optional(),
    escalaHoraInicio: z.string().optional(),
    escalaHoraFim: z.string().optional(),
  })
  .strict();

function parseHoraCivil(valor: string): Date | null {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
  if (!m) return null;
  const [, hStr, minStr, sStr] = m;
  const h = Number(hStr);
  const min = Number(minStr);
  const s = sStr ? Number(sStr) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return new Date(Date.UTC(1970, 0, 1, h, min, s));
}

/** `P2002` (violação de unicidade) do Prisma Client, para a constraint dada — `meta.target` traz o(s) campo(s). */
function ehViolacaoUnicidadeDoCampo(erro: unknown, campo: string): boolean {
  if (typeof erro !== 'object' || erro === null) return false;
  const candidato = erro as { code?: string; meta?: { target?: string[] | string } };
  if (candidato.code !== 'P2002') return false;
  const target = candidato.meta?.target;
  if (Array.isArray(target)) return target.includes(campo);
  return typeof target === 'string' && target.includes(campo);
}

function criarHandlerCriar(prisma: PrismaClient) {
  return defineHandler({
    ator: 'ADMIN',
    body: CriarColaboradorSchema,
    handler: async ({ body, ator, ctx }) => {
      const ancora = parseDataCivil(body.escalaAncora);
      if (!ancora) {
        throw new ErroHttp({ status: 422, codigo: 'ANCORA_INVALIDA', mensagem: 'Data de âncora inválida.', detalhes: { escalaAncora: 'Use o formato AAAA-MM-DD.' } });
      }
      let escalaHoraInicio: Date | null = null;
      let escalaHoraFim: Date | null = null;
      if (body.escalaHoraInicio !== undefined) {
        escalaHoraInicio = parseHoraCivil(body.escalaHoraInicio);
        if (!escalaHoraInicio) throw erroDeValidacao({ escalaHoraInicio: 'Use o formato HH:MM.' });
      }
      if (body.escalaHoraFim !== undefined) {
        escalaHoraFim = parseHoraCivil(body.escalaHoraFim);
        if (!escalaHoraFim) throw erroDeValidacao({ escalaHoraFim: 'Use o formato HH:MM.' });
      }

      const escalaPeriodo = body.escalaPeriodo ?? 2;

      const criado = await emTransacao(prisma, async (tx) => {
        let colaborador;
        try {
          colaborador = await tx.colaborador.create({
            data: {
              matricula: body.matricula,
              nome: body.nome,
              rtId: body.rtId,
              turnoPadrao: body.turnoPadrao,
              escalaAncora: ancora,
              escalaPeriodo,
              escalaHoraInicio,
              escalaHoraFim,
              pinHash: null,
              precisaTrocarPin: true,
            },
            include: { rt: { select: { id: true, nome: true } } },
          });
        } catch (erro) {
          if (ehViolacaoUnicidadeDoCampo(erro, 'matricula')) {
            throw erroDeNegocio('Já existe um colaborador com esta matrícula.', 'MATRICULA_JA_EXISTE');
          }
          throw erro;
        }

        await registrarAuditoria(tx, {
          atorTipo: 'ADMIN',
          atorId: ator.adminId,
          acao: 'COLABORADOR_CRIADO',
          entidade: 'colaborador',
          entidadeId: colaborador.id,
          payload: { matricula: colaborador.matricula, nome: colaborador.nome, rtId: colaborador.rtId, turnoPadrao: colaborador.turnoPadrao },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        });

        return colaborador;
      });

      const preview = previewMeses(ancora, escalaPeriodo, ctx.agora.getUTCFullYear(), ctx.agora.getUTCMonth() + 1, 3);

      return {
        colaborador: serializarListagem({ ...criado, _count: { sessoes: 0 } }, ctx.agora),
        preview,
      };
    },
  });
}

export const POST = criarHandlerCriar(obterPrisma());
