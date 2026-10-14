# Plano de release e recovery - NAO EXECUTADO

RELEASE READY: NAO. Codigo validado localmente nao equivale a release autorizado.
Faltam backup real restaurado, ensaio na copia, preflight de drift/dados/locks,
janela com todas as escritas suspensas e autorizacoes separadas.
Producao informada: d3e008af0c18e18ee327fdb7027624f2aaa8ffef.
Novo SHA: inexistente ate commit autorizado; nao reutilizar o SHA antigo como novo.
Nenhum acesso ao banco de producao, backup ou release foi executado nesta etapa.

## 1. Auditoria integral das migrations

### M1 - 20261013000000_subscription_billing_cycles

Classificacao: SAFE BEFORE DEPLOY, para EXPAND completo e sem ativar novos dados.

subscriptions recebe quatro colunas nullable sem default: baseDueDay INTEGER,
nextCycleDueDate TIMESTAMP(3), billingFirstDueDate TIMESTAMP(3),
legacyRevenueSnapshot JSONB. CHECK baseDueDay nulo ou entre 1 e 31.
Sem UPDATE, backfill, renomeacao, remocao de dados ou enum novo.

subscription_cycles, nova tabela:
- id TEXT PRIMARY KEY, obrigatorio, sem default SQL (ID gerado pelo Prisma).
- confirmationKey, subscriptionId, competenceMonth, planId, planName, paymentId,
  confirmedById: TEXT obrigatorios, sem default.
- dueDate/endDate: TIMESTAMP(3) obrigatorios, sem default.
- baseDueDay INTEGER e coveredServiceIds JSONB obrigatorios, sem default.
- confirmedAt TIMESTAMP(3) obrigatorio DEFAULT CURRENT_TIMESTAMP.
- CHECK baseDueDay 1..31; endDate > dueDate; competencia YYYY-MM com mes 01..12.
- FK subscriptionId -> subscriptions.id; paymentId -> payments.id;
  confirmedById -> users.id: ON DELETE RESTRICT, ON UPDATE CASCADE.
- planId e snapshot historico: NAO possui FK para plano mutavel.
- UNIQUE confirmationKey, paymentId e (subscriptionId,dueDate).
- Indices comuns competenceMonth e confirmedById; PRIMARY KEY cria indice id.

subscription_due_day_changes, nova tabela:
- id TEXT PRIMARY KEY; requestKey, subscriptionId, configuredById TEXT obrigatorios.
- previousDay/newDay INTEGER; afterDueDate/effectiveDueDate TIMESTAMP(3) obrigatorios.
- createdAt TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP obrigatorio; appliedAt nullable.
- Outros campos nao possuem default SQL.
- CHECK dias 1..31, newDay diferente de previousDay, effectiveDueDate > afterDueDate.
- FK subscriptionId -> subscriptions.id; configuredById -> users.id:
  ON DELETE RESTRICT, ON UPDATE CASCADE.
- UNIQUE requestKey; UNIQUE PARCIAL subscriptionId WHERE appliedAt IS NULL.
- Indices comuns (subscriptionId,appliedAt) e configuredById; indice PK id.

Locks/riscos: ALTER subscriptions pede ACCESS EXCLUSIVE. Criacao de FKs tambem
exige locks nos pais subscriptions/payments/users. Indices das tabelas novas
nao sao CONCURRENTLY, mas tabelas nascem vazias. Transacoes longas concorrentes
podem atrasar locks. Drift, nomes existentes, tipos diferentes, permissoes ou
aplicacao parcial podem falhar. Checks nao inventam datas legadas.

Rollback: antigo cliente ignora colunas e tabelas novas enquanto vazias.
Depois de ciclos, antigo motor desconhece a fonte por ciclo e antigo CRUD de
manutencao pode falhar em FK RESTRICT ao excluir Payment/Subscription/User.
Nao remover FKs para permitir uma exclusao antiga. Testar/limitar esse fluxo.

### M2 - 20261013001000_subscription_coverage_boundaries

Classificacao: SAFE BEFORE DEPLOY, depois de M1 e sem novos escritores ativos.
- subscriptions.nextCycleStartDate TIMESTAMP(3) nullable, sem default.
- subscription_cycles.coverageStartDate TIMESTAMP(3) nullable, sem default.
- CHECK coverageStartDate IS NULL OR coverageStartDate < endDate.
- Nenhuma tabela, FK, unique, indice ou enum novo; nenhum backfill.
- ACCESS EXCLUSIVE nos dois ALTER TABLE; CHECK validado, podendo fazer scan.
- Colunas novas nulas satisfazem CHECK; falha possivel por drift, objetos ausentes,
  permissoes, locks ou tentativa de reaplicar uma migration parcial.
- Codigo antigo ignora campos. Fallback antigo dueDate como inicio nao autoriza
  apagar limites de cobertura persistidos pelo codigo novo.

