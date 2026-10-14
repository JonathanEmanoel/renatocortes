# Validacao local de assinaturas - 13/10/2026

## A. Implementacao

ADMIN confirma pagamento com previa server-side, valor do plano, competencia,
vencimento, cobertura, data efetiva de pagamento e metodo. A API nao aceita
valor, ator ou limites de ciclo arbitrarios. CLIENT/BARBER/DEVELOPER nao confirmam.
Payment continua sendo a fonte monetaria; um ciclo referencia um Payment e uma
Transaction INCOME. Confirmar cliente nao executa repasse ao barbeiro.
Locks de cliente/assinatura, transacao, chaves unicas e auditoria atomica protegem
duplo clique, retries e concorrencia. Contratos sobrepostos nao duplicam receita.

Data-base vem do inicio original, nunca de paidAt. Mudanca futura de dia preserva
obrigacao atual, preco e cobertura paga, sem pro-rata. Vencimento e cobertura sao
campos separados. Cancelar/recriar nao liquida ciclos pendentes. Troca imediata
de plano de assinatura ja faturada fica bloqueada para revisao administrativa.

Arquivos funcionais modificados:
- app/admin/assinaturas/page.tsx
- app/api/internal/appointments/route.ts
- app/api/internal/subscriptions/route.ts
- app/api/subscriptions/route.ts
- app/cliente/assinaturas/page.tsx
- app/cliente/assinaturas/subscriptions-content.tsx
- components/internal/subscription-action-buttons.tsx
- lib/server/barber-report.ts
- lib/server/finance-rules.ts
- lib/server/subscription-payouts.ts
- package.json

Arquivos funcionais novos:
- app/api/internal/subscription-billing/route.ts
- components/internal/subscription-billing-buttons.tsx
- lib/server/subscription-billing.ts
- lib/server/subscription-calendar.ts
- lib/server/subscription-reclassification.ts
- scripts/audit-subscription-incident-readonly.mjs

Reclassificacao local preserva ID do Appointment, exige ciclo pago e cobertura,
mantem extras e uma visita coberta, recalcula pelo motor compartilhado. Bloqueia
comissao paga, pagamento individual, periodo fechado e divergencias financeiras.
Falha em qualquer escrita/auditoria reverte a transacao inteira. Nao existe
endpoint publico de reparo automatico nem clawback.

## Schema e migrations

Subscription: baseDueDay, nextCycleDueDate, nextCycleStartDate,
billingFirstDueDate, legacyRevenueSnapshot, cycles, dueDayChanges.
User: relacoes subscriptionCyclesConfirmed e subscriptionDueDayChanges.
Payment: relacao subscriptionCycle. Valor continua somente em Payment.

SubscriptionCycle: id, confirmationKey, subscriptionId, dueDate,
coverageStartDate, endDate, competenceMonth, baseDueDay, planId, planName,
coveredServiceIds, paymentId, confirmedById, confirmedAt.
planId e snapshot historico, nao FK mutavel de plano.
Unique: confirmationKey; paymentId; subscriptionId + dueDate.
Indices: competenceMonth; confirmedById.
FKs RESTRICT: Subscription, Payment e User confirmador.
CHECK: dia 1..31, endDate > dueDate, coverageStartDate < endDate quando presente,
competencia YYYY-MM com mes valido.

SubscriptionDueDayChange: id, requestKey, subscriptionId, previousDay, newDay,
afterDueDate, effectiveDueDate, configuredById, createdAt, appliedAt.
Unique: requestKey; parcial subscriptionId WHERE appliedAt IS NULL.
Indices: subscriptionId + appliedAt; configuredById.
FKs RESTRICT: Subscription e User configurador.
CHECK: dias 1..31, dias diferentes, effectiveDueDate > afterDueDate.
Subscription possui CHECK de baseDueDay nulo ou 1..31.

Migrations aditivas:
- prisma/migrations/20261013000000_subscription_billing_cycles/migration.sql
- prisma/migrations/20261013001000_subscription_coverage_boundaries/migration.sql

Aplicadas somente em 127.0.0.1 / renato_cortes_test. Producao: NAO.
Sem UPDATE/backfill automatico. Campos novos anulaveis preservam legado.
Primeira adocao exige revisao explicita do inicio original. Ancora divergente ou
Payment legado pago sem conciliacao bloqueia confirmacao. Datas originais que
tenham sido sobrescritas no sistema antigo exigem evidencia, nao inferencia.
Snapshot preserva receita/classificacao antiga anterior a primeira confirmacao.
Ciclos anteriores sem coverageStartDate conservam fallback para dueDate.
Liquidacao de divida de contrato cancelado e conciliacao legada nao sao automaticas.

