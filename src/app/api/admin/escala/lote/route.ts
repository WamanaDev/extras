/**
 * `API-ADM-ESC-003` — `POST /api/admin/escala/lote`.
 *
 * Lança a mesma ausência num intervalo de datas — férias, licença,
 * treinamento de vários dias. Ver
 * `specs/04-api/admin-escala/API-ADM-ESC-003-lote.md`.
 */
import { z } from 'zod';
import { defineHandler } from '@/server/http/handler';
import { obterPrisma } from '@/server/db/client';
import { emTransacao, travarColaborador } from '@/server/db/tx';
import { registrarAuditoria } from '@/server/audit/registrar';
import { erroDominioEscala } from '@/server/services/escala-admin/erros';
import { simularCoberturaAposTroca } from '@/server/services/escala-admin/cobertura';
import { fonteBlocosOcupadosEmMemoria, revalidarJornadaDoDia } from '@/server/services/escala-admin/jornada';
import { broadcastEscalaAtualizada } from '@/server/services/escala-admin/broadcast';
import { HORAS_POR_BLOCO } from '@/lib/escala/blocos';

const MAX_DIAS_INTERVALO = 92;

const BodySchema = z
  .object({
    colaboradorId: z.string().uuid(),
    de: z.string().date(),
    ate: z.string().date(),
    codigo: z.string().min(1),
    observacao: z.string().optional(),
    confirmarImpacto: z.boolean().optional(),
  })
  .refine((b) => b.de <= b.ate, { message: '"de" deve ser anterior ou igual a "ate".', path: ['ate'] })
  .refine((b) => diasNoIntervalo(b.de, b.ate) <= MAX_DIAS_INTERVALO, {
    message: `Intervalo não pode exceder ${MAX_DIAS_INTERVALO} dias.`,
    path: ['ate'],
  });

function paraDataUtc(iso: string): Date {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, dia!));
}

function diasNoIntervalo(de: string, ate: string): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((+paraDataUtc(ate) - +paraDataUtc(de)) / MS_POR_DIA) + 1;
}

interface LinhaCoberturaCiclo {
  data: Date;
  rt_codigo: string;
  turno: 'DIURNO' | 'NOTURNO';
  total: number;
  minimo: number;
}

