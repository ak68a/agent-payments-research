# ACK Research

RFC drafts and proposals for the Agent Commerce Kit ecosystem. Each subdirectory is a self-contained proposal.

## Contribution pattern

All contributions to the upstream ACK repo follow: **Issue → PR → Merge**. The maintainer (Matt Venables, `venables`) guards scope tightly and reviews design before implementation.

- Open an issue to plant the idea and gauge interest before writing a full PR
- Proposals live here as working drafts until the upstream dependency lands
- PRs to the ACK repo carry RFC-level docs under `docs/`, not just code
- Disclose AI usage in every PR and issue body per ACK's AI_POLICY.md

## Matt-style review

Before submitting anything to the ACK repo, run a self-review with these criteria (derived from the maintainer's observed review patterns):

1. **Scope** — Is this the right time? Does it depend on things that haven't shipped? Would Matt say "this is premature" or "out of scope"?
2. **Mechanical verifiability** — Can every claim be checked without human judgment or external callbacks? If not, say so explicitly.
3. **Cost statements** — Every design choice with a downside needs "The cost, stated openly: ..." — don't hide tradeoffs.
4. **No unused abstractions** — "We only add abstractions once something needs them." Don't build for hypothetical future requirements.
5. **Consistency with v2 RFC** — Use the same terminology, conventions (RFC 2119 keywords, claim tables with requiredness columns, numbered verification checklists), and extension pattern (core + ext-*).
6. **Internal consistency** — Section numbering, cross-references, and claim table entries must all agree. Stale references are bugs.
7. **Working examples** — Include a running code example using `jose` (not the ACK SDK) to prove implementability with stock libraries.

## Proposal structure

Each proposal directory should contain:
- `README.md` — motivation, design guidelines, settled decisions, open questions
- `ext-*.md` — the spec document (RFC 2119, claim tables, verification checklist)
- `example.ts` — working code example runnable with `npx tsx`
- `*.svg` — diagrams (concept diagram + technical trail)
