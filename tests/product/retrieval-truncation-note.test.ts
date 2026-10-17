/**
 * Rule 37 — Ask must disclose when retrieval hit its document cap.
 *
 * answerFromCorpus fetched at most 120 knowledgeSource rows
 * (most recently filed) with no marker. A workspace — or the
 * public research corpus — with more documents silently had its
 * older documents excluded from Ask retrieval: the answer could
 * omit provisions from older documents without any signal. The
 * fetch now also counts the total; when the cap truncated rows,
 * the answer carries an explicit limitation + detail note.
 */
import { describe, expect, it } from "vitest";
import { retrievalTruncationNote } from "../../lib/product/covenant-intelligence/retrieval-truncation-note";

describe("retrievalTruncationNote", () => {
  it("returns null when nothing was truncated", () => {
    expect(retrievalTruncationNote({ totalCount: 120, searchedCount: 120 })).toBeNull();
    expect(retrievalTruncationNote({ totalCount: 40, searchedCount: 40 })).toBeNull();
  });

  it("discloses the omitted older-document count", () => {
    const note = retrievalTruncationNote({ totalCount: 189, searchedCount: 120 });
    expect(note).toMatch(/120/);
    expect(note).toMatch(/69/);
    expect(note).toMatch(/older document/i);
    expect(note).toMatch(/may be omitted/i);
  });
});
