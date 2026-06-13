## ADR-001: PRNG Threading for `botChooseCommand`

### Context
`botChooseCommand(state, seat, profile)` currently calls `Math.random()` directly at ~8 call sites inside `bot.ts`. Deterministic replay requires that the same seed produces the same sequence of draws in the same call order. The function lives in the engine package (pure reducer pattern) and is called from both the server room runner and the web game store.

### Decision: How to supply randomness to `botChooseCommand`

| Option | Summary | Key cost |
|--------|---------|----------|
| A — draw function parameter | Pass `draw: () => number` as a 4th argument | Every call site must supply a draw function |
| B — per-seat PRNG Map in caller | Caller holds a `Map<Seat, PRNG>` and advances it externally | PRNG state is mutable and invisible to the function |

**Option A — draw function parameter**
`botChooseCommand(state, seat, profile, draw = Math.random)` replaces every internal `Math.random()` call with `draw()`. The function remains a pure, side-effect-free transformer: given the same inputs it produces the same output. Tests pass a seeded PRNG or a scripted sequence with no mocking infrastructure. The default parameter keeps the two existing call sites (server `room.ts`, web `gameStore.ts`) untouched for now and lets them migrate to seeded draw functions independently.

**Option B — per-seat PRNG Map in caller**
The caller constructs a `Map<Seat, PRNG>`, advances it on each call, and the function continues to call `Math.random()` internally (or the caller patches global state). Replay correctness now depends on callers maintaining the Map in exactly the right call order and never letting it drift. The existing 1309-line test suite keeps compiling without changes, but gaining determinism in tests requires either patching `Math.random` globally (fragile) or restructuring the tests anyway.

### Recommendation: Option A — draw function parameter

The pure reducer pattern that already governs `applyEvent` is the right model here: randomness is just another input, so it belongs in the signature. The default-parameter escape hatch means zero call-site churn today, and deterministic tests require only a one-liner seeded PRNG passed in — no global patching, no hidden Map to keep synchronized. Option B would be wrong if replay ever needs to reconstruct bot decisions from a recorded seed, because the PRNG advance sequence would have to be re-derived externally rather than being implicit in the function's own execution path.

### Consequences
- `botChooseCommand` gains a 4th parameter with a `Math.random` default; no existing call site breaks
- Tests that need determinism pass a seeded draw function directly — no `vi.spyOn(Math, 'random')` needed
- Callers that want replay correctness (server harness, future simulation runner) construct a seeded PRNG and pass `() => prng.next()` at each call
- The engine package stays dependency-free: it defines `type DrawFn = () => number`, not a concrete PRNG class
- A future simulation harness must thread the same `DrawFn` instance across the full game loop to guarantee order; this is visible in the type rather than hidden in a Map
