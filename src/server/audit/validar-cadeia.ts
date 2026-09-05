/**
 * SEC-AUD — Job de validação diária da cadeia de hash (AUD-4).
 *
 * Entregável explícito de `specs/02-seguranca/auditoria.md` ("job de
 * validação da cadeia"). Lê `audit_log` inteira (ou em páginas, para tabelas
 * grandes — ver `PAGE_SIZE`) em ordem de inserção e delega a verificação para
 * a função pura `validarCadeia` de `hash-chain.ts`. Quebra = alerta crítico,
 * nunca correção silenciosa (mesmo espírito do job de reconciliação de
 * `vagas_ocupadas` em `SEC-ACID`).
 *
 * Depende da tabela `audit_log` de `03-banco/modelo-dados.md`, ainda
 * inexistente neste repositório — a função `buscarTodasAsLinhas` só terá
 * efeito real depois que a Onda 1 (03-banco) rodar.
 */
import { validarCadeia, type LinhaAuditLog, type ResultadoValidacaoCadeia } from './hash-chain';
import type { PrismaClient } from '@prisma/client';

const PAGE_SIZE = 5_000;

interface LinhaBruta {
  id: string;
  hash_anterior: string | null;
  hash: string;
  ator_id: string | null;
  acao: string;
  entidade_id: string | null;
  payload: unknown;
  criado_em: Date;
}

async function buscarTodasAsLinhas(prisma: PrismaClient): Promise<LinhaAuditLog[]> {
  const resultado: LinhaAuditLog[] = [];
  let cursorCriadoEm: Date | null = null;
  let cursorId: string | null = null;

  for (;;) {
    const pagina: LinhaBruta[] = await prisma.$queryRaw<LinhaBruta[]>`
      SELECT id, hash_anterior, hash, ator_id, acao, entidade_id, payload, criado_em
        FROM audit_log
       WHERE (${cursorCriadoEm}::timestamptz IS NULL)
          OR (criado_em, id) > (${cursorCriadoEm}::timestamptz, ${cursorId}::uuid)
       ORDER BY criado_em ASC, id ASC
       LIMIT ${PAGE_SIZE}
    `;

    if (pagina.length === 0) break;

    for (const linha of pagina) {
      resultado.push({
        id: linha.id,
        hashAnterior: linha.hash_anterior,
        hash: linha.hash,
        atorId: linha.ator_id,
        acao: linha.acao,
        entidadeId: linha.entidade_id,
        payloadTexto: JSON.stringify(linha.payload),
        criadoEm: linha.criado_em.toISOString(),
      });
    }

    const ultima: LinhaBruta | undefined = pagina[pagina.length - 1];
    if (!ultima || pagina.length < PAGE_SIZE) break;
    cursorCriadoEm = ultima.criado_em;
    cursorId = ultima.id;
  }

  return resultado;
}

/**
 * Executa a validação completa contra o banco. Uso: job agendado diário
 * (`08-operacao/`), que chama isto e, se `integra === false`, dispara alerta
 * crítico com o resultado completo (nunca corrige — AUD-4/I4).
 */
export async function rodarValidacaoDiaria(prisma: PrismaClient): Promise<ResultadoValidacaoCadeia> {
  const linhas = await buscarTodasAsLinhas(prisma);
  return validarCadeia(linhas);
}
