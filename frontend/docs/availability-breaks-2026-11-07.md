# Intervalos recorrentes de disponibilidade

## Escopo e fluxo auditado

Esta entrega e local, sem commit, push, deploy ou acesso ao banco de producao.
Nao inclui as correcoes locais anteriores de contato/relatorios nem qualquer
alteracao de calculo financeiro. Esses arquivos permanecem no working tree.

O runtime de agendamento encontrado e o Next.js em `frontend`:

1. `app/funcionario/disponibilidade/page.tsx` e
   `app/admin/disponibilidade/page.tsx` consultam a configuracao semanal.
2. `components/internal/availability-form.tsx` envia PUT para
   `app/api/internal/availability/route.ts`.
3. `BarberAvailability` / `barber_availability` guarda janelas HH:MM por
   barbeiro e weekday (0=domingo, 6=sabado), active e exclusao logica.
   A chave inclui startTime e permite mais de uma janela, embora o editor
   existente represente uma janela por dia e substitua a semana inteira.
4. `app/cliente/agendamento/page.tsx` usa os dias ativos para selecao da data;
   nao calcula os slots por conta propria.
5. `lib/use-client-slots.ts` consulta GET `/api/appointments` sem cache,
   renova no maximo a cada15s e ao recuperar foco.
6. GET, POST e PATCH de remarcacao chamam
   `lib/server/appointment-availability.ts::validateAvailability`.
7. `lib/client-scheduling.ts` gera a grade existente de60min ancorada no
   inicio de cada janela e exige duracao inteira dentro da jornada.
8. POST e remarcacao revalidam dentro de transacao ReadCommitted apos
   advisory lock PostgreSQL por barbeiro.

Conflitos existentes: PENDING/CONFIRMED nao excluidos ocupam horario;
CANCELED/REJECTED/NO_SHOW nao ocupam. Itens de agendamento usam duracao
historica salva; legado sem itens usa a duracao do servico principal.
Nao foi encontrada fonte ativa de ferias/feriados ou bloqueios por data
nesse motor. Nao foi criada tal funcionalidade.

Outra rota que altera jornada: PATCH `/api/internal/barbers`. Ela tambem
passa a usar o lock/validacao compartilhados, preservando pausas quando o
payload antigo nao as informa. Admin nao consegue reduzir a jornada e
deixar pausas fora dela. A operacao de perfil reverte junto se houver erro.

## Modelagem

`BarberScheduleBreak` / `barber_schedule_breaks`: id, barberId, weekDay,
startTime, endTime, label opcional, createdAt, updatedAt.

A associacao e barbeiro+weekday, e nao o id de uma faixa. Isso evita perder
as pausas quando o editor altera o inicio da jornada e muda a chave usada
no upsert. FK para Barber com cascade; unique barbeiro/dia/inicio; indice
barbeiro/dia. CHECKs protegem weekday, formato HH:MM, inicio<fim e tamanho
da descricao. Jornada/conflitos/sobreposicao sao validados no servico sob
o mesmo lock usado por reservas. Escritas diretas que contornem esse servico
nao sao uma API suportada de configuracao.

`20261107000000_barber_schedule_breaks` cria somente essa capacidade. Nenhum
horario de almoco e inventado. Tabela vazia equivale ao comportamento antigo.
A migration e atomica (BEGIN/COMMIT), com lock_timeout5s e statement_timeout30s.
Nao instala extensoes. Revoga acesso a essa nova tabela de PUBLIC e, se
existirem, anon/authenticated: descricoes internas nao sao recurso publico.
O usuario servidor/migrador deve possuir acesso a nova tabela; nao ha GRANT
nem alteracao de role existente nesta entrega.

## Regras e decisoes

- Tempos recorrentes sao horarios civis de America/Sao_Paulo; a conversao
  de agendamento continua utilizando a estrategia existente de-03:00.
- Jornadas e pausas nao atravessam meia-noite, como no motor existente.
- Intervalos sao semiabertos: terminar exatamente no inicio da pausa ou
  comecar exatamente no fim e permitido. Nao foi inventado buffer.
- Sobreposicao: inicioAtendimento<fimPausa && fimAtendimento>inicioPausa.
- Cada dia aceita ate12pausas, com descricao opcional de ate80caracteres.
- Pausas adjacentes sao aceitas; pausas sobrepostas sao rejeitadas.
- Desativar o dia preserva horarios e pausas, sem gerar slots. Reativar
  recupera a configuracao; pausas continuam obrigatoriamente dentro da janela.
