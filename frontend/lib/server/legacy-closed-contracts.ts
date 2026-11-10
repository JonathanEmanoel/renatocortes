import type { Prisma } from '@prisma/client';

// Reviewed H3 cancellations: identity and before-image, not a general date exemption.
const reviewed = [
  ['b47d38bb-00b7-4d77-b91b-29af71a0fc42', 'd754249c-0ac5-4784-b2b1-46101be92f38', '2e6f0836-7f29-4c82-88ee-eab3551fbdeb', '2026-09-18T19:56:19.892Z', '2026-09-18T20:07:19.193Z', '2026-09-18T20:07:19.194Z'],
  ['e3fc2a87-ad2e-4edb-9d60-2cc82c22bebf', '1dbf4df2-c624-4893-945c-f611fec3f6ec', 'a18d5c7e-baa5-41fa-9650-808615730f46', '2026-09-18T19:38:47.496Z', '2026-09-25T00:45:31.504Z', '2026-09-25T00:45:31.505Z'],
  ['013e9438-d92a-44b6-89ba-b4842e983028', 'ff90f624-038f-42f1-95bb-c4e4a4f2642a', 'a18d5c7e-baa5-41fa-9650-808615730f46', '2026-09-01T16:06:22.646Z', '2026-09-01T16:07:00.212Z', '2026-09-01T16:07:00.213Z']
] as const;

type Contract = Prisma.SubscriptionGetPayload<Record<string, never>>;
export async function isReviewedLegacyCancellation(row: Contract, db: Prisma.TransactionClient) {
  const expected = reviewed.find(item => item[0] === row.id);
  if (!expected || row.status !== 'CANCELED' || row.active || row.deletedAt || row.baseDueDay !== null ||
      row.billingFirstDueDate || row.nextCycleDueDate || row.nextCycleStartDate || row.legacyRevenueSnapshot ||
      row.clientId !== expected[1] || row.subscriptionPlanId !== expected[2] ||
      row.startDate.toISOString() !== expected[3] || row.endDate?.toISOString() !== expected[4] || row.updatedAt.toISOString() !== expected[5]) return false;
  const evidence = await db.$queryRaw<{ contradiction: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM payments WHERE "subscriptionId" = ${row.id}) OR
      EXISTS (SELECT 1 FROM subscription_cycles WHERE "subscriptionId" = ${row.id}) OR
      EXISTS (SELECT 1 FROM subscription_due_day_changes WHERE "subscriptionId" = ${row.id}) OR
      EXISTS (SELECT 1 FROM manual_services WHERE "subscriptionId" = ${row.id}) OR
      EXISTS (SELECT 1 FROM appointments WHERE "clientId" = ${row.clientId}
        AND "dataHora" BETWEEN ${row.startDate} AND ${row.endDate}) OR
      EXISTS (SELECT 1 FROM financial_transactions WHERE type = 'INCOME'
        AND (position(${row.id} in coalesce(description, '')) > 0 OR
             position(${row.clientId} in coalesce(description, '')) > 0)) OR
      EXISTS (SELECT 1 FROM audit_logs WHERE
        ("entityId" = ${row.id} OR position(${row.id} in coalesce(metadata::text, '')) > 0)
        AND (action ILIKE '%APPROVE%' OR action ILIKE '%PAYMENT%' OR action ILIKE '%RENEW%' OR action ILIKE '%MANUAL_SERVICE%'))
    ) AS contradiction`;
  return evidence.length === 1 && evidence[0].contradiction === false;
}
