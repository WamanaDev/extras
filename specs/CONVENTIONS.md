# Convenções

## Nomenclatura

| Contexto | Padrão | Exemplo |
|---|---|---|
| Tabela / coluna | `snake_case` singular | `escala_dia`, `vagas_ocupadas` |
| Model / campo Prisma | `PascalCase` / `camelCase` | `EscalaDia`, `vagasOcupadas` |
| Função SQL | `snake_case` verbo primeiro | `marcar_extra`, `valida_descanso` |
| Rota | kebab-case, plural, português | `/api/admin/colaboradores` |
| Componente React | `PascalCase` | `GradeEscala` |
| Hook | `useAlgo` | `usePlantoesRealtime` |
| Código de erro | `SCREAMING_SNAKE`, sem acento | `EXCEDE_JORNADA` |

## Envelope de resposta

Sucesso: o recurso direto, sem wrapper.

```json
{ "id": "…", "data": "2026-09-04", "tipo": "NOTURNO" }
```

Erro: sempre este formato, com HTTP status coerente.

```json
{
  "erro": "EXCEDE_JORNADA",
  "mensagem": "Você já tem 24h seguidas nesse período.",
  "detalhes": null,
  "requestId": "01JB2X…"
}
```

`mensagem` é para o usuário final. `erro` é para o cliente decidir comportamento.
`detalhes` só é preenchido em erro de validação (mapa campo → problema).

## Status HTTP

| Situação | Status |
|---|---|
| Regra de negócio recusou | `409 Conflict` |
| Validação de payload | `422 Unprocessable Entity` |
| Não autenticado | `401` |
| Autenticado sem permissão | `403` |
| Rate limit | `429` + header `Retry-After` |
| Recurso inexistente ou sem visibilidade | `404` |

`404` é usado também quando o recurso existe mas o ator não pode saber disso —
não vazamos existência.

## Fuso horário

Tudo em `America/Sao_Paulo`. `date` para dias de escala, `timestamptz` para instantes.
Nunca `timestamp` sem timezone. `TZ=America/Sao_Paulo` no runtime e no banco.

## Datas na API

`date` como `YYYY-MM-DD`. Instantes como ISO-8601 com offset (`2026-09-04T19:00:00-03:00`).

## Logs

JSON estruturado com `requestId`, `atorTipo`, `atorId`, `rota`, `duracaoMs`, `status`.
Campos proibidos em log: `pin`, `token`, `cookie`, `authorization`, `tokenHash`.
Existe um redator central em `src/server/log/redact.ts` — todo log passa por ele.

## Git

Commit: `<tipo>(<spec-id>): descrição`. Ex.: `feat(API-COL-004): marcar extra com advisory lock`.
Uma spec por PR sempre que possível.
