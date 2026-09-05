# Modelo de ameaças (STRIDE)

- **ID:** SEC-STRIDE
- **Status:** PRONTA

| # | Categoria | Ameaça | Impacto | Mitigação | Spec |
|---|---|---|---|---|---|
| S1 | Spoofing | Colega marca plantão usando matrícula alheia | Alto | PIN obrigatório | `API-AUTH-003` |
| S2 | Spoofing | Força bruta de PIN de 4 dígitos | Alto | Rate limit + bloqueio 15 min | `SEC-DISP` |
| S3 | Spoofing | Roubo de cookie de sessão | Alto | `httpOnly`+`Secure`+`SameSite`, sessão 8h, revogação | `SEC-CONF` |
| S4 | Spoofing | Enumeração de matrículas por timing | Médio | Resposta genérica de tempo constante | `API-AUTH-001` |
| T1 | Tampering | Cliente adulterado envia `plantaoId` de outra RT | Médio | Revalidação total em `FN-005` | `SEC-INT` |
| T2 | Tampering | Cliente envia `colaboradorId` de terceiro | Alto | Ator vem da sessão, nunca do body | `SEC-INT` |
| T3 | Tampering | Alteração de `audit_log` por acesso ao banco | Alto | Append-only + cadeia de hash | `SEC-INT` |
| T4 | Tampering | Injeção de SQL | Crítico | Prisma parametrizado, zero interpolação | `SEC-INT` |
| R1 | Repudiation | "Não fui eu que marquei" | Médio | `audit_log` com IP, UA e PIN como fator | `SEC-AUD` |
| R2 | Repudiation | Admin nega ter alterado limite | Médio | Auditoria de toda ação administrativa | `SEC-AUD` |
| I1 | Info disclosure | `anon key` lendo `marcacao` | Alto | RLS default deny; tabela fora da publication | `SEC-RLS` |
| I2 | Info disclosure | Matrícula ou PIN em log ou URL | Alto | Redator central + lint + teste de varredura | `SEC-CONF` |
| I3 | Info disclosure | Colaborador lê escala de terceiro pela API | Médio | Autorização por ator; `404` sem vazar existência | `SEC-INT` |
| I4 | Info disclosure | Motivo de ausência (saúde) exposto | Alto | `observacao` restrita ao admin | `SEC-CONF` |
| I5 | Info disclosure | Dump de produção em dev | Alto | Proibido; seed sintético | `SEC-CONF` |
| D1 | DoS | Avalanche na abertura da janela | Alto | Escalonamento por RT, jitter, cache curto | `SEC-DISP` |
| D2 | DoS | Bloqueio de conta alheia por erro proposital de PIN | Médio | Bloqueio temporário, nunca permanente automático | `SEC-DISP` |
| D3 | DoS | Transação aberta esgotando pool | Alto | `idle_in_transaction_session_timeout` | `SEC-DISP` |
| D4 | DoS | Query pesada de relatório na janela | Médio | `statement_timeout` + role readonly separado | `SEC-DISP` |
| E1 | Elevation | Colaborador chamando rota de admin | Alto | `requireAtor` obrigatório + lint | `SEC-INT` |
| E2 | Elevation | `service_role key` vazando ao cliente | Crítico | Só server-side; teste de bundle no CI | `SEC-CONF` |
| E3 | Elevation | RPC chamada direto pelo PostgREST com `anon` | Alto | `REVOKE EXECUTE ... FROM anon` em todas as funções | `SEC-RLS` |

## Risco residual aceito

| Risco | Por que aceitamos |
|---|---|
| PIN de 4 dígitos é fraco isoladamente | Combinado a matrícula + rate limit + bloqueio, o custo de ataque supera o benefício. Público sem e-mail corporativo torna MFA real inviável hoje. |
| Superusuário do banco pode adulterar auditoria | Fora do modelo. Mitigado por detecção (cadeia de hash), não prevenção. |
| Escala nominal visível entre colaboradores | Ela é afixada fisicamente na unidade. |
| Exclusion constraint não cruza tabelas | Coberto por `FN-004` sob advisory lock; decisão registrada em `SEC-ACID`. |
