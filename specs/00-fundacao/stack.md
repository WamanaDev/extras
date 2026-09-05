# Stack e decisões técnicas

- **ID:** FUND-003
- **Status:** PRONTA

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server Actions + Route Handlers no mesmo repo |
| Linguagem | TypeScript estrito | `any` proibido |
| Banco | PostgreSQL 15 (Supabase) | Constraints ricas, `tstzrange`, advisory locks |
| ORM | Prisma | Migrations versionadas; SQL cru via `$queryRaw` onde precisa |
| Realtime | Supabase Realtime | Postgres Changes + Broadcast |
| Cache / rate limit | Upstash Redis | Serverless, latência baixa |
| Auth admin | Supabase Auth + MFA | Pronto, auditável |
| Auth colaborador | Própria (matrícula + PIN) | Colaborador não tem e-mail corporativo |
| Validação | Zod | Schema compartilhado entre borda e serviço |
| UI | Tailwind + shadcn/ui | Velocidade |
| Testes | Vitest + Playwright + pgTAP | Unidade, e2e, e regras no banco |
| Deploy | Vercel | Preview por PR |

## Decisões registradas

**D-01 — Regras críticas moram no banco, não na aplicação.**
Limite, vaga, jornada e cruzada são validados em função PL/pgSQL. A aplicação valida antes
apenas para dar feedback rápido. Motivo: múltiplas instâncias serverless não compartilham
estado; só o banco serializa.

**D-02 — Pooler em modo transaction.**
Consequência: locks de sessão (`pg_advisory_lock`) não funcionam. Usar sempre a variante
transacional `pg_advisory_xact_lock`. Ver `02-seguranca/acid.md`.

**D-03 — `vagas_ocupadas` é denormalizado.**
Necessário para o Realtime não expor `marcacao`. Consequência: exige job de reconciliação.
Ver `08-operacao/observabilidade.md`.

**D-04 — Escala materializada, não calculada em tempo de leitura.**
Ausências precisam de linha para serem editadas e impressas. A geração é idempotente.

**D-05 — PIN obrigatório.**
Matrícula é identificador, não segredo. Ver `02-seguranca/confidencialidade.md`.
