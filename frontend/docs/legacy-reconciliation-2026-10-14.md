# Conciliacao administrativa legada - validacao local

## Escopo e evidencia

O responsavel informou pagamento comercial de R$75 de outubro/2026 e base dia 1.
Data real e metodo do pagamento sao desconhecidos. As auditorias de producao
foram executadas pelo usuario em PowerShell separado, nao por esta sessao desktop.
Conforme resultados fornecidos, Matheus ja contribui R$75 nos R$430 do motor legado.
Plano Cabelo cobre o serviceId do Corte Degrade Navalhado; visita de 13/10/2026
12:00 Sao Paulo esta COMPLETED, normal, INCOME R$30 e comissao R$15 nao paga.
Nao havia payout de outubro ou fechamento. Esses fatos sao revalidados antes
de uma futura operacao; nenhuma autorizacao de escrita decorre deste documento.

## Arquivos desta implementacao

- prisma/schema.prisma: Payment com metodo nullable e campos de conciliacao.
- prisma/migrations/20261014000000_legacy_subscription_reconciliation/migration.sql.
- lib/server/subscription-billing.ts: persistConfirmedSubscriptionCycle aceita o mesmo tx.
- lib/server/subscription-reclassification.ts: nucleo InTransaction reutilizavel.
- lib/server/legacy-subscription-reconciliation.ts: operacao atomica e dry-run.
- scripts/reconcile-matheus-october-legacy.ts: comando especifico fail-closed.
- tests/legacy-reconciliation-postgres.ts: cenarios A-U, concorrencia e rollback.
- package.json: test:legacy-reconciliation e pretest com guard local.

Alteracoes locais anteriores foram preservadas. tsconfig.tsbuildinfo e artefato
preexistente fora de futuro commit; nao houve staging/commit/push nesta rodada.

## Representacao honesta

Payment.source = LEGACY_ADMIN_RECONCILIATION; status PAID; amount 75;
method NULL; paidAt NULL. reconciledAt e o timestamp verdadeiro do registro
administrativo, nao a data do pagamento. reconciliationEvidence conserva fonte
comercial, motivo, competencia, Appointment e desconhecimento explicito.
reconciliationKey e unique. Nenhuma segunda fonte monetaria foi criada.

NORMAL permanece com method obrigatorio por CHECK; dominio/API exigem data real
e metodo permitido. A migration nao inventa dados nem reclassifica linhas antigas.
O CHECK de legado exige PAID, subscriptionId, ausencia de saleId/appointmentId,
metodo/data nulos, reconciledAt/key/evidencia presentes. Origem tem valores restritos.

Ciclo outubro: base 1 confirmada comercialmente; dueDate/cobertura inicial
01/10/2026 00:00 -03; fim exclusivo e proximo vencimento 01/11/2026 00:00 -03.
startDate original da assinatura e preservado. Um recebimento quita um ciclo.

## Operacao unica

ADMIN ativo obrigatorio. Uma transacao SERIALIZABLE, com locks de cliente,
assinatura, Appointment, comissao, INCOME e advisory lock mensal compartilhado
com pagamento de repasses. Confere IDs, horario, plano, valor, cobertura,
evidencia humana, duplicidade, recebimento preexistente, fechamento e estado pago.
Mudancas na distribuicao auditada bloqueiam a operacao.

Payment/Transaction/ciclo, adocao do modelo de ciclos, reclassificacao do MESMO
Appointment, atualizacao da MESMA comissao e do MESMO INCOME e auditorias ocorrem
no mesmo transaction client. Qualquer falha reverte tudo, incluindo auditorias.
Somente conflitos SERIALIZABLE/deadlock conhecidos recebem ate tres tentativas
integrais (P2034 ou P2010 com SQLSTATE 40001/40P01). Outros erros nao sao repetidos.

O motor substitui contribuicao legada por Payment do ciclo. O corte coberto
deixa de gerar receita/comissao normal. Snapshot preserva extras nao cobertos;
exemplo extra R$10 continua receita R$10/comissao R$5 e conta uma unica visita.
Nenhum DELETE, copia de Appointment, payout ou pagamento ao barbeiro e realizado.
Auditoria registra estados anteriores/posteriores, IDs, motivo, administrador,
operacao, competencia, snapshot e timestamp administrativo.

## Idempotencia

Chave SHA256 deterministica de origem/versao/assinatura/competencia/base/Appointment.
Unique de Payment.reconciliationKey e SubscriptionCycle(subscriptionId,dueDate),
alem de confirmationKey. Sob locks, ciclo/Payment/auditoria da mesma operacao
retornam ALREADY_RECONCILED sem novas alteracoes. Colisao com outro recebimento
ou ciclo exige revisao. Comparacao de metadados nao depende da ordem JSONB.

## Script preparado, nao executado

