import { Prisma, type SubscriptionPayoutStatus, type SubscriptionPayoutType } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import {
  SUBSCRIPTION_BARBER_PERCENT,
  getSubscriptionRevenueForPeriod,
  appointmentFinancials
} from "@/lib/server/finance-rules";
import { endOfSaoPauloDay, startOfSaoPauloDay, todayDateInput } from "@/lib/server/date-periods";

/*
 * Centraliza o fechamento mensal do rateio de assinaturas.
 * O calculo fica virtual enquanto nao houver pagamento; quando Renato confirma,
 * o valor vira um SubscriptionPayout pago e tambem uma despesa financeira real.
 */
export type SubscriptionPayoutRow = {
  id: string;
  barberId: string;
  barberName: string;
  competenceMonth: string;
  type: SubscriptionPayoutType;
  adjustmentNumber: number;
  status: SubscriptionPayoutStatus;
  subscriberAttendances: number;
  totalAttendances: number;
  sharePercent: number;
  revenueBase: number;
  businessShare: number;
  poolAmount: number;
  calculatedAmount: number;
  paidAmount: number;
  paidAt: Date | null;
  expenseId: string | null;
  isVirtual: boolean;
  differenceFromPaid: number;
  detailLines: string[];
  operationKey?: string;
  paidById?: string | null;
  snapshot?: Prisma.JsonValue;
};

type VisitCounter = {
  [barberId: string]: {
    appointmentIds: string[];
    manualServiceIds: string[];
  };
};

function toCents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return value / 100;
}

/** Fixa duas casas na persistencia monetaria apos distribuir valores em centavos. */
function decimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

/** Inicio inclusivo da competencia YYYY-MM, independente da data de pagamento. */
function monthStart(competenceMonth: string) {
  return startOfSaoPauloDay(`${competenceMonth}-01`);
}

/** Fim inclusivo do ultimo dia do mes, com offset -03:00 e meses de tamanho variavel. */
function monthEnd(competenceMonth: string) {
  const [year, month] = competenceMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return endOfSaoPauloDay(`${competenceMonth}-${String(lastDay).padStart(2, "0")}`);
}

export function currentCompetenceMonth() {
  return todayDateInput().slice(0, 7);
}

export function competenceMonthLabel(competenceMonth: string) {
  return monthStart(competenceMonth).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function validCompetenceMonth(value: string) {
  return /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5, 7)) >= 1 && Number(value.slice(5, 7)) <= 12;
}

/** Rejeita competencia malformada antes de compor datas ou consultar o fechamento. */
export function assertCompetenceMonth(value: string) {
  if (!validCompetenceMonth(value)) throw new Error("Informe uma competencia valida.");
}

/**
 * Exige ao menos um servico coberto por assinatura vigente no instante da visita.
 * Usa a primeira assinatura elegivel e recorre ao servico principal em registros
 * sem itens. Retorna um booleano: Corte + Barba cobertos continuam uma visita.
 */
const coveredAppointmentVisit = (appointment: Parameters<typeof appointmentFinancials>[0]) => appointmentFinancials(appointment).hasCoveredVisit;

const payoutAppointmentSelect = {
  id: true,
  barberId: true,
  dataHora: true,
  service: { select: { id: true, name: true, price: true } },
  services: { select: { serviceId: true, price: true, service: { select: { name: true } } } },
  client: {
    select: {
      subscriptions: {
        where: { active: true, status: "ACTIVE", deletedAt: null },
        select: {
          active: true,
          status: true,
          deletedAt: true,
          startDate: true,
          endDate: true,
          subscriptionPlan: { select: { name: true, services: { select: { serviceId: true } } } }
        }
      }
    }
  }
} as const;

function historicalFields(payout: Prisma.SubscriptionPayoutGetPayload<object>) {
  const snapshot = payout.snapshot && typeof payout.snapshot === "object" && !Array.isArray(payout.snapshot) ? payout.snapshot : {};
  return {
    subscriberAttendances: payout.barberSubscriberAttendances,
    totalAttendances: payout.totalSubscriberAttendances,
    sharePercent: Number(payout.sharePercent),
    revenueBase: Number(payout.revenueBase),
    businessShare: Number(payout.businessShare),
    poolAmount: Number(payout.poolAmount),
    calculatedAmount: Number(payout.calculatedAmount),
    paidAmount: Number(payout.paidAmount),
    paidAt: payout.paidAt,
    paidById: payout.paidById,
    snapshot: payout.snapshot,
    expenseId: payout.expenseId,
    detailLines: Array.isArray(snapshot.detailLines) ? snapshot.detailLines.filter((line): line is string => typeof line === "string") : [
      `Receita considerada: ${formatCurrency(Number(payout.revenueBase))}`,
      `Pool 40%: ${formatCurrency(Number(payout.poolAmount))}`,
      `Atendimentos do barbeiro: ${payout.barberSubscriberAttendances}/${payout.totalSubscriberAttendances}`
    ]
  };
}