## B. Dias 29/30/31

Calendario operacional America/Sao_Paulo. Cada mes recalcula pelo dia-base;
fevereiro usa ultimo dia sem transformar base 31 em 28/29. Marco retorna ao dia
original. Testes incluem bissexto, virada de ano, mudanca para 31 e pagamento
antecipado/atrasado independente do vencimento: 15 PASS / 0 FAIL.

## Validacoes

- Financeiro: 43 PASS / 0 FAIL (inclui baseline 22).
- Agendamento: 22 PASS / 0 FAIL.
- Autenticacao: 8 PASS / 0 FAIL.
- Calendario: 15 PASS / 0 FAIL.
- API de cobranca: 10 PASS / 0 FAIL.
- PostgreSQL novo: 17 PASS / 0 FAIL, repetido em base limpa.
- PostgreSQL anterior: PASS, incluindo repasses concorrentes/historico imutavel.
- Prisma generate: PASS.
- Prisma validate: PASS.
- Lint: PASS.
- Typecheck: PASS.
- Build final: PASS apos limpeza exclusiva de cache regeneravel; 33 paginas geradas.
- git diff --check: PASS; somente avisos LF/CRLF.
- Navegacao visual autenticada: NAO VALIDADA; ferramenta indisponivel.

Testes novos: tests/subscription-billing-calendar.ts,
tests/subscription-billing-api.mjs e tests/subscription-billing-postgres.ts.
PostgreSQL verifica concorrencia real, uma receita, nenhuma transferencia ao
barbeiro, extras, cobertura, rollback por trigger, legado, duplicacao contratual,
mudanca futura e bloqueio de reset de divida.

## C/D. Matheus/Renan real

BLOQUEADO: AUDIT_PRODUCTION_DATABASE_URL ausente. Script encerrou antes de abrir
conexao. IDs, assinatura, ciclo, vencimento, plano, atendimento de 13/10/2026,
comissao e pagamento real NAO INVESTIGADOS. Nao significa registros inexistentes.
Credencial deve ser fornecida por mecanismo seguro separado, nunca no chat,
codigo, log ou arquivo versionado. Guard local e DATABASE_URL normal preservados.
Mecanismo preparado usa transacao READ ONLY e motor do SHA fixado, mas ainda nao
foi validado contra producao. Diagnostico real e simulacao exata permanecem pendentes.

## E. Simulacao FICTICIA local

Atendimento-alvo: comissao normal 22,50 -> 5,00 (diferenca -17,50).
Extra legitimo 10,00 permanece; comissao do extra 5,00 permanece.
Visitas cobertas: 0 -> 1. Na base isolada: participacao final 100%, estimativa 30,00.
Ganho realizado do profissional na fixture: 32,50 -> 15,00, porque inclui outro
registro anterior com comissao paga 10,00, mantida integralmente antes/depois.
Nenhum dinheiro foi retirado do barbeiro. Valores NAO representam o caso real.
Valores e impacto real Matheus/Renan: DESCONHECIDOS, nao simulados com dados reais.

## F. Seguranca

ESCRITAS EM PRODUCAO: 0
MIGRATIONS EM PRODUCAO: 0
UPDATE EM PRODUCAO: 0
INSERT EM PRODUCAO: 0
DELETE EM PRODUCAO: 0
CLAWBACK: 0
Testes e migrations com escrita somente no PostgreSQL local descartavel.
Nenhuma credencial alterada ou incluida nas alteracoes Git.
Disco C apresentou ENOSPC; somente .next/cache deste projeto foi removido.
Espaco livre insuficiente recorrente e risco operacional restante.

## G. Git e bloqueios

Branch: main.
HEAD e referencia local origin/main: d3e008af0c18e18ee327fdb7027624f2aaa8ffef.
Sem fetch nesta rodada; referencia remota nao revalidada por rede.
Commit: NAO. Push: NAO. Deploy: NAO. Vercel: NAO ACESSADA.
tsconfig.tsbuildinfo preexistente foi preservado e fica fora de futuro commit.
Relatorio: docs/validacao-assinaturas-2026-10-13.md.

Conclusao: implementacao local com testes automatizados aprovados; conclusao
integral bloqueada por falta de auditoria real read-only e validacao visual.
Nao autoriza migration/deploy/reclassificacao de producao.
