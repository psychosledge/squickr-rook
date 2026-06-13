# analyze-game

Analyze a specific trick or bidding step from a bot game replay and evaluate the play critically.

## House Rules (always authoritative)

**Scoring:**
- ROOK card: 20 points
- 1 of any color: 15 points
- 10 of any color: 10 points
- 14 of any color: 10 points
- 5 of any color: 5 points
- All other cards (6–9, 11–13): 0 points
- Total per hand: 180 points (160 from cards + 20 ROOK)
- Nest bonus: discarded cards' point values are awarded to the team that wins the last trick
- Most-cards bonus: team with more captured tricks gets a bonus (check `packages/engine/src/scoring.ts` for exact value)
- Last trick bonus: separate from most-cards (verify in `scoring.ts`)

**Bidding:**
- Minimum bid: 100, Maximum: 200, Increment: 5
- Bidder wins the bid, picks up the 5-card nest, discards 5, picks trump
- To make the bid: bidding team must score ≥ bid amount (trick points + nest bonus + bonuses)
- Going set: bidding team scores 0 if they miss; the set penalty equals the bid amount subtracted from their total score
- Bust threshold: -500 points ends the game immediately

**Trump:**
- ROOK is always the highest trump (beats 1 of trump)
- 1 of trump is second highest
- Then 14, 13, 12, 11, 10, 9, 8, 7, 6, 5 of trump
- Off-suit: 1 is highest, then 14, 13, 12, 11, 10, 9, 8, 7, 6, 5

**Card play:**
- Must follow suit if able; otherwise may play any card including trump
- Trick winner leads next trick
- A player void in a suit (failed to follow it in a previous trick) is known void to observers

**Bot configuration (Expert level — all simulation games):**
- `trackPlayedCards: true` — bot knows every card played so far
- `playAccuracy: 1.0` — bot plays optimally within its implemented logic (gaps are logic gaps, not noise)
- `trumpManagement: 1.0`, `sluffStrategy: true`, `roleAwareness: true`, `endgameCardAwareness: 1.0`

## How to Run

The human will provide context in this format (from the "Copy context" button in /replay):

```
Game: game-XXXX | Trick: N | Perspective: SEAT | feedback: [their observation]
```

Or for the bidding step:
```
Game: game-XXXX | Step: Bidding | Perspective: SEAT | feedback: [their observation]
```

**Step 1 — Load the game data**

Read `packages/engine/scripts/output/simulation-results.ndjson`. Find the line where `gameId` matches. Parse it as JSON. Extract:
- `outcome`: bidder, bidAmount, nestCards, discarded, final scores
- `transcript`: array of TrickSnapshot objects (0-indexed, so trick N = transcript[N-1])
- `bidHistory`: chronological auction sequence

**Step 2 — Reconstruct what the bot knew**

At the decision point (start of the trick), the perspective bot knew:
- Its own hand: `transcript[trickIndex].handsAtTrickStart[seat]`
- All cards played in previous tricks (tricks 0 through trickIndex-1)
- Inferred voids: if a player did not follow suit in a previous trick, they are void in that suit
- Running score: `transcript[trickIndex-1].cumulativeScore` (or 0/0 at trick 1)
- Points remaining: sum of `pointsInTrick` for tricks after current + nest bonus from discards

**Step 3 — Enumerate candidate plays**

List the 2–4 most meaningful alternative plays at that decision point (not every card). For each:
- What happens if this card leads/follows (best case, worst case given unknown opponent hands)
- Points at risk vs points gained
- Strategic value (void-forcing, trump preservation, setting up partner, protecting a point card)

**Step 4 — Critically evaluate the human's feedback**

**Do not simply agree.** Explicitly test the human's reasoning:
- Is the suggested alternative strictly better, or does it depend on assumptions about cards the bot couldn't see?
- Does the alternative have risks the human may not have considered?
- Is the human's framing correct (e.g. are they right about which cards are point cards)?
- Consider the score context: with N pts remaining and the bidding team needing X more, does the strategic calculus change?

If the human's suggestion is wrong or only conditionally right, say so clearly with the reasoning.

**Step 5 — State a verdict**

One of:
- **Bot gap confirmed**: the human's feedback identifies a real logic gap; describe it precisely
- **Human reasoning partially correct**: explain what's right and what's wrong
- **Human reasoning incorrect**: explain why the bot's play was actually sound
- **Ambiguous**: explain what information would be needed to decide

**Step 6 — If a bot gap is confirmed, output a slice entry**

Format:

```markdown
### Slice N: [short name]
**Scope:** [one sentence on what changes in bot.ts and where]
**Status:** not started
**Commit:** —
**Evidence:** [game-XXXX, trick N, seat perspective — what the bot did vs what it should have done]
**Acceptance Criteria:**
- [ ] [specific, testable criterion]
- [ ] `pnpm --filter engine test` passes with no regressions
**Needs Architect:** [yes/no — reason]
```

Ask the human whether to append it to `docs/stories/bot-engine-improvements/plan.md`.