/**
 * Divide o pool inteiro proporcionalmente as visitas pelo metodo dos maiores restos.
 * Arredonda para baixo e reparte centavos sobrantes; empates preservam a ordem de
 * entrada. Sem pool positivo ou visitas, todos recebem zero.
 * @param poolCents Valor monetario em centavos inteiros.
 * @param counts Contagens nao negativas por barbeiro, com identificadores distintos.
 * @returns Mapa de centavos cuja soma fecha o pool quando existe participacao.
 */
export function distributeSubscriptionPoolCents(poolCents: number, counts: { barberId: string; count: number }[]) {
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const result = new Map<string, number>();
  if (poolCents <= 0 || total <= 0) {
    counts.forEach((item) => result.set(item.barberId, 0));
    return result;
  }

  const base = counts.map((item, index) => {
    const exact = (poolCents * item.count) / total;
    const cents = Math.floor(exact);
    return { ...item, index, cents, remainder: exact - cents };
  });
  let distributed = base.reduce((sum, item) => sum + item.cents, 0);
  // Distribui centavos restantes pelo maior resto para fechar exatamente o pool.
  base
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .forEach((item) => {
      if (distributed < poolCents) {
        item.cents += 1;
        distributed += 1;
      }
    });
  base.forEach((item) => result.set(item.barberId, item.cents));
  return result;
}

/**
 * Recalcula a competencia sem gravar repasses ou despesas. Separa 40% para o pool
 * e o restante (60%, salvo arredondamento em centavos) para a barbearia.
 * Profissionais ativos participam por visitas cobertas: agendamentos COMPLETED
 * e manuais nao ocultos. MAIN pendente pode ser virtual; pagamentos existentes
 * preservam paidAmount, paidAt e snapshot. Diferencas positivas apos MAIN pago
 * geram proposta ADJUSTMENT; negativas ficam REVIEW, sem estorno automatico.
 */
