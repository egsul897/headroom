# Phase 3 Chewy Remediation 1 — F-1 compiler caller tool-protocol defect

Defect: `RealSemanticCaller.compile` answered a provisional `submit_compilation` tool_use with a plain-text
user nudge, violating the provider rule that every tool_use followed by another turn must first receive its
tool_result. The provider rejected the next turn (HTTP 400) and the caller discarded the already-parsed
submission as PROVIDER_FAILURE (Chewy Section 1.01, 60,318 output tokens lost).

Fix (generic): every continuation after an assistant turn with tool_use blocks is built by one helper that
emits exactly one tool_result per tool_use; the retrieval nudge is the tool_result of the provisional submit
call; a provisional submission is held and returned with its own sufficiency if the continuation ends
without a new submission (transport failure, turn ceiling, corrective-reminder exhaustion); a pure validator
(`tool-protocol.ts`) checks every outgoing sequence before send and drives the test harness.

Files: `01-before-reproduction.json`, `02-after-reproduction.json`, `03-caller-state-machine-trace.json`,
`04-invariant-and-fix.json`, `05-test-and-regression-results.json`. Zero paid calls.
