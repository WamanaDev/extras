/**
 * DB-005 (specs/03-banco/migrations.md, seção "Seed") — `prisma/seed.ts`.
 *
 * Idempotente (upsert por chave primária fixa — ver `020260101000010_seed_referencia`
 * para o porquê de não usar `ON CONFLICT` por coluna de negócio ainda).
 *
 * Roda sempre (qualquer ambiente, incluindo produção — é intencional e seguro):
 *   1. `seedReferencia`   — RT1, RT2, códigos D/F/FT/FE (mesmos ids fixos da
 *                           migration `010_seed_referencia`, então rodar isto
 *                           depois daquela migration é um no-op idempotente).
 *   2. `seedAdminInicial` — cria (ou reaproveita) o admin inicial via Supabase
 *                           Auth Admin API, com convite que expira em 24h.
 *                           **Nunca** cria colaborador fictício — DOM-003/
 *                           migrations.md são explícitos sobre isso.
 *
 * Só roda com a flag `--dev` (script `seed:dev`), e nunca em produção:
 *   3. `seedDev` — ~80 colaboradores sintéticos com matrícula sequencial
 *      (SEC-CONF, "Dados em ambientes não-produtivos").
 *
 * Uso: `npx prisma db seed` (roda 1+2) · `npm run seed:dev` (roda 1+2+3).
 */
import { PrismaClient, type Turno } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { CODIGOS_BASE } from "../src/lib/escala/codigos";

const prisma = new PrismaClient();

// Mesmos ids fixos usados em
// prisma/migrations/20260101000010_seed_referencia/migration.sql — upsert por
// `id` (PK) não depende de nenhuma UNIQUE de negócio ainda não implementada
// (essa é responsabilidade do Agente F em 004_constraints).
const RT_IDS: Record<"RT1" | "RT2", string> = {
  RT1: "00000000-0000-4000-8000-000000000001",
  RT2: "00000000-0000-4000-8000-000000000002",
};

const CODIGO_IDS: Record<string, string> = {
  D: "00000000-0000-4000-8000-000000000011",
  F: "00000000-0000-4000-8000-000000000012",
  FT: "00000000-0000-4000-8000-000000000013",
  FE: "00000000-0000-4000-8000-000000000014",
};

async function seedReferencia(): Promise<void> {
  await prisma.rt.upsert({
    where: { id: RT_IDS.RT1 },
    update: { nome: "RT1", ativo: true },
    create: { id: RT_IDS.RT1, nome: "RT1", ativo: true },
  });
  await prisma.rt.upsert({
    where: { id: RT_IDS.RT2 },
    update: { nome: "RT2", ativo: true },
    create: { id: RT_IDS.RT2, nome: "RT2", ativo: true },
  });

  for (const codigo of CODIGOS_BASE) {
    const id = CODIGO_IDS[codigo.codigo];
    if (id === undefined) {
      throw new Error(
        `[seed] codigo_escala '${codigo.codigo}' sem id fixo mapeado em CODIGO_IDS — atualize prisma/seed.ts.`,
      );
    }
    await prisma.codigoEscala.upsert({
      where: { id },
      update: {
        codigo: codigo.codigo,
        descricao: codigo.descricao,
        presenca: codigo.presenca,
        ocupaHorario: codigo.ocupaHorario,
        remunerada: codigo.remunerada,
        ativo: codigo.ativo,
        bloqueado: codigo.bloqueado,
        cor: codigo.cor,
      },
      create: {
        id,
        codigo: codigo.codigo,
        descricao: codigo.descricao,
        presenca: codigo.presenca,
        ocupaHorario: codigo.ocupaHorario,
        remunerada: codigo.remunerada,
        ativo: codigo.ativo,
        bloqueado: codigo.bloqueado,
        cor: codigo.cor,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log("[seed] referência ok: RT1, RT2, códigos D/F/FT/FE");
}

/**
 * Cria o admin inicial via Supabase Auth Admin API (FUND-003: "Auth admin:
 * Supabase Auth + MFA" — admin não é linha de `colaborador`). Usa convite por
 * e-mail (o link expira sozinho — Supabase gerencia a janela, tipicamente
 * 24h), nunca gera nem loga senha em claro (SEC-CONF).
 *
 * Requer `ADMIN_INICIAL_EMAIL` no ambiente. Sem ela, pula com aviso — não é
 * erro fatal porque em ambientes de CI/teste esse bootstrap não faz sentido.
 */
async function seedAdminInicial(): Promise<void> {
  const email = process.env.ADMIN_INICIAL_EMAIL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!email || !supabaseUrl || !serviceRoleKey) {
    // eslint-disable-next-line no-console
    console.warn(
      "[seed] ADMIN_INICIAL_EMAIL/NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes — pulando bootstrap do admin inicial.",
    );
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { precisaDefinirSenha: true, origem: "seed_referencia" },
  });

  if (error) {
    // "already been registered" (ou equivalente) é o caminho idempotente —
    // rodar o seed de novo não deve recriar nem reconvidar o admin existente.
    const jaExiste = /registered|exists/i.test(error.message);
    if (!jaExiste) {
      throw new Error(`[seed] falha ao convidar admin inicial: ${error.message}`);
    }
    // eslint-disable-next-line no-console
    console.log("[seed] admin inicial já existe — nada a fazer.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] convite enviado ao admin inicial (${email}), expira conforme política do projeto Supabase.`);
}

// ----------------------------------------------------------------------------
// Dev only — nunca em produção (SEC-CONF, "Dados em ambientes não-produtivos").
// ----------------------------------------------------------------------------

const NOMES = [
  "Ana", "Bruno", "Carla", "Diego", "Elaine", "Felipe", "Gabriela", "Hugo",
  "Iris", "João", "Karina", "Lucas", "Marina", "Nelson", "Olivia", "Paulo",
  "Queila", "Rafael", "Sabrina", "Thiago",
];
const SOBRENOMES = [
  "Silva", "Souza", "Costa", "Pereira", "Oliveira", "Santos", "Almeida",
  "Ferreira", "Ribeiro", "Carvalho",
];

async function seedDev(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[seed] seedDev não pode rodar com NODE_ENV=production.");
  }

  const total = 80;
  for (let i = 0; i < total; i++) {
    const nome = `${NOMES[i % NOMES.length]} ${SOBRENOMES[i % SOBRENOMES.length]} (dev ${i + 1})`;
    const matricula = `DEV${String(i + 1).padStart(4, "0")}`;
    const rtId = i % 2 === 0 ? RT_IDS.RT1 : RT_IDS.RT2;
    const turnoPadrao: Turno = i % 2 === 0 ? "DIURNO" : "NOTURNO";
    // Âncora espalhada em torno de 2026-01-01/02 para cobrir os dois lados da paridade (DOM-001).
    const escalaAncora = new Date(Date.UTC(2026, 0, 1 + (i % 2)));
    // Id determinístico (não `matricula`, que ainda não é @unique no Prisma —
    // isso é DB-002/Agente F): upsert por PK é o único caminho idempotente
    // disponível a este agente, igual ao padrão de `seedReferencia`.
    const id = `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

    await prisma.colaborador.upsert({
      where: { id },
      update: {},
      create: {
        id,
        matricula,
        nome,
        rtId,
        turnoPadrao,
        escalaAncora,
        escalaPeriodo: 2,
        precisaTrocarPin: true,
        ativo: true,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] seed:dev ok: ${total} colaboradores sintéticos.`);
}

async function main(): Promise<void> {
  await seedReferencia();
  await seedAdminInicial();

  if (process.argv.includes("--dev")) {
    await seedDev();
  }
}

main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error("[seed] falhou:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