export async function calculateSubscriptionPayouts(competenceMonth: string, db: Prisma.TransactionClient = prisma) {
  assertCompetenceMonth(competenceMonth);
  const start = monthStart(competenceMonth);
  const end = monthEnd(competenceMonth);

  /*
   * A base do rateio considera apenas atendimentos de assinantes realmente
   * cobertos no periodo: agendamentos concluidos e atendimentos avulsos ligados
   * a assinatura. Pendentes/recusados nao entram como repasse devido.
   */
  const [allBarbers, revenueBase, appointments, manualServices, storedPayouts] = await Promise.all([
    db.barber.findMany({ include: { user: true }, orderBy: [{ user: { name: "asc" } }, { id: "asc" }] }),
    getSubscriptionRevenueForPeriod(start, end, db),
    db.appointment.findMany({
      where: { status: "COMPLETED", dataHora: { gte: start, lte: end }, deletedAt: null },
      select: payoutAppointmentSelect
    }),
    db.manualService.findMany({
      where: {
        serviceDate: { gte: start, lte: end },
        deletedAt: null,
        subscriptionId: { not: null },
        items: { some: { coveredBySubscription: true } }
      },
      include: { items: true }
    }),
    db.subscriptionPayout.findMany({
      where: { competenceMonth },
      include: { barber: { include: { user: true } } },
      orderBy: [{ barber: { user: { name: "asc" } } }, { adjustmentNumber: "asc" }]
    })
  ]);

  // Desativacao atual nao remove quem trabalhou ou recebeu nesta competencia.
  const historicalIds = new Set([
    ...appointments.filter(coveredAppointmentVisit).map((item) => item.barberId),
    ...manualServices.map((item) => item.barberId),
    ...storedPayouts.map((item) => item.barberId)
  ]);
  const barbers = allBarbers.filter((barber) => (barber.active && !barber.deletedAt) || historicalIds.has(barber.id));

  const visits: VisitCounter = {};
  barbers.forEach((barber) => {
    visits[barber.id] = { appointmentIds: [], manualServiceIds: [] };
  });

  appointments.forEach((appointment) => {
    if (!visits[appointment.barberId] || !coveredAppointmentVisit(appointment)) return;
    visits[appointment.barberId].appointmentIds.push(appointment.id);
  });
  manualServices.forEach((manualService) => {
    if (!visits[manualService.barberId]) return;
    visits[manualService.barberId].manualServiceIds.push(manualService.id);
  });

  // IDs de registros contam visitas, nao itens: Corte + Barba da mesma visita
  // nao dobra a participacao. No modo assinante, multiplicadores nao entram aqui.
  const counts = barbers.map((barber) => ({
    barberId: barber.id,
    count: visits[barber.id].appointmentIds.length + visits[barber.id].manualServiceIds.length
  }));
  const totalAttendances = counts.reduce((sum, item) => sum + item.count, 0);
  const revenueCents = toCents(revenueBase);
  const poolCents = Math.round(revenueCents * (SUBSCRIPTION_BARBER_PERCENT / 100));
  const businessCents = revenueCents - poolCents;
  const distributed = distributeSubscriptionPoolCents(poolCents, counts);

  const storedByBarber = new Map<string, typeof storedPayouts>();
  storedPayouts.forEach((payout) => {
    const list = storedByBarber.get(payout.barberId) ?? [];
    list.push(payout);
    storedByBarber.set(payout.barberId, list);
  });

  const rows: SubscriptionPayoutRow[] = [];
  barbers.forEach((barber) => {
    const count = counts.find((item) => item.barberId === barber.id)?.count ?? 0;
    const calculatedCents = distributed.get(barber.id) ?? 0;
    const paidRows = storedByBarber.get(barber.id) ?? [];
    const main = paidRows.find((payout) => payout.adjustmentNumber === 0);
    const paidTotalCents = paidRows
      .filter((payout) => payout.status === "PAID")
      .reduce((sum, payout) => sum + toCents(Number(payout.paidAmount)), 0);
    const differenceCents = calculatedCents - paidTotalCents;

    // Linha MAIN pode ser virtual: mostra o valor devido atual sem gravar baixa financeira.
    rows.push({
      id: main?.id ?? `main-${competenceMonth}-${barber.id}`,
      barberId: barber.id,
      barberName: barber.user.name,
      competenceMonth,
      type: "MAIN",
      adjustmentNumber: 0,
      status: main?.status ?? "PENDING",
      subscriberAttendances: count,
      totalAttendances,
      sharePercent: totalAttendances > 0 ? (count / totalAttendances) * 100 : 0,
      revenueBase: fromCents(revenueCents),
      businessShare: fromCents(businessCents),
      poolAmount: fromCents(poolCents),
      calculatedAmount: fromCents(calculatedCents),
      paidAmount: main ? Number(main.paidAmount) : 0,
      paidAt: main?.paidAt ?? null,
      expenseId: main?.expenseId ?? null,
      isVirtual: !main,
      differenceFromPaid: fromCents(differenceCents),
      detailLines: [
        `Receita considerada: ${formatCurrency(fromCents(revenueCents))}`,
        `Pool 40%: ${formatCurrency(fromCents(poolCents))}`,
        `Atendimentos do barbeiro: ${count}/${totalAttendances}`,
        `Agendamentos: ${visits[barber.id].appointmentIds.length}`,
        `Manuais: ${visits[barber.id].manualServiceIds.length}`
      ],
      ...(main?.status === "PAID" ? historicalFields(main) : {})
    });

    paidRows
      .filter((payout) => payout.adjustmentNumber > 0)
      .forEach((payout) => {
        rows.push({
          id: payout.id,
          barberId: barber.id,
          barberName: barber.user.name,
          competenceMonth,
          type: payout.type,
          adjustmentNumber: payout.adjustmentNumber,
          status: payout.status,
          isVirtual: false,
          differenceFromPaid: 0,
          ...historicalFields(payout)
        });
      });

    if (main?.status === "PAID" && differenceCents !== 0) {
      // Ajustes surgem quando a competencia ja foi paga e os dados historicos mudaram depois.
      rows.push({
        id: `adjustment-${competenceMonth}-${barber.id}`,
        barberId: barber.id,
        barberName: barber.user.name,
        competenceMonth,
        type: "ADJUSTMENT",
        adjustmentNumber: -1,
        status: differenceCents > 0 ? "PENDING" : "REVIEW",
        subscriberAttendances: count,
        totalAttendances,
        sharePercent: totalAttendances > 0 ? (count / totalAttendances) * 100 : 0,
        revenueBase: fromCents(revenueCents),
        businessShare: fromCents(businessCents),
        poolAmount: fromCents(poolCents),
        calculatedAmount: fromCents(differenceCents),
        paidAmount: 0,
        paidAt: null,
        expenseId: null,
        isVirtual: true,
        differenceFromPaid: fromCents(differenceCents),
        detailLines: [
          `Pago historico: ${formatCurrency(fromCents(paidTotalCents))}`,
          `Recalculado atual: ${formatCurrency(fromCents(calculatedCents))}`,
          `Diferenca: ${formatCurrency(fromCents(differenceCents))}`
        ]
      });
    }
  });

  // A confirmacao identifica o calculo exibido, nao apenas um barbeiro/mes.
  rows.forEach((row) => {
    if (row.status !== "PENDING") return;
    row.operationKey = createHash("sha256").update(JSON.stringify({
      competenceMonth, barberId: row.barberId, type: row.type,
      amount: toCents(row.calculatedAmount), revenueCents,
      visits: counts.map((item) => ({ ...item, appointments: [...visits[item.barberId].appointmentIds].sort(), manual: [...visits[item.barberId].manualServiceIds].sort() })),
      paid: storedPayouts.filter((item) => item.barberId === row.barberId && item.status === "PAID").map((item) => item.id).sort()
    })).digest("hex");
  });

  return {
    competenceMonth,
    label: competenceMonthLabel(competenceMonth),
    start,
    end,
    revenueBase: fromCents(revenueCents),
    businessShare: fromCents(businessCents),
    poolAmount: fromCents(poolCents),
    totalAttendances,
    distributedTotal: fromCents([...distributed.values()].reduce((sum, value) => sum + value, 0)),
    currentDistribution: counts.map((item) => ({ ...item, amount: fromCents(distributed.get(item.barberId) ?? 0) })),
    pendingTotal: rows.filter((row) => row.status === "PENDING" && row.calculatedAmount > 0).reduce((sum, row) => sum + row.calculatedAmount, 0),
    paidTotal: rows.filter((row) => row.status === "PAID").reduce((sum, row) => sum + row.paidAmount, 0),
    rows
  };
}

