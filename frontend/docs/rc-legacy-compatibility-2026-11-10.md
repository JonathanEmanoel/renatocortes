# RC - Compatibilidade de assinaturas legadas

STATUS: BLOCKED para autorizacao de release; implementacao local preparada, sem commit.

PRODUCTION WRITES=0. DEPLOY=0. PRODUCTION MIGRATIONS=0. Pagamento real de Alvaro nao confirmado.

## Escopo e causa

Vencimento legado de +30 dias nao corresponde necessariamente ao dia de startDate. A regra aprovada preserva o vencimento operacional: Alvaro 08, Jose Deyvid 11. Cancelados H3 delimitados nao devem impedir contrato posterior somente por billingFirstDueDate NULL. Nao se declara quitacao, divida ou perdao.

## Arquivos candidatos, somente este trabalho

- lib/server/subscription-billing.ts: guard chama avaliacao H3 antes do bloqueio moderno; mensagem de ancora explica conciliacao do vencimento operacional.
- lib/server/legacy-closed-contracts.ts: tres identidades H3 e before-images exatos; checagem READ ONLY de evidencia contraditoria.
- lib/server/legacy-subscription-anchors.ts: operacao administrativa com dry-run por padrao, dois candidatos, locks e auditoria.
- tests/legacy-closed-contracts.mjs: RED/GREEN e simulacoes do dominio real com adaptador em memoria.
- tests/subscription-billing-postgres.ts: somente expectativa da nova mensagem do guard.
- docs/rc-legacy-compatibility-2026-11-10.md: este documento.

WhatsApp, relatorios, agenda, disponibilidade, internal-auth, seeds, tsbuildinfo e scripts paralelos sujos NAO pertencem a este RC. Nenhum staging/commit foi executado. O build usa o working tree atual; ainda nao e ensaio de um artefato isolado versionado.

## Guard antes/depois

Antes: qualquer CANCELED/EXPIRED nao excluido sem billingFirstDueDate bloqueava.

Depois: somente tres CANCELED H3 previamente investigados podem passar sem esse marco, se IDs de contrato/cliente/plano e timestamps start/end/updatedAt coincidem, estado segue cancelado/inativo, ancoras novas continuam vazias e nao ha contradicao. A lista explicita evita generalizar a excecao a historicos nao revisados.

SQL de evidencia considera Payment relacionado mesmo excluido, Cycle, mudanca programada, servico manual ligado, Appointment do cliente no intervalo, INCOME contendo ID de contrato/cliente e auditoria de aprovacao/pagamento/renovacao/manual com ID. Resultado ausente/inesperado nao libera. Correlacoes humanas anteriores por nome/tempo permanecem no relatorio forense; nao ha busca ampla por nome em runtime.

Contrato moderno com marco e ciclo pendente continua bloqueado pelo codigo original. EXPIRED nao recebe excecao. PENDING nao foi incluido nem removido de nenhum guard: segue fluxo proprio de criacao/aprovacao e protecoes de duplicidade/sobreposicao existentes. Contrato desconhecido ou before-image alterado permanece bloqueado, mesmo se anterior a migration.

## Reconciliacao de dados proposta

Alvaro 2c8faf6a-b0f3-458d-b930-2fc5b7837f50:
baseDueDay NULL -> 8; nextCycleDueDate/nextCycleStartDate NULL -> 2026-11-08T03:00:00Z.

Jose be6604d8-4f75-4c54-b9f5-f2d88af72909:
baseDueDay NULL -> 11; nextCycleDueDate/nextCycleStartDate NULL -> 2026-11-11T03:00:00Z.

Em ambos: manter startDate/endDate/createdAt/status/active, billingFirstDueDate NULL e legacyRevenueSnapshot NULL. Nenhum Payment, Income ou Cycle criado. updatedAt muda naturalmente e um AuditLog novo registra before/after, regra, motivo, ator, instante real e operationKey deterministica. Sem apagar/modificar auditoria anterior.

Marcio nao precisa de ajuste de ancora. Matheus Henrique, Ronald e Mateus Moayte permanecem intactos, assim como cancelados.

## Write futuro implementado como funcao, NAO executado

reconcileLegacySubscriptionAnchor recebe IDs/manifesto de plano, valor, servicos e motivo; dryRun=true por padrao. Sem endpoint/CLI automatico novo. O chamador futuro deve ter seus dados conferidos no manifesto aprovado, nao copiar valores sensiveis.

Modo dry-run: transacao SERIALIZABLE, SET TRANSACTION READ ONLY e SHOW confirmado; sem FOR UPDATE. Modo de escrita exige options.dryRun=false: lock no cliente e seus contratos em ordem de IDs, compativel com confirmacao normal; ADMIN ativo obrigatorio.

Reconsulta contrato/ancoras, timestamps auditados, plano/valor/servicos do manifesto, todos os Payments/ciclos/due changes e contratos ACTIVE/PENDING concorrentes. Baseline mudou -> erro, sem adaptacao automatica. Marcador de auditoria e estado posterior devem coincidir para ALREADY_RECONCILED; marca parcial/divergente bloqueia. Reexecucao depois de novo pagamento bloqueia a conciliacao, nao interfere no recebimento.

