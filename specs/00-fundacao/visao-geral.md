# Visão geral

- **ID:** FUND-001
- **Status:** PRONTA
- **Pré-requisitos:** nenhum
- **Entregáveis:** nenhum (documento de contexto)

## Problema

Duas unidades residenciais (RT1 e RT2) operam em regime 12x36. Hoje a escala mensal e a
distribuição de plantões extras são feitas em planilha, o que gera três problemas concretos:

1. **Escala errada na virada de mês.** Quem trabalha dias ímpares em um mês de 31 dias passa
   a trabalhar pares no mês seguinte. Feito à mão, isso erra.
2. **Extra em cima do próprio plantão.** Sem cruzamento automático, o colaborador marca extra
   num horário em que já está escalado, ou encadeia 36h seguidas.
3. **Disputa por vaga.** Quem avisa primeiro pega; sem registro, a alocação é contestável.

## Escopo

**Dentro:** escala base 12x36 calculada, ausências (F/FT/FE), impressão da escala mensal,
oferta e marcação de extras com limite por colaborador, bloqueio de extra cruzada entre RTs,
validação de jornada, atualização em tempo real, auditoria.

**Fora (por ora):** folha de pagamento, ponto eletrônico, integração com RH, cálculo de
adicional noturno, banco de horas.

## Atores

| Ator | Autenticação | Pode |
|---|---|---|
| Administrador | Supabase Auth (e-mail + senha + MFA) | Tudo |
| Colaborador | Matrícula + PIN | Ver própria escala, marcar/cancelar extras |
| Sistema | — | Jobs de reconciliação, expurgo, alerta |

## Restrições não-funcionais

| Requisito | Alvo |
|---|---|
| Usuários simultâneos no pico (abertura da janela) | 150 |
| Latência p95 da grade de extras | < 400 ms |
| Latência p95 da marcação | < 800 ms |
| RPO | 5 min |
| RTO | 4 h |
| Retenção de auditoria | 5 anos |
| Disponibilidade na janela de marcação | 99,9% |