### M3 - 20261014000000_legacy_subscription_reconciliation

Classificacao do DDL sem novos registros: SAFE BEFORE DEPLOY.
Classificacao da ativacao de metodo nulo: REQUIRES COMPATIBLE DEPLOY.

- payments.method perde NOT NULL; tipo PaymentMethod existente NAO muda.
- payments.paidAt NAO e alterado: ja era nullable.
- source TEXT NOT NULL DEFAULT 'NORMAL'.
- reconciledAt TIMESTAMP(3), reconciliationKey TEXT e reconciliationEvidence JSONB:
  nullable, sem default. Nenhuma tabela/FK/enum novo.
- UNIQUE reconciliationKey; varios NULL normais sao permitidos.
- CHECK source IN ('NORMAL','LEGACY_ADMIN_RECONCILIATION').
- CHECK NORMAL: method NOT NULL; reconciledAt/key/evidence NULL.
- CHECK LEGACY: method/paidAt NULL; PAID; subscriptionId NOT NULL;
  appointmentId/saleId NULL; reconciledAt/key/evidence NOT NULL; evidence objeto JSON.
- Nada reclassifica pagamentos antigos; nenhum UPDATE preenche datas/metodos.

Locks/riscos: ALTER payments ACCESS EXCLUSIVE; CREATE UNIQUE INDEX normal faz scan
e bloqueia escritas (nao CONCURRENTLY); CHECKs validam pagamentos existentes.
Default constante pode usar caminho rapido no PostgreSQL moderno, mas nao elimina
locks, scans de constraints ou custo de indice. Se houve drift e method ja tem
NULL, o ramo NORMAL falha. ReconciliationKey novo inicia NULL, sem duplicidade.
Dados reais, RLS, grants, volume e concorrencia nao foram consultados nesta etapa.

Nenhuma migration inclui GRANT ou ALTER DEFAULT PRIVILEGES. Confirmar permissao do
runtime e SELECT da conta de auditoria nas tabelas novas e em _prisma_migrations.
Nao presumir que GRANT anterior em tabelas existentes abrange tabelas futuras.
Se necessario, plano de grants minimos deve ser aprovado separadamente; nao dar
privilegios a PUBLIC nem remover RLS para obter sucesso.

Rollback: somente DDL, mantendo registros com method nao nulo, continua compativel.
Depois do primeiro NULL legado, cliente antigo NAO e leitor seguro.
Nao inventar metodo/data para voltar a NOT NULL.

### Atomicidade de DDL e criterio de parada

Os tres arquivos NAO possuem BEGIN/COMMIT. Prisma 6 nao garante wrap transacional
automatico no PostgreSQL. Nao assumir que migration com falha deixou zero DDL.
Nao editei arquivos ja aplicados localmente nem seus checksums.
Antes do release, ensaiar falha/recuperacao na copia e aceitar explicitamente esse
modo ou autorizar separadamente plano transacional versionado e revalidado.
Migrate deploy aplica TODAS as pendentes: lista real deve ser exatamente a aprovada,
sem falhas anteriores. Nao usar migrate dev/reset/db push em producao.

## 2. Leitores antigos e pontos de rollback

No SHA publicado:
- frontend/prisma/schema.prisma: Payment.method obrigatorio; paidAt DateTime?.
- frontend/lib/server/maintenance.ts:489-501, subscriptionRows(), include payments:true.
  Prisma antigo decodifica method mesmo que o mapeamento use apenas length.
  E o leitor antigo identificado que pode falhar ao receber metodo NULL.
- maintenance.ts:834 e 985 selecionam apenas id; counts nao decodificam method.
- finance-rules.ts:181 filtra payment.subscriptionId sem carregar method/paidAt.
- Nao foi encontrada suposicao de Payment.paidAt obrigatorio nesse codigo.
  Expense.paidAt e SubscriptionPayout.paidAt sao OUTROS contratos.

Ponto 1, semantico: primeira confirmacao/criacao de ciclo gerenciado, NORMAL ou LEGACY.
O antigo motor ignora cycles; antigas aprovacoes podem reescrever start/endDate sem
atualizar cursores, e exclusoes encontram novas FKs. Rollback funcional para o SHA
antigo deixa de ser genericamente seguro mesmo com method preenchido.
Ponto 2, leitura: primeiro Payment LEGACY com method NULL. Alem do risco semantico,
leitura antiga de Payment completo torna-se incompativel.
Nao sao impossibilidade absoluta de recovery; sao limites de rollback automatico.
Preferir leitor compativel + forward fix, preservando historia.

EXPAND M1->M2->M3; DEPLOY compativel antes de habilitar novos escritores;
MIGRATE dados somente com dry-run e aprovacao; CONTRACT nao existe neste release.
Codigo novo NAO e compativel com schema antigo: Prisma pede colunas novas.
Portanto nao publicar antes de completar EXPAND.