export const POST = defineHandler({
  ator: 'ADMIN',
  rateLimit: { escopo: 'global_por_ip' },
  body: BodySchema,
  handler: async ({ ator, body, ctx }) => {
    const prisma = await obterPrisma();

    const resultado = await emTransacao(prisma, async (tx) => {
      const colaborador = await tx.colaborador.findUnique({
        where: { id: body.colaboradorId },
        include: { rt: true, trocasEscala: true },
      });
      if (!colaborador) {
        throw erroDominioEscala(422, 'CODIGO_INVALIDO', 'Colaborador inválido.', { colaboradorId: 'Colaborador não encontrado.' });
      }

      const codigoNovo = await tx.codigoEscala.findFirst({ where: { codigo: body.codigo, ativo: true } });
      if (!codigoNovo) {
        throw erroDominioEscala(422, 'CODIGO_INVALIDO', 'Código de escala inválido ou inativo.', { codigo: 'Código de escala inválido ou inativo.' });
      }

      const de = paraDataUtc(body.de);
      const ate = paraDataUtc(body.ate);

      // Passo 1: advisory lock do colaborador, UMA vez para o lote inteiro
      // (I — reduz contenção, mantém ordem de locks previsível).
      await travarColaborador(tx, colaborador.id);

      // Passo 2: seleciona escala_dia do intervalo. Dias sem escala são
      // ignorados, nunca criados (DOM-003/CIA "I"). Ciclo FECHADO também é
      // ignorado aqui (RN-25, "ciclo fechado é imutável") — não listado nos
      // testes de aceitação desta spec, mas é a mesma regra que
      // API-ADM-ESC-002 aplica por dia; estender ao lote evita reintroduzir
      // uma exceção silenciosa a RN-25.
      const linhasEscala = await tx.escalaDia.findMany({
        where: { colaboradorId: colaborador.id, data: { gte: de, lte: ate }, ciclo: { status: { not: 'FECHADO' } } },
        include: { codigoEscala: true, ciclo: true },
      });

      const totalDiasIntervalo = diasNoIntervalo(body.de, body.ate);
      const ignorados = totalDiasIntervalo - linhasEscala.length;

      // Passo 3: impacto agregado — extras marcadas no intervalo (qualquer
      // dia, mesmo fora das linhas de escala_dia selecionadas) e dias que
      // cruzariam o mínimo de cobertura.
      const extrasNoIntervalo = await tx.marcacao.findMany({
        where: { colaboradorId: colaborador.id, status: 'CONFIRMADA', plantao: { data: { gte: de, lte: ate } } },
        select: { id: true, plantaoId: true, plantao: { select: { data: true } } },
      });

      const cicloIdsDistintos = [...new Set(linhasEscala.map((l) => l.cicloId))];
      const coberturaPorCiclo = new Map<string, LinhaCoberturaCiclo[]>();
      for (const cicloId of cicloIdsDistintos) {
        const linhas = await tx.$queryRaw<LinhaCoberturaCiclo[]>`SELECT * FROM cobertura_ciclo(${cicloId}::uuid)`;
        coberturaPorCiclo.set(cicloId, linhas);
      }

      const diasComDeficit: Array<{ data: string; rt: string; turno: string; total: number; minimo: number; deficit: number }> = [];
      for (const linha of linhasEscala) {
        const coberturaDoCiclo = coberturaPorCiclo.get(linha.cicloId) ?? [];
        const coberturaDoDia = coberturaDoCiclo.find(
          (c) => c.data.getUTCDate() === linha.data.getUTCDate() && c.rt_codigo === colaborador.rt.nome,
        );
        if (!coberturaDoDia) continue;
        const simulado = simularCoberturaAposTroca(
          { rt: coberturaDoDia.rt_codigo, turno: coberturaDoDia.turno, total: Number(coberturaDoDia.total), minimo: Number(coberturaDoDia.minimo) },
          linha.codigoEscala.presenca,
          codigoNovo.presenca,
        );
        if (simulado.deficit > 0) {
          diasComDeficit.push({
            data: linha.data.toISOString().slice(0, 10),
            rt: simulado.rt,
            turno: simulado.turno,
            total: simulado.total,
            minimo: simulado.minimo,
            deficit: simulado.deficit,
          });
        }
      }

      // Passo 4: sem confirmação e com impacto → 409.
      const temImpacto = extrasNoIntervalo.length > 0 || diasComDeficit.length > 0;
      if (temImpacto && !body.confirmarImpacto) {
        throw erroDominioEscala(409, 'IMPACTO_NAO_CONFIRMADO', 'Esta alteração em lote afeta extras marcadas ou a cobertura mínima. Confirme para prosseguir.');
      }

      // Passo 5: aplica em massa.
      if (linhasEscala.length > 0) {
        await tx.escalaDia.updateMany({
          where: { id: { in: linhasEscala.map((l) => l.id) } },
          data: { codigoEscalaId: codigoNovo.id, ...(body.observacao !== undefined ? { observacao: body.observacao } : {}) },
        });
      }

      // ... revalida jornada ao final: só quando o código novo ocupa
      // horário, um dia que antes liberava (F) pode agora encadear >
      // maxBlocosSeguidos. `excluirEscalaDiaId` evita que a própria linha já
      // atualizada (leitura consistente dentro da mesma transação) conte
      // como bloco vizinho de si mesma.
      //
      // Uma única consulta cobrindo TODA a janela do lote, em vez de duas
      // consultas por dia (`fonteBlocosOcupadosPrisma`) — um lote de 15 dias
      // fazia 30 round-trips sequenciais ao Postgres, o suficiente pra
      // estourar timeout contra um banco remoto e derrubar o lote inteiro
      // com 500 (achado em uso real, `_conflitos.md`). A janela de cada dia é
      // `±(maxBlocos+1)*12h` (`calculaJanela`, `jornada.ts`); aqui buscamos
      // uma margem generosa (maior `maxBlocosSeguidos` do lote + 1 dia de
      // folga) que cobre a janela de QUALQUER dia do intervalo, e filtramos
      // por dia em memória (`fonteBlocosOcupadosEmMemoria`) — resultado
      // idêntico ao de consultar dia a dia, só sem o round-trip repetido.
      if (codigoNovo.ocupaHorario && linhasEscala.length > 0) {
        const maxBlocosDoLote = Math.max(...linhasEscala.map((l) => l.ciclo.maxBlocosSeguidos));
        const margemMs = (maxBlocosDoLote + 1) * HORAS_POR_BLOCO * 60 * 60 * 1000 + 24 * 60 * 60 * 1000;
        const janelaDe = new Date(+de - margemMs);
        const janelaAte = new Date(+ate + margemMs);

        const [linhasEscalaJanela, marcacoesJanela] = await Promise.all([
          tx.escalaDia.findMany({
            where: { colaboradorId: colaborador.id, data: { gte: janelaDe, lte: janelaAte } },
            select: { id: true, data: true, codigoEscala: { select: { presenca: true, ocupaHorario: true } } },
          }),
          tx.marcacao.findMany({
            where: { colaboradorId: colaborador.id, status: 'CONFIRMADA', inicioEm: { lt: janelaAte }, fimEm: { gt: janelaDe } },
            select: { inicioEm: true, fimEm: true },
          }),
        ]);

        const fonte = fonteBlocosOcupadosEmMemoria(
          linhasEscalaJanela.map((l) => ({ id: l.id, data: l.data, presenca: l.codigoEscala.presenca, ocupaHorario: l.codigoEscala.ocupaHorario })),
          marcacoesJanela,
        );

        for (const linha of linhasEscala) {
          const resultadoJornada = await revalidarJornadaDoDia({
            fonte,
            colaborador,
            trocas: colaborador.trocasEscala,
            data: linha.data,
            maxBlocos: linha.ciclo.maxBlocosSeguidos,
            excluirEscalaDiaId: linha.id,
          });
          if (resultadoJornada === 'EXCEDE_JORNADA') {
            throw erroDominioEscala(409, 'EXCEDE_JORNADA', 'Esta alteração em lote faria o colaborador exceder a jornada máxima seguida.');
          }
        }
      }

      // Passo 6: UMA entrada de auditoria com o intervalo, não uma por dia.
      await registrarAuditoria(tx, {
        atorTipo: 'ADMIN',
        atorId: ator.adminId,
        acao: 'AUSENCIA_ALTERADA',
        entidade: 'escala_dia',
        entidadeId: null,
        payload: { colaboradorId: colaborador.id, de: body.de, ate: body.ate, codigo: codigoNovo.codigo, alterados: linhasEscala.length, ignorados },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });

      return {
        alterados: linhasEscala.length,
        ignorados,
        impacto: {
          extrasAfetadas: extrasNoIntervalo.map((m) => ({ marcacaoId: m.id, plantaoId: m.plantaoId, data: m.plantao.data.toISOString().slice(0, 10) })),
          diasComDeficit,
        },
        colaboradorId: colaborador.id,
        diasAlterados: linhasEscala.map((l) => ({ cicloId: l.cicloId, data: l.data.toISOString().slice(0, 10) })),
      };
    });

    // Broadcast só após o commit (SEC-ACID / canais.md, RT-001): um evento
    // `escala:atualizada` por dia alterado — o payload documentado em
    // `canais.md` é `{ colaboradorId, data }` (um dia por evento), e o lote
    // pode cruzar mais de um ciclo (intervalo de até 92 dias). Best-effort,
    // como `broadcastEscalaAtualizada` já é (ver docstring daquele módulo).
    await Promise.all(
      resultado.diasAlterados.map((dia) => broadcastEscalaAtualizada(dia.cicloId, { colaboradorId: resultado.colaboradorId, data: dia.data })),
    );

    const { diasAlterados: _diasAlterados, colaboradorId: _colaboradorId, ...resposta } = resultado;
    return resposta;
  },
});
