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

## 1. Segundo fator do admin: MFA TOTP → código no WhatsApp (2026-11-17)

Pedido do usuário: o app autenticador era atrito demais para a equipe. Trocado por código de
6 dígitos enviado pelo WhatsApp (Evolution API própria). `API-AUTH-006`, `stack.md`,
`visao-geral.md`, `contrato-comum.md` e `06-frontend/paginas.md` já atualizados.

Pontos para revisão humana:
- **Segurança:** código por WhatsApp é mais fraco que TOTP — quem tomar a conta de WhatsApp
  do admin (SIM swap, WhatsApp Web aberto) mais a senha entra. Aceito em troca de atrito.
- **Falha corrigida junto:** os guardas de admin (`resolverSessaoAdmin`, layout de
  `/admin/*`) não checavam `aal2`; a rota de login gravava a sessão do Supabase logo após a
  senha, então senha sozinha já dava acesso. Agora exigem o cookie `admin_2fa`.
- **Sessão de 4h** (`API-AUTH-006`, CIA "I") passa a valer de fato: o `admin_2fa` expira em 4h.
- **Dependência nova de disponibilidade:** Evolution API fora do ar = nenhum admin entra
  (falha fechada). Variáveis `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`.
- **Primeiro acesso:** WhatsApp só é gravado por service role (`app_metadata`). Admins já
  existentes precisam de `scripts/admin-whatsapp.ts` (ou SQL em `auth.users`) antes do deploy.
- `confidencialidade.md` não lista o telefone de admin como dado coletado — `/privacidade`
  já foi atualizada.