## 3. Backup real, fora do Git - procedimento futuro

Escopo: backup logico da aplicacao public, incluindo _prisma_migrations, para
reconstruir as estruturas alteradas. NAO e copia integral de todo o Supabase:
Auth, Storage binario, roles globais, Vault e configuracoes exigem plano separado
(backup/PITR e exportacoes do provedor). Confirmar essa capacidade como gate.
Se public depende de auth/roles/extensoes, identificar/incluir dependencias no
ensaio seguro. Nao omitir erros de restore ou remover constraints para obter PASS.

Cliente encontrado: C:\Program Files\PostgreSQL\16\bin, versao 16.1.
Major da origem nao verificado; pg_dump deve ser da mesma major ou posterior.
Se origem for 17+, parar e preparar ferramentas compativeis; cliente 16 nao serve.
Conta de auditoria pode nao ter acesso a sequences/RLS necessario ao pg_dump.
Credencial separada de backup, SELECT completo de tabelas/sequences e acesso
adequado a RLS sao gates. Nenhuma concessao de privilegio foi executada.

Volume local cifrado, acesso restrito, fora de repositorios/sincronizacao em nuvem.
Dumps contem PII: nunca anexar ao chat/Git. Reservar dump + restore + copia e folga.
BACKUP_PRODUCTION_DATABASE_URL somente no ambiente do PowerShell autorizado.
Nao usar URL em argumentos, .env, perfil, setx, transcript ou logs.

Blocos seguintes sao PROCEDIMENTOS FUTUROS, nao executados. Exigem autorizacao,
preflight, TLS/certificado verificado e janela com escritas congeladas.

### Helper PostgreSQL: sem segredo no argv

```powershell
function Invoke-ReleasePg {
    param([string]$Tool, [string[]]$ToolArgs, [string]$ConnectionEnv,
          [ValidateSet('source','local-admin','local-drill')][string]$Mode)
    $raw = [Environment]::GetEnvironmentVariable($ConnectionEnv, 'Process')
    if (-not $raw) { throw 'Conexao separada ausente.' }
    try { $u = [Uri]$raw } catch { throw 'Formato invalido; detalhes omitidos.' }
    $db = $u.AbsolutePath.Trim('/')
    $exe = [IO.Path]::GetFileName($Tool)
    if ($u.Scheme -notin @('postgres','postgresql')) { throw 'Protocolo bloqueado.' }
    if ($Mode -eq 'source') {
        if ($u.Host -notmatch '\.(supabase\.co|supabase\.com)$' -or
            $u.Host -ne $env:BACKUP_EXPECTED_HOST -or $db -ne 'postgres' -or
            $exe -notin @('pg_dump.exe','psql.exe')) { throw 'Origem bloqueada.' }
        if (-not (Test-Path -LiteralPath $env:BACKUP_CA_FILE)) { throw 'CA TLS obrigatoria.' }
    } else {
        if ($u.Host -ne '127.0.0.1') { throw 'Restore exige IPv4 local.' }
        if ($Mode -eq 'local-admin' -and ($db -ne 'postgres' -or $exe -ne 'createdb.exe')) { throw 'Admin local bloqueado.' }
        if ($Mode -eq 'local-drill' -and ($db -notmatch '^renato_cortes_release_drill_[0-9_]+$' -or
            $exe -notin @('psql.exe','pg_restore.exe'))) { throw 'Destino bloqueado.' }
    }
    $pair = $u.UserInfo.Split(':',2)
    if ($pair.Count -ne 2) { throw 'Credencial separada incompleta.' }
    $p = [Diagnostics.ProcessStartInfo]::new()
    $p.FileName = $Tool; $p.UseShellExecute = $false; $p.CreateNoWindow = $true
    $p.RedirectStandardOutput = $true; $p.RedirectStandardError = $true
    foreach ($name in @('DATABASE_URL','DIRECT_URL','AUDIT_PRODUCTION_DATABASE_URL',
        'LEGACY_RECONCILIATION_DATABASE_URL','BACKUP_PRODUCTION_DATABASE_URL',
        'RESTORE_DRILL_ADMIN_URL','RESTORE_DRILL_DATABASE_URL','PGSERVICE','PGSERVICEFILE','PGHOSTADDR','PGPASSFILE')) {
        $p.EnvironmentVariables.Remove($name)
    }
    $p.EnvironmentVariables['PGHOST']=$u.Host
    $p.EnvironmentVariables['PGPORT']=if($u.Port -gt 0){[string]$u.Port}else{'5432'}
    $p.EnvironmentVariables['PGDATABASE']=$db
    $p.EnvironmentVariables['PGUSER']=[Uri]::UnescapeDataString($pair[0])
    $p.EnvironmentVariables['PGPASSWORD']=[Uri]::UnescapeDataString($pair[1])
    if($Mode -eq 'source') {
        $p.EnvironmentVariables['PGSSLMODE']='verify-full'
        $p.EnvironmentVariables['PGSSLROOTCERT']=$env:BACKUP_CA_FILE
        $p.EnvironmentVariables['PGOPTIONS']='-c default_transaction_read_only=on'
    } else {
        $p.EnvironmentVariables['PGSSLMODE']='disable'
        $p.EnvironmentVariables['PGOPTIONS']=''
    }
    foreach($arg in $ToolArgs){ [void]$p.ArgumentList.Add($arg) }
    $child=[Diagnostics.Process]::Start($p)
    $out=$child.StandardOutput.ReadToEndAsync(); $err=$child.StandardError.ReadToEndAsync()
    $child.WaitForExit()
    $text=$out.GetAwaiter().GetResult(); [void]$err.GetAwaiter().GetResult()
    if($child.ExitCode -ne 0){throw ('PostgreSQL exit '+$child.ExitCode+'; output sensivel omitido.')}
    return $text
}
```

