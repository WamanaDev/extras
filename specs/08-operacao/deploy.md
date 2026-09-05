# Deploy

- **ID:** OPS-001
- **Status:** PRONTA

## Ambientes

| Ambiente | Banco | Dados |
|---|---|---|
| Local | Postgres em contêiner | seed sintético |
| Preview (por PR) | projeto Supabase efêmero | seed sintético |
| Staging | projeto próprio | seed sintético, volume realista |
| Produção | projeto próprio | reais |

**Dump de produção nunca desce** (`SEC-CONF`).

## Pipeline

```
PR → lint + typecheck → unidade → pgTAP → integração → concorrência
   → paridade → migrations up/down → varredura de segredos → preview
main → staging → smoke → aprovação humana → produção
```

## Migrations em produção

1. Verificar que nenhum ciclo tem janela de marcação aberta
2. Backup PITR marcado antes
3. `prisma migrate deploy`
4. Smoke: login, grade, marcação em plantão de teste, cancelamento
5. Rollback documentado antes de aplicar — migration sem plano de volta não sobe

## Janela

Terça, 03:00–05:00. Fora dela só correção crítica, com registro.

## Rollback

Código: redeploy da versão anterior na Vercel.
Banco: **migration de reversão**, nunca restore — restore descartaria marcações feitas
depois do deploy. Restore só em corrupção, seguindo `OPS-003`.
