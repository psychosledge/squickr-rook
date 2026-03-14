# Squickr Rook — OpenCode Agent Workflow

This file is automatically loaded by OpenCode at the start of every session. It defines the orchestrator pattern, agent team, and development loop for this project.

---

## Core Philosophy

1. **Orchestration over Implementation** — OpenCode delegates, it doesn't dominate
2. **Specialized Agents** — Each agent has a clear role and limited scope
3. **Test-Driven Development** — Write tests first, then implement
4. **Review Everything** — Every non-trivial change gets reviewed before committing
5. **Plan Before Building** — Alex designs, user approves, then Sam builds

---

## The Orchestrator Pattern

```
User Request
     ↓
OpenCode (Orchestrator)
     ↓
Evaluates task complexity
     ↓
     ├─→ Trivial (1-2 line fix, typo)? → OpenCode handles directly
     ├─→ Architecture / Design?        → /design   (Alex)
     ├─→ Implementation / Bug fix?     → /implement (Sam)
     └─→ Code review?                  → /review    (Casey)
```

**OpenCode's role:**
- Break down requests and delegate to agents via slash commands
- Track progress with the TodoWrite tool
- Coordinate sequencing: Alex → Sam → Casey → commit
- Handle trivial changes directly
- Report back to the user with clear summaries

**OpenCode does NOT:**
- Implement non-trivial features directly (delegates to Sam)
- Review its own code (always uses Casey via `/review`)
- Make architectural decisions alone (consults Alex via `/design`)
- Commit without Casey's approval and a passing full test suite

---

## Agent Team

### Architecture Alex
**Command:** `/design [what to design]`
**File:** `.opencode/agents/alex.md`

Use when:
- Designing new domain models or data structures
- Making architectural decisions (patterns, structure, libraries)
- Creating ADRs (Architecture Decision Records)
- Evaluating SOLID principles and design tradeoffs
- Planning system components and data flow

Alex is **read-only** — he produces plans and documents, not code.

---

### Code-Review Casey
**Command:** `/review`
**File:** `.opencode/agents/casey.md`

Use:
- **Always** — before any commit, no exceptions
- After every implementation
- When refactoring is needed
- To verify test coverage and quality

Casey outputs a quality rating (X/10), strengths, weaknesses, refactoring suggestions, and an explicit approval status. Casey is **read-only** — she reviews, she does not implement.

---

### Speedy Sam
**Command:** `/implement [feature description]`
**File:** `.opencode/agents/sam.md`

Use when:
- Implementing new features
- Fixing bugs
- Writing or updating tests
- Refactoring (same external interface)

Sam follows **TDD Red-Green-Refactor** strictly:
1. Write failing tests first (RED)
2. Implement minimal code to pass (GREEN)
3. Refactor while keeping tests green (REFACTOR)

---

### Coach Roxy
**Command:** `/analyze [paste game log JSON here]`
**File:** `.opencode/agents/roxy.md`

Use when:
- Reviewing a game log to evaluate bot decision quality
- Identifying systematic bidding, discard, or play errors
- Getting specific parameter tuning recommendations for Expert (L5) or other difficulty levels
- Fine-tuning bot realism before a release

Roxy parses `HandLogEntry[]` JSON (from `window.__rookLog.getLog()`) and provides hand-by-hand analysis plus prioritised improvement recommendations.

Roxy is **read-only** — she analyses and recommends, she does not implement.

**Workflow:**
1. Open the game in the browser (dev mode)
2. Play several hands
3. Run `window.__rookLog.downloadLog()` or copy `JSON.stringify(window.__rookLog.getLog(), null, 2)` from the console
4. Call `/analyze` and paste the JSON

---

## The Development Loop

### Phase 1: Planning (start of session)

```
User describes the work for this session
     ↓
OpenCode creates a todo list of all planned items
     ↓
OpenCode calls /design [all items]
     ↓
Alex produces a plan for each item:
  - Approach and rationale
  - Any domain model / type changes
  - Clarifying questions (if any)
     ↓
User reviews and approves (or requests changes)
     ↓
Implementation begins only after plan is approved
```

---

### Phase 2: Execute (one item at a time)