- Payload sem `breaks` preserva os intervalos existentes. `breaks:[]` remove.
- Alteracao de expediente nao ajusta/remove pausas silenciosamente.
- Antes de gravar, PENDING/CONFIRMED de hoje em diante cujo fim ainda esta
  no futuro sao comparados com as pausas semanais. Nao ha horizonte de7dias
  nessa verificacao. Havendo conflito, toda a transacao e recusada, com
  contagem total e ate10detalhes internos (data/hora/cliente).
- Nao ha cancelamento, mudanca de horario ou reclassificacao de Appointment.
- O lock e compartilhado por configuracao, criacao e remarcacao. Sob
  ReadCommitted, quem esperar o lock le os dados ja confirmados pelo anterior.
- Aprovar PENDING nao introduz uma nova reserva: PENDING ja ocupa o horario.
  Rejeitar/cancelar so libera; finalizar nao cria novos horarios.
- A UI remove pausas do rascunho; persistencia ocorre somente em Salvar.
  Feedback, labels distintos por dia/indice e alvos de toque>=44px.

## Cache e privacidade

As paginas sao force-dynamic/revalidate0. A gravacao revalida as duas
paginas de disponibilidade e a pagina de agendamento. GET de slots usa
Cache-Control:no-store e select somente startTime/endTime das pausas.
O cliente pode levar ate15s para atualizar a lista ja aberta, mas o POST
revalida o estado atual sob lock e recusa o slot antigo imediatamente.
Descricoes das pausas nao integram a resposta publica de disponibilidade.

## Testes reproduziveis, somente locais

`node tests/availability-breaks.mjs`: teste deterministico com relogio
controlado, API real em memoria, duracoes15/30/45/60/90/120, limites,
adjacencia, validacao de configuracao, consulta antiga e POST manipulado.

`node scripts/verify-availability-local.mjs --serve`: cria cluster novo em
127.0.0.1 e banco renato_cortes_test, ambiente de subprocesso allowlisted sem
credenciais de producao, copia sem .env e aplica migrations via Prisma.
Primeiro aplica o estado anterior, cria fixtures, depois aplica a migration
aditiva e testa novamente o deploy idempotente. Executa testes PostgreSQL,
regressoes, Prisma, lint, typecheck e build. O modo --serve adiciona adaptadores
de autenticacao apenas na copia descartavel e testa HTTP real. Nao equivale
a homologacao de login Supabase, que nao foi alterado.

No final da revisao visual, criar o arquivo STOP na raiz temporaria encerra
servidor e cluster. Evidencias permanecem fora do Git. Nunca usar esse script
com dados reais; ele sempre cria seu proprio cluster, sem ler .env.

## Plano proposto de publicacao - ainda NAO autorizado

1. Separar somente arquivos desta feature, sem incluir alteracoes anteriores.
   Nao commitar tsconfig.tsbuildinfo nem evidencias/credenciais/artefatos.
2. Referenciar backup/restore previamente aprovados sem reabrir auditoria geral;
   confirmar operacionalmente recuperabilidade/frescor conforme janela atual.
3. Apos autorizacao, aplicar somente a nova migration com o procedimento
   Prisma aprovado. Nao usar db push nem reset. Se houver lock demorado,
   abortar: a transacao reverte DDL e deve-se tratar o ledger antes de retry.
4. Publicar o codigo compativel. A tabela nova vazia nao muda o comportamento
   da versao antiga. Nao configurar pausas reais durante sobreposicao de
   instancias antigas/novas; aguardar drenagem e confirmar novo SHA/alias.
5. Smoke nao destrutivo: disponibilidade do barbeiro/Admin, GET de slots,
   cache, ausencia de500. Nenhuma pausa real e inventada para smoke.
6. Somente depois os usuarios configuram seus intervalos verdadeiros.

Downtime total nao e esperado para essa mudanca aditiva. Existe um lock de
catalogo/FK breve; timeout impede espera indefinida. Se a versao antiga nao
puder ser drenada antes de configurar pausas, sera necessario propor bloqueio
curto de escritas. Nunca ativar maintenance sem autorizacao.

Depois de configurar pausas, rollback para versao que as ignora NAO e seguro:
priorizar roll-forward. Nao apagar tabela/configuracao nem restaurar dados
automaticamente. Novas falhas devem manter a configuracao preservada.

## Relatorio pre-deploy - resultado desta rodada

INTERVALOS DE DISPONIBILIDADE - READY FOR REVIEW

STATUS: BLOCKED (homologacao visual/E2E incompleta, nao falha da suite final).

Model/tabela: BarberScheduleBreak / barber_schedule_breaks.
Migration: SIM, preparada e aplicada SOMENTE em PostgreSQL descartavel local.

