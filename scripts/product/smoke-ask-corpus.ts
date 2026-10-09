import { answerFromCorpus } from "../../lib/product/covenant-intelligence/ask-retrieve";

async function main() {
  const qs = [
    "What additional secured debt can the borrower incur?",
    "Which restricted payment baskets are available?",
    "Can the borrower invest in an unrestricted subsidiary?",
    "What conditions apply to an incremental facility?",
    "What restrictions apply to asset sales?",
    "Can debt incurred under one basket be secured under another provision?",
    "What financial inputs are required to calculate capacity?",
  ];
  for (const q of qs) {
    const a = await answerFromCorpus({ question: q, researchOnly: true, limit: 6 });
    console.log("---");
    console.log(q);
    console.log(a.kind, "citations=", a.citations.length, "permissions=", a.permissions?.length ?? 0);
    console.log(a.detail.slice(0, 320).replace(/\n/g, " | "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