Requer PowerShell 7/.NET com ProcessStartInfo.ArgumentList. Nao executar esse bloco
no Windows PowerShell 5.1 nem improvisar quoting de credencial. PGPASSWORD fica
somente na memoria/ambiente do filho, acessivel a processos privilegiados locais;
proteger maquina/sessao. Nao e um cofre. Erro bruto nao e impresso ou gravado.
DATABASE_URL/DIRECT_URL do processo pai permanecem intactos.

### Captura autorizada imediatamente antes do DDL

```powershell
if($env:AUTHORIZE_RELEASE_BACKUP -ne 'YES'){throw 'Backup ainda nao autorizado.'}
$PgBin='C:\Program Files\PostgreSQL\16\bin' # confirmar major antes de usar
$BackupRoot=Join-Path $env:LOCALAPPDATA 'RenatoCortesReleaseBackups'
$BackupRoot=[IO.Path]::GetFullPath($BackupRoot)
$walk=$BackupRoot
while($walk){
    if(Test-Path -LiteralPath (Join-Path $walk '.git')){throw 'Destino versionavel.'}
    $parent=[IO.Directory]::GetParent($walk)
    $walk=if($parent){$parent.FullName}else{$null}
}
if(-not(Test-Path -LiteralPath $BackupRoot)){[void](New-Item -ItemType Directory -Path $BackupRoot)}
$ProductionSHA=$env:BACKUP_ACTIVE_PRODUCTION_SHA
if($ProductionSHA -notmatch '^[0-9a-f]{40}$'){throw 'SHA efetivamente publicado obrigatorio.'}
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMdd_HHmmss')
$dump=Join-Path $BackupRoot ('public_'+$stamp+'_'+$ProductionSHA.Substring(0,12)+'.dump')
if(Test-Path -LiteralPath $dump){throw 'Nao sobrescrever backup.'}
$capturedAt=(Get-Date).ToUniversalTime().ToString('o')
Invoke-ReleasePg -Tool (Join-Path $PgBin 'pg_dump.exe') -ConnectionEnv BACKUP_PRODUCTION_DATABASE_URL -Mode source `
    -ToolArgs @('--no-password','--format=custom','--schema=public','--lock-wait-timeout=10s','--file',$dump) | Out-Null