scripts/reconcile-matheus-october-legacy.ts exige --production e credencial
LEGACY_RECONCILIATION_DATABASE_URL, sem fallback para DATABASE_URL.
Host Supabase deve coincidir com LEGACY_RECONCILIATION_EXPECTED_HOST.
LEGACY_RECONCILIATION_EXPECTED_RELEASE_SHA deve corresponder ao HEAD.
Exige LEGACY_RECONCILIATION_EXPECTED_USER, LEGACY_RECONCILIATION_ADMIN_ID,
LEGACY_RECONCILIATION_OPERATION_KEY e LEGACY_RECONCILIATION_REASON.
Nenhuma dessas configuracoes foi criada nesta rodada.

Dry-run e o padrao e usa transacoes READ ONLY verificadas. Reidentifica pelas
relacoes Matheus/Renan/data/servico/plano, nao por IDs completos hardcoded.
Confere migrations aplicadas e distribuicao conhecida; retorna IDs mascarados.
Escrita futura requer --write e --confirm-write=RECONCILE_MATHEUS_OCTOBER,
principal distinto da conta de auditoria e checkout de release limpo.
Chama dominio, nao UPDATEs avulsos. Use checkout limpo separado no release,
sem descartar o working tree atual para satisfazer esse gate.

Nao executar nem fornecer credencial de escrita antes de autorizacao separada.
O script nao foi iniciado nesta etapa, nem mesmo em dry-run de producao.

## Testes locais

- Conciliacao: 26 PASS / 0 FAIL (A-U e verificacoes adicionais).
- Happy path preserva R$430, pool R$172, visitas 5->6, Renan 1->2.
- Rateio exato: Renan R$57,33; Italo R$28,67; Renato R$86,00.
- Financeiro bruto R$460->R$430, sem dupla soma de Payment/Transaction.
- Mesmo Appointment/INCOME/comissao; R$30/R$15->0; sem payout.
- PAID historico sem metodo/data fabricados; normal exige dados reais.
- Comissao paga, fechamento, outro Appointment, servico sem vinculo bloqueados.
- Payment/ciclo existente bloqueia duplicacao; retry nao modifica tabelas.
- Falhas reais por triggers depois do ciclo e da reclassificacao: rollback total.
- Duas operacoes concorrentes: uma RECONCILED, outra ALREADY_RECONCILED.
- Dry-run comparou todas as tabelas antes/depois sem qualquer alteracao.
- Integracao PostgreSQL anterior: PASS, incluindo repasses/ajustes concorrentes.
- Ciclos PostgreSQL anterior: 17 PASS / 0 FAIL.
- Finance: 43 PASS; scheduling: 22 PASS; auth: 8 PASS.
- Subscription calendar: 15 PASS; API: 10 PASS.
- Prisma generate/validate, lint e typecheck: PASS.
- Build: PASS; compilacao, checagem de tipos e geracao das 33 paginas concluidas.

Todos os testes/migration com escrita usaram SOMENTE 127.0.0.1/renato_cortes_test,
apos verificacao do guard e autorizacao explicita. Sem dados reais de producao.

## Migrations e release

Novas migrations ainda NAO aplicadas em producao nesta rodada, em ordem:
1. 20261013000000_subscription_billing_cycles.
2. 20261013001000_subscription_coverage_boundaries.
3. 20261014000000_legacy_subscription_reconciliation.

As tres estao aplicadas no banco local; a terceira foi aplicada nesta rodada
com autorizacao especifica. A lista exata de outras pendencias de producao deve
ser confirmada no release; nao consultamos _prisma_migrations de producao.

Backup verificavel + teste de restauracao -> validar dados/migrations em copia
segura -> migracoes aditivas -> deploy compativel -> smoke tests -> dry-run
administrativo -> aprovacao explicita -> conciliacao -> verificacao read-only.

Antes da conciliacao, schema expandido permanece compativel com codigo antigo:
colunas/tabelas novas nao removem contratos e linhas existentes mantem metodo.
NAO criar linha LEGACY com method NULL antes de atualizar os clientes/leitores:
Prisma antigo declara method obrigatorio e pode falhar ao ler uma linha nullable.
Nao executar concorrente com outros testes/migrations ou transacoes financeiras.

Recovery antes de qualquer conciliacao: preferir codigo/schema expandido e
forward fix; backup validado e necessario. Depois de escrever linhas legadas,
rollback para leitor antigo NAO e seguro. Suspender operacoes, manter leitor
compativel e fazer forward fix. Restauracao de backup requer avaliar operacoes
posteriores e autorizacao, nao e um reset automatico. Nunca inventar metodo para
reaplicar NOT NULL ou apagar ciclos/auditorias para facilitar rollback.

## Gates e seguranca

Ainda requer revisao final do conjunto nao commitado; autorizacoes separadas
para commit/push/release/migration/correcao; backup/teste de restauracao;
confirmacao do SHA efetivamente publicado; credencial administrativa separada,
identidade ADMIN, operationKey e evidencia comercial fornecidas de forma segura;
novo dry-run e reconfirmacao de comissao/payout/fechamento/IDs/valores.

PRODUCAO ACESSADA: NAO
PRODUCTION WRITES: 0
MIGRATIONS EM PRODUCAO: 0
CORRECTION EXECUTED EM PRODUCAO: NAO
COMMIT: NAO
PUSH: NAO
DEPLOY: NAO
