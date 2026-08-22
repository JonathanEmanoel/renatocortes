export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse, type NextRequest } from "next/server";
import { getBarberReport, parseBarberReportFilters, reportLines } from "@/lib/server/barber-report";
import { getAuthenticatedUser } from "@/lib/server/internal-auth";

function toPdfSafeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(text: string) {
  return toPdfSafeText(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(line: string, maxLength = 104) {
  const safeLine = toPdfSafeText(line);
  if (safeLine.length <= maxLength) return [safeLine];

  const parts: string[] = [];
  let current = "";
  safeLine.split(" ").forEach((word) => {
    if (`${current} ${word}`.trim().length > maxLength) {
      if (current) parts.push(current);
      current = word;
      return;
    }
    current = `${current} ${word}`.trim();
  });
  if (current) parts.push(current);
  return parts;
}

function buildPdf(lines: string[]) {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 42;
  const marginTop = 52;
  const lineHeight = 14;
  const maxLinesPerPage = Math.floor((pageHeight - marginTop - 48) / lineHeight);
  const wrappedLines = lines.flatMap((line) => (line ? wrapLine(line) : [""]));
  const pages: string[][] = [];

  for (let index = 0; index < wrappedLines.length; index += maxLinesPerPage) {
    pages.push(wrappedLines.slice(index, index + maxLinesPerPage));
  }
  if (pages.length === 0) pages.push(["Relatorio sem dados."]);

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);
  objects.push(`<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const stream = [
      "BT",
      "/F1 10 Tf",
      `${marginLeft} ${pageHeight - marginTop} Td`,
      `${lineHeight} TL`,
      ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`),
      "ET"
    ].join("\n");

    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

export async function GET(request: NextRequest) {
  const session = await getAuthenticatedUser();
  if (!session) return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "DEVELOPER") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  const report = await getBarberReport(parseBarberReportFilters(request.nextUrl.searchParams));
  if (report.period.invalid) {
    return NextResponse.json({ error: report.period.error ?? "Periodo invalido." }, { status: 400 });
  }
  const pdf = buildPdf(reportLines(report));

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-${report.barber.name.toLowerCase().replace(/\s+/g, "-")}.pdf"`,
      "Cache-Control": "no-store"
    }
  });
}
