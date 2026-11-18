# Conflitos e dependências não resolvidas

Registrado por sub-agente conforme `specs/AGENTS.md`, item 2. Não decidido
unilateralmente — aguarda revisão humana.

_Zerado em 2026-09-08: os 58 itens acumulados até aqui foram incorporados às
specs correspondentes em `specs/` (arquivos existentes corrigidos para bater
com o schema/código real, e specs novas criadas para features que ainda não
tinham uma — Google Calendar, login rápido, fluxo de cancelamento com
aprovação, navegação entre ciclos, rotas de referência de admin, RLS das
tabelas criadas após `20260101000009_rls`, entre outras). Histórico
disponível no controle de versão (`git log -- _conflitos.md`) para quem
precisar consultar o raciocínio original de qualquer item._

## 1. Segundo fator do admin removido (2026-11-18)

Decisão do usuário (produto): o login de admin passa a ser só e-mail + senha, por ora. Foram
removidos o MFA TOTP do Supabase e o código por WhatsApp. `API-AUTH-006`, `stack.md`,
`visao-geral.md`, `contrato-comum.md` e `06-frontend/paginas.md` já atualizados.

Pontos para revisão humana:
- **Risco:** senha vazada = acesso total ao painel de maior privilégio (identificação de
  colaboradores, auditoria, dado de saúde em `observacao`).
- **Mitigação atual:** rate limit de 5/15min por e-mail e 20/15min por IP; auditoria de
  `LOGIN_ADMIN_SUCESSO`/`LOGIN_ADMIN_FALHA`. Sugestão: reavaliar um segundo fator em breve.
- **Admins com fator TOTP já cadastrado no Supabase** continuam entrando normalmente: a senha
  gera uma sessão `aal1` e nada mais verifica o AAL. Fatores sobrando podem ser limpos (opcional)
  no SQL editor do Supabase com `delete from auth.mfa_factors;`.
