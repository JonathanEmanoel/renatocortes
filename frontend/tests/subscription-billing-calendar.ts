import assert from "node:assert/strict";
import { dueDateInMonth, nextCycleDueDate } from "@/lib/server/subscription-calendar";
import { dateInputFromDate } from "@/lib/server/date-periods";

const checks: { name: string; status: string }[] = [];
function check(name: string, test: () => void) { test(); checks.push({ name, status: "PASS" }); }
for (const [year, february] of [[2026, "28"], [2028, "29"]] as const) {
  for (const base of [29, 30, 31]) check(`${year}: base ${base}, fevereiro sem deriva`, () => {
    const january = dueDateInMonth(`${year}-01`, base);
    const feb = nextCycleDueDate(january, base);
    const march = nextCycleDueDate(feb, base);
    assert.equal(dateInputFromDate(feb), `${year}-02-${february}`);
    assert.equal(dateInputFromDate(march), `${year}-03-${base}`);
  });
}
check("31 janeiro -> fevereiro -> marco -> abril -> maio", () => {
  let due = dueDateInMonth("2026-01", 31);
  for (const expected of ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]) {
    due = nextCycleDueDate(due, 31); assert.equal(dateInputFromDate(due), expected);
  }
});
check("Pagamento atrasado nao participa do calculo", () => assert.equal(dateInputFromDate(nextCycleDueDate(dueDateInMonth("2026-11", 1), 1)), "2026-12-01"));
check("Pagamento antecipado nao participa do calculo", () => assert.equal(dateInputFromDate(nextCycleDueDate(dueDateInMonth("2026-11", 10), 10)), "2026-12-10"));
check("Mudanca 1 -> 10 somente no proximo mes", () => assert.equal(dateInputFromDate(nextCycleDueDate(dueDateInMonth("2026-10", 1), 10)), "2026-11-10"));
check("Mudanca administrativa para 31", () => assert.equal(dateInputFromDate(nextCycleDueDate(dueDateInMonth("2026-01", 10), 31)), "2026-02-28"));
check("Virada de ano", () => assert.equal(dateInputFromDate(nextCycleDueDate(dueDateInMonth("2026-12", 31), 31)), "2027-01-31"));
check("America/Sao_Paulo na virada UTC", () => assert.equal(dateInputFromDate(new Date("2026-11-01T02:59:59Z")), "2026-10-31"));
check("Vencimento em meia-noite operacional", () => assert.equal(dueDateInMonth("2026-10", 1).toISOString(), "2026-10-01T03:00:00.000Z"));
check("Dias e meses adulterados bloqueados", () => {
  for (const day of [0, 32, 1.5, NaN]) assert.throws(() => dueDateInMonth("2026-01", day));
  for (const month of ["2026-00", "2026-13", "foo"]) assert.throws(() => dueDateInMonth(month, 1));
});
console.log(JSON.stringify({ pass: checks.length, fail: 0, checks }, null, 2));