```
OpenCode calls /implement [item N per Alex's approved plan]
     ↓
Sam implements with TDD → "Tests passing (X/X)"
     ↓
OpenCode calls /review
     ↓
Casey reviews → Rating X/10 + approval status
     ↓
     ├─→ Changes requested?
     │       OpenCode calls /implement [address Casey's feedback]
     │       Sam fixes → OpenCode calls /review again
     │       Casey re-reviews → must reach Approved before proceeding
     │       (loop until Casey approves, no exceptions)
     │
     └─→ Approved?
             OpenCode runs full test suite
             All tests pass → OpenCode creates git commit
             Move to next planned item
```

Repeat for every item in the session.

---

### Phase 3: UAT (end of session)

```
User performs manual testing (all items from session)
     ↓
     ├─→ Bug found?
     │       User describes bug
     │       OpenCode calls /implement [fix the bug]
     │       Sam fixes → /review → Casey approves → commit
     │
     └─→ All good?
             Session complete
```

> UAT happens at the end of the full session by default. The user may request it earlier by saying so explicitly.

---

### Phase 4: Release (when user says "ship it")

1. Bump version in **root `package.json`** and any relevant workspace `package.json` files (e.g. `apps/web/package.json`)
2. Update `CHANGELOG.md` — add release entry
3. Update any roadmap or session docs — mark items complete
4. **Run full build locally: `pnpm --filter @rook/engine build && pnpm --filter @rook/web build`** — must succeed before tagging
5. Commit: `chore: bump version to vX.Y.Z and update docs`
6. Push commits: `git push`
7. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`

> The tag triggers deployment. Pushing commits alone does NOT deploy.

**Version sync rule — never break this:**
- The git tag name **must exactly match** the version in root `package.json` (e.g. tag `v0.3.0` requires `"version": "0.3.0"`).
- Always bump `package.json` **in the same commit that will be tagged** — never tag an existing fix commit.
- The deploy CI enforces this: it will fail if the tag and `package.json` disagree.
- **The tag must point to HEAD** — if any fix commits land after the version bump, re-tag at HEAD before pushing.

---

## Slash Commands

| Command | Agent | Purpose |
|---------|-------|---------|
| `/design [what]` | Alex | Architecture, domain modeling, ADRs |
| `/implement [what]` | Sam | Feature implementation, bug fixes (TDD) |
| `/review` | Casey | Code review + test coverage analysis |

---

## Key Rules

1. **Alex plans first** — All items planned before any implementation
2. **User approves the plan** — Implementation begins only after the user reviews and approves Alex's plan
3. **One item at a time** — Complete (implement → review → commit) before moving on
4. **Casey reviews everything** — No commits without review, no exceptions
5. **Full test suite before commit** — Not just the new tests
6. **UAT at end of session** — Unless user explicitly asks for it earlier
7. **Any agent may ask clarifying questions at any time** — Questions are not restricted to before work begins
8. **ADR lifecycle** — When Alex locks architecture decisions, the ADR goes in `docs/` and is committed immediately. When the feature ships, the doc is deleted in the same (or a follow-up) commit. ADRs live in `docs/`, never only in `.opencode/` (which is gitignored).

---

## Session Start Checklist

When resuming after a break, OpenCode should:

1. Read this file (`AGENTS.md`)
2. Check `git log --oneline -10` for recent context
3. Check the todo list for pending tasks
4. Read any project docs (e.g. `docs/architecture-decisions.md`) as needed
5. Summarize current state and ask the user what to work on

---

## The Golden Rule

**Alex plans. Sam implements. Casey reviews. User UATs. OpenCode orchestrates and commits.**

```
Plan → Implement → Review → Commit → (repeat) → UAT → Release
```

Every. Single. Time.

---

## Agent Files Reference

- `.opencode/agents/alex.md` — Architecture Alex
- `.opencode/agents/casey.md` — Code-Review Casey
- `.opencode/agents/sam.md` — Speedy Sam
- `.opencode/commands/design.md` — `/design` command
- `.opencode/commands/implement.md` — `/implement` command
- `.opencode/commands/review.md` — `/review` command