$size=(Get-Item -LiteralPath $dump).Length
if($size -le 0){throw 'Backup vazio.'}
# Leitura integral do archive sem conectar; SQL vai ao dispositivo nulo.
& (Join-Path $PgBin 'pg_restore.exe') --exit-on-error --file NUL $dump 2>$null
if($LASTEXITCODE -ne 0){throw 'Archive nao legivel; interromper release.'}
$sha256=(Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash
$manifest=[ordered]@{scope='public-application';capturedAtUtc=$capturedAt;productionSha=$ProductionSHA;
    file=[IO.Path]::GetFileName($dump);bytes=$size;sha256=$sha256;restoreDrillPassed=$false}
$manifest | ConvertTo-Json | Set-Content -LiteralPath ($dump+'.manifest.json') -Encoding utf8
```

Antes: conferir source identity/major, TLS, RLS/sequences, espaco livre e SHA/alias.
Manifesto nao inclui conexao. Capturar contagens fonte com SQL abaixo, em READ ONLY,
enquanto escritas estao suspensas; salvar somente contagens fora do Git junto ao
manifesto. Se alguma escrita ocorrer entre backup, comparacao e migration, repetir
snapshot/validacao. Dump consistente sozinho nao congela o banco vivo.

## 4. Restore drill - nao executado

Banco DEDICADO: renato_cortes_release_drill_<timestamp>. Nunca renato_cortes_test,
pois suites limpam esse banco; nunca postgres/producao como destino de pg_restore.
Copia contem PII real: isolada, cifrada, acesso restrito, sem web/Auth/email/Calendar/
cron/tarefas externas. Descarte posterior so com autorizacao e validacao do nome.

RESTORE_DRILL_ADMIN_URL: somente 127.0.0.1/postgres. RESTORE_DRILL_DATABASE_URL:
somente 127.0.0.1/renato_cortes_release_drill_<timestamp>. Credenciais somente no
ambiente autorizado, nunca no argv/documento. Nao alterar DATABASE_URL normal.

```powershell
if($env:AUTHORIZE_LOCAL_RESTORE_DRILL -ne 'YES'){throw 'Restore nao autorizado.'}
$drillDb='renato_cortes_release_drill_'+$stamp
$destination=[Uri]$env:RESTORE_DRILL_DATABASE_URL
if($destination.Host -ne '127.0.0.1' -or $destination.AbsolutePath.Trim('/') -ne $drillDb){throw 'Destino divergente.'}
if((Get-FileHash -LiteralPath $dump -Algorithm SHA256).Hash -ne $sha256){throw 'Checksum mudou.'}
Invoke-ReleasePg -Tool (Join-Path $PgBin 'createdb.exe') -ConnectionEnv RESTORE_DRILL_ADMIN_URL -Mode local-admin `
    -ToolArgs @('--no-password','--template=template0',$drillDb) | Out-Null
Invoke-ReleasePg -Tool (Join-Path $PgBin 'pg_restore.exe') -ConnectionEnv RESTORE_DRILL_DATABASE_URL -Mode local-drill `
    -ToolArgs @('--no-password','--dbname',$drillDb,'--clean','--if-exists','--no-owner','--no-acl','--exit-on-error','--single-transaction',$dump) | Out-Null
```

createdb falha se nome existe: nao fazer DROP automatico. --clean so e permitido
apos guards para DB local dedicado recem-criado. Nao usar --create, que poderia
restaurar o nome original. Roles/policies ou dependencias ausentes: PARAR e preparar
ambiente compativel em etapa aprovada. Nao ignorar erros, remover FKs ou excluir
linhas/DDL do dump silenciosamente para forcar resultado verde.

### Contagens e integridade: fonte congelada e copia

```sql
BEGIN TRANSACTION READ ONLY;
SHOW transaction_read_only;
SELECT 'subscriptions' AS object, count(*) AS rows FROM public.subscriptions
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'appointments', count(*) FROM public.appointments
UNION ALL SELECT 'appointment_services', count(*) FROM public.appointment_services
UNION ALL SELECT 'employee_commissions', count(*) FROM public.employee_commissions
UNION ALL SELECT 'financial_transactions', count(*) FROM public.financial_transactions
UNION ALL SELECT 'subscription_payouts', count(*) FROM public.subscription_payouts
UNION ALL SELECT 'subscription_plan_services', count(*) FROM public.subscription_plan_services
UNION ALL SELECT '_prisma_migrations', count(*) FROM public._prisma_migrations;
SELECT 'appointment_client_orphan' AS check_name, count(*) AS violations
FROM public.appointments a LEFT JOIN public.clients c ON c.id=a."clientId" WHERE c.id IS NULL
UNION ALL SELECT 'commission_appointment_orphan',count(*) FROM public.employee_commissions c
LEFT JOIN public.appointments a ON a.id=c."appointmentId" WHERE c."appointmentId" IS NOT NULL AND a.id IS NULL
UNION ALL SELECT 'payment_subscription_orphan',count(*) FROM public.payments p
LEFT JOIN public.subscriptions s ON s.id=p."subscriptionId" WHERE p."subscriptionId" IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'transaction_payment_orphan',count(*) FROM public.financial_transactions t
LEFT JOIN public.payments p ON p.id=t."paymentId" WHERE t."paymentId" IS NOT NULL AND p.id IS NULL
UNION ALL SELECT 'payout_barber_orphan',count(*) FROM public.subscription_payouts p
LEFT JOIN public.barbers b ON b.id=p."barberId" WHERE b.id IS NULL;
SELECT count(*) AS invalid_public_constraints FROM pg_constraint c
JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated;
COMMIT;
```

Fonte/copia: contagens iguais e zero violacoes. Nao imprimir PII. Registrar tambem
extensoes/dependencias, versao PostgreSQL e checksums das migrations.

### Prisma e motor publicado na copia, antes da migration

Executar SOMENTE localmente, por stdin `node --input-type=module`, a partir de
frontend do candidato. Nao importar servidor web nem alterar DATABASE_URL normal.

```javascript
import { PrismaClient } from '@prisma/client';
import { loadEngine } from './scripts/audit-october-subscription-pool-readonly.mjs';
const url = process.env.RESTORE_DRILL_DATABASE_URL;
if (!url) throw new Error('Local drill URL required');
let u;
try { u = new URL(url); } catch { throw new Error('Invalid local drill configuration'); }
if (u.hostname !== '127.0.0.1' || !/^\/renato_cortes_release_drill_[0-9_]+$/.test(u.pathname)) throw new Error('Local drill only');
const engineSHA = process.env.BACKUP_ACTIVE_PRODUCTION_SHA;
if (!/^[0-9a-f]{40}$/.test(engineSHA ?? '')) throw new Error('Verified production SHA required');
const engine = loadEngine(engineSHA);
const p = new PrismaClient({ datasources: { db: { url } } });
const select = { id:true,clientId:true,subscriptionPlanId:true,startDate:true,endDate:true,
  active:true,status:true,deletedAt:true,subscriptionPlan:{include:{services:true}} };
try {
  const result = await p.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const ro = await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if (ro[0]?.transaction_read_only !== 'on') throw new Error('Read only required');
    const db = {
      barber:tx.barber,manualService:tx.manualService,subscriptionPayout:tx.subscriptionPayout,
      subscription:{findMany:args=>tx.subscription.findMany({where:args.where,select})},
      appointment:{findMany:args=>tx.appointment.findMany({where:args.where,select:{...args.select,client:{select:{subscriptions:{select}}}}})}
    };
    await tx.payment.count(); await tx.employeeCommission.count(); await tx.financialTransaction.count();
    const pool = await engine.payout.calculateSubscriptionPayouts('2026-10',db);
    return {prismaQueryPassed:true,revenue:pool.revenueBase,pool:pool.poolAmount,visits:pool.totalAttendances};
  },{isolationLevel:'RepeatableRead',timeout:60000,maxWait:10000});
  console.log(JSON.stringify(result));
} catch { console.error('Drill verification failed; sensitive details withheld');process.exitCode=1; }
finally { try { await p.$disconnect(); } catch { process.exitCode=1; } }
```

Resultado deve coincidir com snapshot fonte; 430/172/5 e referencia auditada, nao
substituto de preflight contemporaneo. Aplicar M1/M2/M3 SOMENTE na copia em ensaio
aprovado, por processo migrator isolado: DIRECT_URL/DATABASE_URL do FILHO apontam
para a copia e pai/.env/guards permanecem intactos. Nao usar npm prisma:migrate,
migrate dev ou reset. Repetir contagens/integridade e smoke do novo codigo na copia.
Nenhum Payment/ciclo deve nascer so por aplicar schema. Repetir leitura antiga com
selecoes antigas na copia expandida. Marcar restoreDrillPassed=true no manifesto
apenas apos todos os passos; reter checksums/resultados fora do Git.

## 5. Ordem exata, com gates humanos

1. Revisar candidato, secrets e testes; obter autorizacao de commit LOCAL.
2. Commit somente quando autorizado; obter RC_SHA real; sem push main ainda.
3. Build/testar commit exato e ensaiar procedimento em ambiente seguro.
4. Aprovar janela/credenciais e suspensao de TODAS as escritas (app, backend,
   jobs, SQL). Nao existe feature flag global comprovada no repo: mecanismo
   operacional de manutencao deve ser aprovado/testado, nao inventado.
5. Confirmar alias/SHA ativo e drift/status. Pendentes exatamente M1/M2/M3,
   sem falhas anteriores; migrate deploy nao deve aplicar outras silenciosamente.
6. Com escritas suspensas, backup final imediatamente antes do trabalho DDL;
   manifesto/checksum/contagens; leitura integral de archive e restore drill.
   Fonte congelada durante drill. Nova escrita invalida o ponto final de backup.
7. Reconfirmar backup/drill PASS, fonte/role/grants/locks, saldo 430/172/5 e RC_SHA.
8. Autorizar/executar M1->M2->M3 em producao pelo migrator dedicado do checkout RC.
   Conexao direta ou Session Pooler apropriada, nao Transaction Pooler; URL somente
   no ambiente do filho, sem alterar configuracao de desenvolvimento. Parar na
   primeira falha. Sem reset/down/drop/resolve automatico.
9. Confirmar schema/constraints/migrations finalizadas, grants de runtime/auditoria
   nas novas tabelas e ausencia de novos dados.
   Codigo antigo permanece ativo com dados antigos ate publicar.
10. So AGORA autorizar push main/publicacao RC. Push pode acionar Vercel: nunca
    push main antes de EXPAND completo. Preview antecipado usa DB isolado, nao
    codigo novo contra producao sem schema compativel.
11. Confirmar deployment ativo RC_SHA, Prisma gerado e smoke autenticado:
    cliente/login/agendamento; funcionario/estimativa; admin/assinaturas/financeiro/
    repasses; dev/manutencao. Sem confirmar pagamentos reais para testar UI.
12. Testar/limitar manutencao de registros com ciclos: exclusao fisica encontra
    FK RESTRICT. Nao prometer delete antigo transparente nem remover constraints.
    Bloquear procedimento se interface nao tratar a recusa com seguranca.
13. Apenas DRY-RUN Matheus no script preparado, checkout de release limpo,
    sem --write; role read-only, SHA/key/ADMIN/evidencia corretos.
14. PARAR. Apresentar snapshot/invariantes e pedir nova autorizacao humana
    especifica. Matheus BLOQUEADO. Nenhuma correcao implicita no release.
15. Em etapa futura autorizada: novo ponto de recuperacao/backup, revalidacao
    sob locks e operacao atomica com --write e confirmacao adicional.
16. Auditoria posterior READ ONLY: 430/172/6; Renan2/R$57,33; Italo R$28,67;
    Renato R$86; Payment/ciclo unicos com method/paidAt NULL; mesmos IDs de
    Appointment/INCOME/comissao; zeros cobertos; nenhum payout PAID criado.
17. Liberar escritas normais so com aceite/monitoring do modelo novo. Se encerrar
    janela antes de autorizacao Matheus, registrar que novos ciclos NORMAIS ja
    limitam rollback antigo; exigir outro dry-run antes da correcao.

Comando/credencial do migrator so liberados na etapa 8 autorizada, depois de validar
lista de pendentes e backup. Nenhum comando de producao foi executado.

### Migrator isolado: comando preparado para etapa autorizada

No checkout RC limpo, com dependencias fixadas pelo lockfile. Antes de invocar:
inspecionar status/catalogo e aprovar TODAS as migrations pendentes. O helper nao
substitui essa revisao. Nao usar credencial de auditoria para DDL.

```powershell
function Invoke-ReleaseMigration {
    param([string]$RcFrontend,[string]$ConnectionEnv,
          [ValidateSet('local-drill','production')][string]$Target)
    $raw=[Environment]::GetEnvironmentVariable($ConnectionEnv,'Process')
    if(-not $raw){throw 'Conexao de migration separada ausente.'}
    try{$u=[Uri]$raw}catch{throw 'Conexao invalida; detalhes omitidos.'}
    if($Target -eq 'production'){
        if($env:AUTHORIZE_RELEASE_MIGRATIONS -ne 'YES' -or $env:RELEASE_BACKUP_RESTORE_DRILL_PASSED -ne 'YES'){
            throw 'Migration ainda nao autorizada ou backup/drill nao aprovado.'
        }
        if($u.Scheme -notin @('postgres','postgresql') -or $u.Host -notmatch '\.(supabase\.co|supabase\.com)$' -or
           $u.Host -ne $env:BACKUP_EXPECTED_HOST -or $u.AbsolutePath -ne '/postgres'){throw 'Origem divergente.'}
    }else{
        if($env:AUTHORIZE_LOCAL_MIGRATION_REHEARSAL -ne 'YES' -or $u.Host -ne '127.0.0.1' -or
           $u.AbsolutePath -notmatch '^/renato_cortes_release_drill_[0-9_]+$'){throw 'Ensaio local bloqueado.'}
    }
    $head=(& git -C $RcFrontend rev-parse HEAD).Trim()
    if($LASTEXITCODE -ne 0 -or $head -ne $env:RELEASE_CANDIDATE_SHA){throw 'RC SHA divergente.'}
    $dirty=& git -C $RcFrontend status --porcelain
    if($dirty){throw 'Usar checkout RC limpo separado; nao descartar alteracoes atuais.'}
    $entry=Join-Path $RcFrontend 'node_modules\prisma\build\index.js'
    if(-not(Test-Path -LiteralPath $entry)){throw 'Prisma fixado do RC ausente.'}
    $p=[Diagnostics.ProcessStartInfo]::new()
    $p.FileName=(Get-Command node -CommandType Application).Source
    $p.WorkingDirectory=$RcFrontend
    $p.UseShellExecute=$false; $p.CreateNoWindow=$true
    $p.RedirectStandardOutput=$true; $p.RedirectStandardError=$true
    foreach($arg in @($entry,'migrate','deploy','--schema','prisma/schema.prisma')){[void]$p.ArgumentList.Add($arg)}
    # Somente o FILHO recebe o destino; nao altera o pai, arquivos ou guards locais.
    $p.EnvironmentVariables['DIRECT_URL']=$raw
    $p.EnvironmentVariables['DATABASE_URL']=$raw
    foreach($key in @('AUDIT_PRODUCTION_DATABASE_URL','LEGACY_RECONCILIATION_DATABASE_URL',
        'BACKUP_PRODUCTION_DATABASE_URL',$ConnectionEnv)){$p.EnvironmentVariables.Remove($key)}
    $child=[Diagnostics.Process]::Start($p)
    $stdout=$child.StandardOutput.ReadToEndAsync();$stderr=$child.StandardError.ReadToEndAsync()
    $child.WaitForExit();[void]$stdout.GetAwaiter().GetResult();[void]$stderr.GetAwaiter().GetResult()
    if($child.ExitCode -ne 0){throw 'Migration falhou; parar e inspecionar catalogo de forma segura.'}
    'Migrator terminou; confirmar schema e ledger antes de liberar deploy.'
}
# ENSAIO FUTURO, somente apos restore autorizado:
# Invoke-ReleaseMigration -RcFrontend $RcFrontend -ConnectionEnv RESTORE_DRILL_DATABASE_URL -Target local-drill
# PRODUCAO FUTURA, somente apos todos os gates e autorizacao especifica:
# Invoke-ReleaseMigration -RcFrontend $RcFrontend -ConnectionEnv RELEASE_MIGRATION_DATABASE_URL -Target production
```

ACKs sao gates humanos, nao prova automatica de backup. Conferir manifesto/checksum/
drill e status de migrations realmente aprovados antes de definir qualquer ACK.
Nao definir esses ACKs nesta etapa. Nao desabilitar guards, modificar checksums ou
acrescentar BEGIN/COMMIT ad hoc ao SQL do release. DDL parcial usa recovery A.

## 6. Recovery matrix

| Cenario | Acao segura | Ponto de recuperacao |
|---|---|---|
| A: migration falha antes do deploy | Manter SHA antigo e suspensao. Inspecionar catalogo e _prisma_migrations sem despejar logs sensiveis. Nao assumir zero DDL. Reverter/completar somente estado parcial comprovado com plano revisado; resolve --rolled-back apenas depois de desfazer, ou --applied apenas depois de completar SQL exato. | Backup final e catalogo/checksums anteriores, nenhuma feature nova ativa. |
| B: migrations passam, deploy falha | Manter deployment antigo, expand e escritores novos desligados. Nao apagar tabelas/colunas. Corrigir build/env e republicar RC autorizado. | SHA antigo, schema expandido, dados antigos. |
| C: bug no deploy, antes de conciliacao legada | Verificar se houve QUALQUER ciclo NORMAL novo. Se zero, voltar codigo antigo mantendo expand apos smoke. Se houve ciclo, manter leitor compativel, bloquear confirmacoes e forward fix; rollback antigo nao e genericamente seguro. | Backup antes de escritores e trilha de operacoes posteriores. |
| D: method/paidAt nulos legados persistidos | Nao voltar para Prisma antigo que exige method. Preservar leitor novo, suspender escritores, forward fix. Nao fabricar data/metodo ou apagar historia para reaplicar NOT NULL. | Backup pre-conciliacao, evidencia e registros posteriores; decisao humana. |
| E: transacao Matheus falha | Rollback total do dominio. Timeout/desconexao pode deixar resultado ambiguo: consultar key/ciclo/Payment/auditoria READ ONLY antes de repetir. Retry so mesma key, nunca outra para vencer erro. | Estado anterior ou ALREADY_RECONCILED se commit ocorreu e resposta se perdeu. |
| F: correcao conclui, auditoria diverge | Suspender operacoes relacionadas e repasses, preservar incidente/snapshot. Nenhuma segunda correcao automatica/clawback. Decidir compensacao transacional/forward fix especifico. Restore total pode perder operacoes legitimas posteriores e exige aprovacao/replay. | Backup pre-correcao, trilha antes/depois e todos os eventos posteriores. |

Prisma 6 nao possui migrate down automatico. Nao marcar migration aplicada para
ocultar erro. Restore de producao exige avaliar RPO, dados posteriores, Auth/Storage
e replay. PITR do provedor nao restaura arquivos do Storage API; dump public tambem
nao cobre esses arquivos. Nenhum procedimento de recovery foi executado nesta etapa.

## 7. Candidato e scan

Lista explicita em release-candidate-files-2026-10-14.txt. Nao usar git add . ou -A.
Excluir .env*, credenciais, backups, node_modules, .next, logs, temporarios e
frontend/tsconfig.tsbuildinfo, rastreado antes desta rodada; preservar fora do commit.
Varredura local por caminhos e URI com senha/PEM/JWT/tokens GitHub/Supabase/AWS:
PASS sem exibir matches. Gitleaks/trufflehog nao encontrados; nao e prova universal
de ausencia de segredos. Revisao humana e novo scan do staged diff sao gates.

## 8. Fontes

- PostgreSQL ALTER TABLE: https://www.postgresql.org/docs/16/sql-altertable.html
- pg_dump: https://www.postgresql.org/docs/16/app-pgdump.html
- pg_restore: https://www.postgresql.org/docs/16/app-pgrestore.html
- Prisma recovery/transaction defaults: https://www.prisma.io/blog/prisma-migrate-dx-primitives
- Supabase backups/limites: https://supabase.com/docs/guides/platform/backups

## 9. Estado desta etapa

Somente documentacao/inventario; nenhum arquivo funcional ou migration alterado.
Backup real: NAO EXECUTADO. Restore drill real: NAO EXECUTADO.
PRODUCAO ACESSADA: NAO. PRODUCTION WRITES: 0.
CORRECAO MATHEUS: BLOQUEADA.
COMMIT: NAO. PUSH: NAO. DEPLOY: NAO.