| Item | Resultado | Evidencia/limite |
| --- | --- | --- |
| Motor/regras/API em memoria | 34 PASS / 0 FAIL | relogio controlado, limites, duracoes e POST manipulado |
| PostgreSQL real | 18 PASS / 0 FAIL | migration, FK, unique, CHECK, preservacao, rollback, concorrencia nos dois sentidos |
| Painel barbeiro | PARTIAL | adicionar segunda pausa, salvar, refresh e persistencia confirmados no navegador local; editar/remover testados no servico/PG, nao concluidos fisicamente |
| Painel ADMIN | PARTIAL | componente/servico compartilhados e isolamento entre barbeiros testados; falta fechar navegacao ADMIN local |
| Cliente | PASS no motor/HTTP | lista exclui pausas e POST recusa; UI do cliente nao rehomologada fisicamente |
| Duracao completa | PASS | 15/30/45/60/90/120min; limites exatos permitidos |
| Multiplos intervalos | PASS | persistencia real e navegador local |
| Agendamentos existentes | PRESERVADOS | comparacao de fixture antes/depois da migration e operacoes |
| Conflito futuro | PASS | configuracao recusada atomicamente; cliente mantido |
| Tela antiga/concorrencia | PASS | revalidacao server-side + advisory lock compartilhado |
| Cache/revalidation | PASS tecnico | no-store, refresh<=15s, revalidatePath; POST nunca confia no cache |
| Mobile | PENDENTE | viewport375px, controles e salvamento exercitados; capturas falharam, faltam revisao visual375/390/430 e fluxo completo |
| Prisma generate/validate | PASS | copia isolada sem .env |
| Typecheck | PASS | estado final |
| Lint | PASS | zero warnings |
| Build | PASS | estado final |
| Finance/scheduling/auth/subscription API regressions | PASS | suites direcionadas existentes |
| Secret scan | PASS | 15arquivos selecionados, nenhum achado nos padroes verificados |
| Migration safety | PASS LOCAL | baseline anterior com dados, migration aditiva atomica, novo deploy idempotente |
| Production connections/writes | 0 / 0 | nenhum acesso de producao nesta tarefa |
| Commit/push/deploy | NAO / NAO / NAO | nenhuma alteracao staged |

O teste UI encontrou e corrigiu incompatibilidade com o payload original:
o formulario inclui `label` do dia; esse campo opcional agora e aceito
explicitamente, sem confiar nele para calcular dia/horario. Ha regressao
automatizada para esse payload. O estado final foi novamente validado.

Falhas intermediarias do ensaio, ja corrigidas: fixture Payment sem metodo
violava CHECK existente; tipo de retorno da callback do teste de concorrencia;
payload UI com label. Nao foram falhas/dados de producao.

Evidencias finais sem segredos:
`C:/Users/jpnathan/AppData/Local/Temp/renato-breaks-local-O6VmvP/result.json`,
logs das suites e `feature-manifest.json` (hashes dos arquivos).
Ensaio HTTP/UI anterior, tambem local:
`C:/Users/jpnathan/AppData/Local/Temp/renato-breaks-local-CcKZSf/result.json`.
Servidores e clusters desses ensaios foram encerrados; dados ficticios/evidencias
permanecem na pasta temporaria, fora do Git.

O controle de navegador encerrou a revisao por nao conseguir confirmar a URL
da janela Windows com seguranca. Nenhum contorno de protecao foi tentado.
Por isso nao foi possivel salvar screenshot valido nem concluir a revisao visual.
Nao ha autorizacao solicitada para deploy enquanto esses itens estiverem pendentes.

Arquivos desta feature (15):

- app/admin/disponibilidade/page.tsx
- app/api/internal/availability/route.ts
- app/api/internal/barbers/route.ts
- app/funcionario/disponibilidade/page.tsx
- components/internal/availability-form.tsx
- lib/server/appointment-availability.ts
- lib/availability-rules.ts
- lib/server/weekly-availability.ts
- prisma/schema.prisma
- prisma/migrations/20261107000000_barber_schedule_breaks/migration.sql
- tests/scheduling-regression.mjs
- tests/availability-breaks.mjs
- tests/availability-postgres.ts
- scripts/verify-availability-local.mjs
- docs/availability-breaks-2026-11-07.md

Arquivos de financeiro, assinaturas e os ajustes anteriores de WhatsApp/relatorios
NAO fazem parte deste conjunto. tsconfig.tsbuildinfo continua fora.

Downtime necessario: NAO esperado; condicoes de drenagem descritas acima.
Risco: MEDIO, pois o recurso altera a possibilidade de novas reservas e depende
da migration antes do codigo. A concorrencia foi testada, mas a homologacao
visual/E2E ainda precisa ser concluida antes de autorizar producao.

INTERVALOS DE DISPONIBILIDADE NAO HOMOLOGADOS - CORRECOES NECESSARIAS