/**
 * Ganho realizado do profissional por paidAt, somando MAIN e ajustes PAID.
 * A competencia pode ser anterior ao periodo consultado: receber hoje um mes
 * passado e ganho de hoje. PENDING/REVIEW e estimativas virtuais nao entram.
 */
export async function paidSubscriptionPayoutTotalForBarber(barberId: string, startDate: Date, endDate: Date) {
  const payouts = await prisma.subscriptionPayout.findMany({
    where: { barberId, status: "PAID", paidAt: { gte: startDate, lte: endDate } },
    select: { paidAmount: true }
  });
  return payouts.reduce((sum, payout) => sum + Number(payout.paidAmount), 0);
}

/**
 * Confirma pagamento positivo calculado no servidor e registra sua trilha financeira.
 * A rota deve autorizar ADMIN e fornecer paidById autenticado.
 * MAIN usa sequencia zero; ajustes recebem a proxima sequencia da competencia.
 * A transacao agrupa reserva PENDING -> REVIEW, despesa, transacao e estado PAID:
 * qualquer falha desfaz esse conjunto. Repetir uma linha paga e rejeitado.
 * O lock transacional da competencia serializa pagamentos antes do recalculo.
 * operationKey impede reaplicar a mesma confirmacao depois de novos retroativos.
 */
