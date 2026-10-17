import { presentMorningBrief, type MorningBriefModel } from "@/lib/ux/present";

/** Three short lines under the headline. Copy comes only from the model. */
export function MorningBrief({ model }: { model: MorningBriefModel }) {
  const lines = presentMorningBrief(model);
  return (
    <section className="brief" aria-label="Morning brief">
      {lines.map((line) => (
        <div key={line.label}>
          <h2>{line.label}</h2>
          {line.href && line.text !== "Needs input" ? (
            <a href={line.href}>{line.text}</a>
          ) : (
            <p>{line.text}</p>
          )}
        </div>
      ))}
    </section>
  );
}
