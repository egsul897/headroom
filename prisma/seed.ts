import { Prisma, PrismaClient } from "@prisma/client";
import {
  COHERENT_COMPANY,
  COHERENT_DATA,
  COHERENT_DEFINED_TERMS,
  COHERENT_DOCUMENT_CAVEATS,
  COHERENT_FEED_QUEUE_ITEMS,
  COHERENT_GOLDEN_TESTS,
  COHERENT_LEDGER_ENTRIES,
  COHERENT_TRANCHES,
} from "./seed-data";

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
    const notes = COHERENT_DOCUMENT_CAVEATS[doc.id];
    await prisma.document.upsert({
      where: { id: doc.id },
      update: {
        name: doc.name,
        type: doc.type,
        governs: doc.governs,
        notes,
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
        notes,
        capacityFormulas: doc.capacityFormulas ? asJson(doc.capacityFormulas) : undefined,
        rpWaterfall: doc.rpWaterfall ? asJson(doc.rpWaterfall) : undefined,
        assetSale: doc.assetSale ? asJson(doc.assetSale) : undefined,
      },
    });
  }

  const provisionIdByKey = new Map<string, string>();
  for (const p of COHERENT_DATA.provisions) {
    const row = await prisma.covenantProvision.upsert({
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
    provisionIdByKey.set(`${p.documentId}:${p.code}`, row.id);
  }

  for (const term of COHERENT_DEFINED_TERMS) {
    const connectProvisions = term.usedByProvisionCodes.map((code) => {
      const id = provisionIdByKey.get(`${term.documentId}:${code}`);
      if (!id) throw new Error(`Defined term "${term.termName}" references unknown provision ${term.documentId}:${code}`);
      return { id };
    });
    await prisma.definedTerm.upsert({
      where: { documentId_termName: { documentId: term.documentId, termName: term.termName } },
      update: {
        sectionRef: term.sectionRef,
        fullText: term.fullText,
        provisions: { set: connectProvisions },
      },
      create: {
        documentId: term.documentId,
        termName: term.termName,
        sectionRef: term.sectionRef,
        fullText: term.fullText,
        provisions: { connect: connectProvisions },
      },
    });
  }

  // FinancialSnapshot/DebtTranche/LedgerEntry/FeedQueueItem/GoldenTest are
  // append-only event data with no natural unique key to upsert on - clear
  // this company's rows before reinserting so the seed script stays
  // idempotent across re-runs.
  await prisma.ledgerEntry.deleteMany({ where: { companyId: company.id } });
  await prisma.feedQueueItem.deleteMany({ where: { companyId: company.id } });
  await prisma.goldenTest.deleteMany({ where: { companyId: company.id } });
  await prisma.debtTranche.deleteMany({ where: { companyId: company.id } });
  await prisma.financialSnapshot.deleteMany({ where: { companyId: company.id } });

  const fin = COHERENT_DATA.financials;
  const snapshot = await prisma.financialSnapshot.create({
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
      notes:
        "FY2026 10-K (filed 8/14/2026), fiscal year ended 6/30/2026. Covenant EBITDA is an estimated build-up from the public reconciliation; CNI and basket usage not stated in filings are estimates.",
    },
  });

  for (const t of COHERENT_TRANCHES) {
    await prisma.debtTranche.create({
      data: {
        companyId: company.id,
        financialSnapshotId: snapshot.id,
        name: t.name,
        amount: t.amt,
        secured: t.secured,
        documentName: t.documentName,
      },
    });
  }

  // Inserted in the prototype's original array order so display order
  // (createdAt ascending) matches the reference exactly.
  for (const entry of COHERENT_LEDGER_ENTRIES) {
    await prisma.ledgerEntry.create({
      data: {
        companyId: company.id,
        date: new Date(entry.date),
        description: entry.description,
        basket: entry.basket,
        amount: entry.amount,
        direction: entry.direction,
        source: entry.source,
      },
    });
  }

  for (const item of COHERENT_FEED_QUEUE_ITEMS) {
    await prisma.feedQueueItem.create({
      data: {
        companyId: company.id,
        title: item.title,
        description: item.description,
        source: item.source,
        filedDate: new Date(item.filedDate),
        kind: item.kind,
        payload: asJson(item.payload),
      },
    });
  }

  for (const test of COHERENT_GOLDEN_TESTS) {
    await prisma.goldenTest.create({
      data: {
        companyId: company.id,
        question: test.question,
        queryType: test.queryType,
        queryParams: test.queryParams ? asJson(test.queryParams) : Prisma.DbNull,
        expectedAnswer: test.expectedAnswer ?? null,
        tolerance: test.tolerance ?? null,
        bindingProvision: test.bindingProvision ?? null,
        bindingDefinedTerms: test.bindingDefinedTerms ?? [],
        reviewerNotes: test.reviewerNotes,
        status: "UNVERIFIED",
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