Escrita somente tres campos e AuditLog. Read-back dentro da transacao verifica start/end, ancora, ausencia de marco/snapshot e de Payments/ciclos antes de retornar para COMMIT. Erro -> rollback transacional. Nao existe rollback destrutivo pos-commit automatico. Se houver pagamento posterior, nao limpar ancoras; revisar/roll-forward sob autorizacao separada.

## Testes executados

RED: teste H3 inicial falhou com mensagem de contrato anterior legado antes da alteracao.

GREEN: nove casos de guard em memoria (H3 sem evidencia, contradicao, desconhecido, EXPIRED, before-image alterado, vazio, varios H3, mistura com desconhecido, moderno pendente). Fluxo real completo de Alvaro simulado: Payment/INCOME/ciclo unicos; base8 e cobertura 08/11 a 08/12; segunda chamada idempotente sem criacoes adicionais. Teste da nova funcao de ancora: dry-run sem mutacao, RECONCILED, ALREADY_RECONCILED e novo Payment -> baseline rejeitado. Sao testes de dominio com doubles, NAO E2E/HTTP nem concorrencia PostgreSQL da nova operacao.

- Prisma generate: PASS.
- Prisma validate: PASS.
- Typecheck: PASS.
- Lint dos cinco arquivos de codigo/teste candidatos: PASS.
- Lint global: FAIL por scripts paralelos fora do escopo (Test-MatheusSqlReconciliation.mjs: cleanEnvironment nao usado; qa-payment-adversarial.mjs: fs nao usado e variavel module proibida). Os erros do teste novo detectados na primeira rodada foram corrigidos migrando o teste para ESM; nenhum erro restante nos candidatos.
- Build do working tree: PASS.
- Calendario existente: 15 PASS, inclui bissexto/clamp, atraso/antecipacao sem mudar base.
- API existente: 10 PASS.
- Finance: PASS (baseline reportado 22/0, verificacoes adicionais tambem verdes).
- Auth: 8 PASS.
- Scheduling: 22 PASS.
- PostgreSQL existente: 17 PASS / 0 FAIL em 127.0.0.1/renato_cortes_test, gate db-safety PASS. Inclui duas confirmacoes concorrentes, rollback real, idempotencia, cancelamento moderno com obrigacao pendente e duplicidade contratual.
- Scan de padroes de segredos dos cinco arquivos de codigo/teste: PASS; diff --check PASS (avisos de CRLF nao sao erros).

## Simulacoes e impacto

Alvaro: preview apos ancora PASS; cancelado revisado sem contradicao PASS; confirmacao NORMAL 09/11 PIX R$130 em memoria PASS; uma receita vinculada e um ciclo [08/11,08/12), proxima base08/vencimento08/12, duplicacao0. Nada disso foi persistido em producao.

Jose: projecao base11 resolve guard de ancora pelo algoritmo existente; nao existe afirmacao de recebimento nem criacao de Payment para ele. Marcio mantem base inferida25 e seu cancelado revisado deixa de bloquear se nao houver contradicao.

No snapshot conhecido: dois bloqueios de preview por ancora e um terceiro cliente (Marcio) com bloqueio historico; apos codigo+ancoras propostos, nenhum dos tres tem esses bloqueios especificos. Isso nao promete PASS para autenticacao/payload/estado futuro diferente; guards restantes permanecem.

Ancora isolada nao toca fontes de receita/pool/visitas/comissoes: diferenca projetada R$0, Payment0, Income0, Cycle0, Appointment0, Commission0, Payout0. O ensaio financeiro anterior permanece baseline; a nova funcao ainda precisa de ensaio real proprio para validar essas invariantes sob concorrencia.

## Bloqueios restantes do RC

1. Teste PostgreSQL dedicado a nova operacao de ancoras concorrendo com confirmacao, dois reconciliadores, baseline alterado e evidencias contraditorias reais do helper SQL. A suite existente valida regressao, NAO cobre integralmente estes caminhos novos.
2. Ensaiar o candidato ISOLADO das alteracoes paralelas e repetir gates desse conteudo; build atual nao prova independencia de todo o working tree sujo.
3. Lint global nao verde por arquivos fora do release; nao alterar/esconder esses problemas para alegar PASS.
4. Ainda faltam testes especificos completos das variantes PENDING e de pagamento antecipado no fluxo de confirmacao novo (calendario ja validado).

Nao solicitar deploy enquanto esses itens estiverem pendentes. Sem nova investigacao historica; sao verificacoes de implementacao.

## Proximo gate

Concluir os testes locais e isolamento antes de READY FOR RELEASE REVIEW. Depois solicitar separadamente: (1) reconciliar somente ancoras+audit em producao, (2) push/deploy somente candidato aprovado, (3) pagamento real de Alvaro posteriormente pelo fluxo normal. Nenhuma dessas operacoes foi executada ou esta automaticamente autorizada por este documento.