export async function paySubscriptionPayout({
  competenceMonth,
  barberId,
  adjustment,
  paidById,
  operationKey
}: {
  competenceMonth: string;
  barberId: string;
  adjustment?: boolean;
  paidById: string;
  operationKey: string;
}) {
  assertCompetenceMonth(competenceMonth);
  return prisma.$transaction(async (tx) => {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('subscription-payout'), hashtext(${competenceMonth}))`;
  const previous = await tx.subscriptionPayout.findUnique({ where: { operationKey } });
  if (previous) throw new Error("Este repasse ja foi pago.");
  const calculation = await calculateSubscriptionPayouts(competenceMonth, tx);
  const row = calculation.rows.find((item) =>
    item.barberId === barberId &&
    (adjustment ? item.type === "ADJUSTMENT" && item.isVirtual && item.calculatedAmount > 0 : item.type === "MAIN")
  );
  if (!row) throw new Error("Repasse nao encontrado para esta competencia.");
  if (row.status === "PAID") throw new Error("Este repasse ja foi pago.");
  if (row.status === "REVIEW") throw new Error("Ajuste negativo precisa de analise manual antes de qualquer baixa.");
  if (row.calculatedAmount <= 0) throw new Error("Nao ha valor positivo para pagar.");
  if (row.operationKey !== operationKey) throw new Error("O calculo mudou. Atualize a competencia e confirme novamente.");
    const nextAdjustmentNumber = adjustment
      ? ((await tx.subscriptionPayout.aggregate({
          where: { competenceMonth, barberId },
          _max: { adjustmentNumber: true }
        }))._max.adjustmentNumber ?? 0) + 1
      : 0;

    const stored = await tx.subscriptionPayout.upsert({
      where: { competenceMonth_barberId_adjustmentNumber: { competenceMonth, barberId, adjustmentNumber: nextAdjustmentNumber } },
      create: {
        competenceMonth,
        operationKey,
        barberId,
        type: adjustment ? "ADJUSTMENT" : "MAIN",
        adjustmentNumber: nextAdjustmentNumber,
        status: "PENDING",
        revenueBase: decimal(row.revenueBase),
        businessShare: decimal(row.businessShare),
        poolAmount: decimal(row.poolAmount),
        totalSubscriberAttendances: row.totalAttendances,
        barberSubscriberAttendances: row.subscriberAttendances,
        sharePercent: new Prisma.Decimal(row.sharePercent.toFixed(4)),
        calculatedAmount: decimal(row.calculatedAmount),
        paidAmount: new Prisma.Decimal("0.00"),
        // Memoria do calculo na criacao: permite comparar o pagamento historico
        // com recalculos futuros sem substituir sua base por dados alterados.
        snapshot: {
          label: calculation.label,
          detailLines: row.detailLines,
          calculatedAt: new Date().toISOString(),
          currentDistribution: calculation.currentDistribution
        }
      },
      update: {}
    });

    if (stored.status === "PAID") throw new Error("Este repasse ja foi pago.");
    const locked = await tx.subscriptionPayout.updateMany({
      where: { id: stored.id, status: "PENDING" },
      data: { status: "REVIEW" }
    });
    if (locked.count !== 1) throw new Error("Este repasse ja esta em processamento ou foi pago.");

    const paidAt = new Date();
    const description = `Repasse de assinaturas - ${competenceMonthLabel(competenceMonth)} - ${row.barberName}`;
    // O pagamento do barbeiro e uma despesa paga da barbearia no financeiro.
    const category = await tx.expenseCategory.upsert({
      where: { name: "Repasse de assinaturas" },
      create: { name: "Repasse de assinaturas", active: true },
      update: { active: true, deletedAt: null }
    });
    const expense = await tx.expense.create({
      data: {
        categoryId: category.id,
        createdById: paidById,
        updatedById: paidById,
        name: description,
        description: `Pagamento mensal do pool de assinaturas. Competencia: ${competenceMonthLabel(competenceMonth)}.`,
        amount: decimal(row.calculatedAmount),
        dueDate: paidAt,
        paidAt,
        paymentMethod: "PIX",
        status: "PAID",
        notes: row.detailLines.join(" | ")
      }
    });
    await tx.financialTransaction.create({
      data: {
        expenseId: expense.id,
        type: "EXPENSE",
        amount: decimal(row.calculatedAmount),
        description
      }
    });
    return tx.subscriptionPayout.update({
      where: { id: stored.id },
      data: {
        status: "PAID",
        operationKey,
        revenueBase: decimal(row.revenueBase),
        businessShare: decimal(row.businessShare),
        poolAmount: decimal(row.poolAmount),
        totalSubscriberAttendances: row.totalAttendances,
        barberSubscriberAttendances: row.subscriberAttendances,
        sharePercent: new Prisma.Decimal(row.sharePercent.toFixed(4)),
        calculatedAmount: decimal(row.calculatedAmount),
        snapshot: { label: calculation.label, detailLines: row.detailLines, calculatedAt: paidAt.toISOString(), currentDistribution: calculation.currentDistribution },
        paidAmount: decimal(row.calculatedAmount),
        paidAt,
        paidById,
        expenseId: expense.id
      }
    });
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 30000 });
}
