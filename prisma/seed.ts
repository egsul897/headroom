import { Prisma, PrismaClient } from "@prisma/client";
import { COHERENT_COMPANY, COHERENT_DATA } from "./seed-data";

const prisma = new PrismaClient();

/** These configs are plain JSON-shaped objects; Prisma just wants that asserted. */
function asJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

async function main() {
  const company = await prisma.company.upsert({
    where: { id: COHERENT_COMPANY.id },
    update: { name: COHERENT_COMPANY.name, ticker: COHERENT_COMPANY.ticker, cik: COHERENT_COMPANY.cik },
    create: COHERENT_COMPANY,
  });

  for (const doc of COHERENT_DATA.documents) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {
        name: doc.name,
        type: doc.type,
        governs: doc.governs,
        capacityFormulas: doc.capacityFormulas ? asJson(doc.capacityFormulas) : undefined,
        rpWaterfall: doc.rpWaterfall ? asJson(doc.rpWaterfall) : undefined,
        assetSale: doc.assetSale ? asJson(doc.assetSale) : undefined,
      },
      create: {
        id: doc.id,
        companyId: company.id,
        name: doc.name,
        type: doc.type,
        governs: doc.governs,
        capacityFormulas: doc.capacityFormulas ? asJson(doc.capacityFormulas) : undefined,
        rpWaterfall: doc.rpWaterfall ? asJson(doc.rpWaterfall) : undefined,
        assetSale: doc.assetSale ? asJson(doc.assetSale) : undefined,
      },
    });
  }

  for (const p of COHERENT_DATA.provisions) {
    await prisma.covenantProvision.upsert({
      where: { documentId_code: { documentId: p.documentId, code: p.code } },
      update: {
        basketName: p.basketName,
        sectionRef: p.sectionRef,
        formulaType: p.formulaType,
        thresholdValue: p.thresholdValue,
        params: p.params ? asJson(p.params) : undefined,
        notes: p.notes,
      },
      create: {
        id: p.id,
        companyId: company.id,
        documentId: p.documentId,
        code: p.code,
        basketName: p.basketName,
        sectionRef: p.sectionRef,
        formulaType: p.formulaType,
        thresholdValue: p.thresholdValue,
        params: p.params ? asJson(p.params) : undefined,
        notes: p.notes,
      },
    });
  }

  const fin = COHERENT_DATA.financials;
  await prisma.financialSnapshot.create({
    data: {
      companyId: company.id,
      asOfDate: new Date("2026-06-30"),
      ebitda: fin.ebitda,
      cash: fin.cash,
      interestExpense: fin.interestExpense,
      cumulativeNetIncome: fin.cumulativeNetIncome,
      equityProceedsSinceIssue: fin.equityProceedsSinceIssue,
      assumedNewDebtRatePct: fin.assumedNewDebtRatePct,
      totalDebt: fin.totalDebt,
      securedDebt: fin.securedDebt,
      notes: "FY2026 10-K, as of 6/30/26.",
    },
  });

  for (const entry of COHERENT_DATA.ledger) {
    await prisma.ledgerEntry.create({
      data: {
        companyId: company.id,
        date: new Date("2026-06-30"),
        description: `${entry.basket} ${entry.direction}`,
        basket: entry.basket,
        amount: entry.amount,
        direction: entry.direction,
        source: "seed",
      },
    });
  }

  console.log(`Seeded ${COHERENT_COMPANY.name} (${company.id})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
