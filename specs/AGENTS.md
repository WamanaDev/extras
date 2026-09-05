# Instruções para sub-agentes

## Contrato de trabalho

1. **Leia o cabeçalho da spec.** Ele lista `Pré-requisitos` (specs a ler antes) e
   `Entregáveis` (arquivos que você deve produzir). Não invente escopo fora disso.
2. **Não altere outras specs.** Se encontrar contradição, pare e registre em
   `_conflitos.md` na raiz, com os IDs envolvidos. Não decida sozinho.
3. **Não relaxe regra de segurança para fazer teste passar.** Se a regra atrapalha,
   isso é um conflito — veja o item 2.
4. **Toda mutação de dados nasce dentro de transação.** Ver `02-seguranca/acid.md`.
   Nunca componha estado com duas chamadas separadas.
5. **Nunca confie no cliente.** A UI pode antecipar um bloqueio para dar feedback,
   mas a decisão final é sempre do banco.
6. **Entregue teste junto.** Toda spec tem seção `Testes de aceitação`. Sem eles a
   entrega não é considerada completa.

## Limites rígidos

Estes itens não podem ser alterados por nenhum sub-agente sem revisão humana explícita:

- Qualquer coisa em `02-seguranca/`
- Constraints e triggers em `03-banco/constraints.md` e `03-banco/triggers.md`
- Corpo de `FN-005 marcar_extra` e `FN-004 valida_descanso`
- Políticas RLS em `02-seguranca/rls-policies.md`
- Retenção e mascaramento de dados pessoais

## Formato de saída

- Código em TypeScript estrito. `any` proibido; use `unknown` + narrowing.
- SQL em migrations versionadas (`prisma/migrations/`). `prisma db push` é proibido.
- Mensagens de erro voltadas ao usuário sempre em português, sem detalhe técnico.
- Log estruturado JSON. Nunca logar PIN, token de sessão ou cookie.

## Definição de pronto

- [ ] Entregáveis da spec existem e compilam
- [ ] Testes de aceitação da spec passam
- [ ] Migration aplica e reverte limpo em base vazia
- [ ] `pnpm lint` e `pnpm typecheck` limpos
- [ ] Nenhum dado pessoal em log, URL ou mensagem de erro
