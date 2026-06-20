# Token Tracking & Log Reference

## Log levels

| Level      | Source               | Destination    |
|------------|----------------------|----------------|
| `[INFO]`   | orchestrator, agents | console + file |
| `[WARN]`   | quota waits, retries | console + file |
| `[ERROR]`  | failures             | console + file |
| `[TOOL]`   | MCP/file tool calls  | console + file |
| `[TOKENS]` | per-turn usage       | **file only**  |

Agent tag format: `[I-3]` = investigator-3, `[P-1]` = planner, `[R-1]` = reporter, `[T-1]` = tech-reviewer.

## TOKENS line format

### Per-turn line

```
[TOKENS][I-1] turn 2 | ctx: 18456 (+3222) | out: 312 | cache: 15000r 3456w
```

| Field           | Meaning                                                                                                |
|-----------------|--------------------------------------------------------------------------------------------------------|
| `turn N`        | Nth API call in this agent session                                                                     |
| `ctx: 18456`    | Total prompt size for this turn = `input_tokens + cache_read + cache_creation`                         |
| `(initial)`     | First turn — this is the baseline context (system prompt + user message + injected docs)               |
| `(+3222)`       | Context growth since previous turn (tool results flowing back into prompt)                             |
| `out: 312`      | Tokens the model generated on this turn (reasoning + tool calls + text)                                |
| `cache: 15000r` | Tokens read from Anthropic's prompt cache (cheap: 10% of input price)                                  |
| `cache: 3456w`  | Tokens written to cache on this turn (expensive: 125% of input price, but amortized over future reads) |

### Total line (end of agent session)

```
[TOKENS][I-1] total | in: 45000 | out: 12000 | cache: 35000r 10000w | peak_ctx: 42000
```

| Field       | Meaning                                                              |
|-------------|----------------------------------------------------------------------|
| `in`        | Sum of `input_tokens` across all turns (uncached input — full price) |
| `out`       | Sum of `output_tokens` across all turns                              |
| `cache: Xr` | Sum of `cache_read_input_tokens`                                     |
| `cache: Xw` | Sum of `cache_creation_input_tokens`                                 |
| `peak_ctx`  | Largest single-turn context size reached                             |

### Step summary line

```
[INFO] theme-01-framework-agreement-abuse — 9m39s, 43 turns, 234.0k in, 12.0k out
```

`in` here = `inputTokens + cacheReadTokens + cacheCreationTokens` (total context processed, all billing categories).

### Final summary table

```
   ✅ planner                              8m47s   39 turns  234.0k in  12.0k out
   ...
   ─────────────────────────────────────────────
   Tokens total: 1.2M in (800.0k cached), 95.0k out
```

`cached` = cache reads only. The gap between total `in` and `cached` is what you paid full price for.

## Cost model

Anthropic bills per-token, with different rates per category:

| Category                  | Rate multiplier       | What drives it                                                          |
|---------------------------|-----------------------|-------------------------------------------------------------------------|
| `input_tokens` (uncached) | 1×                    | Context that missed the cache — system prompt changes, new tool results |
| `cache_read`              | 0.1×                  | Cached prefix hit — system prompt, theme docs if stable                 |
| `cache_creation`          | 1.25×                 | First time a prompt prefix is cached — pays off if reused within 5 min  |
| `output_tokens`           | 1× (higher base rate) | Model generation — reasoning, tool calls, written text                  |

**Key insight**: `ctx` on turn 1 is almost entirely `cache_creation` (first call) or `cache_read` (if another agent
recently ran with similar prefix). After turn 1, the `(+N)` growth is predominantly uncached `input_tokens` — tool
results are unique per session and never cache-hit.

## Diagnosing problems

### Runaway context growth

**Symptom**: `(+N)` values growing large each turn (10k+ per turn).

```
[TOKENS][I-3] turn 5  | ctx: 45000 (+12340) | ...
[TOKENS][I-3] turn 6  | ctx: 58200 (+13200) | ...
[TOKENS][I-3] turn 7  | ctx: 72100 (+13900) | ...
```

**Causes**:

- `execute_query` returning large result sets — add `LIMIT`, narrow `SELECT` columns
- `get_failas_tekstas` pulling full documents — use `puslapis`/`kiekis` params to limit pages
- `Read` on large files — agent re-reading dossier or prior findings unnecessarily
- Agent generating long reasoning chains (high `out` values compound because output becomes input on next turn)

**Fix**: Check which `[TOOL]` line immediately follows the growth spike. That tool's response is what inflated the
context.

### Cache misses (high uncached input)

**Symptom**: `cache: 0r` on turn 1, or low `r` relative to `ctx`.

```
[TOKENS][I-1] turn 1 | ctx: 25000 (initial) | out: 800 | cache: 0r 25000w
```

This is normal for the first agent in a session. Subsequent agents should cache-hit on the shared system prompt prefix:

```
[TOKENS][I-2] turn 1 | ctx: 25000 (initial) | out: 600 | cache: 20000r 5000w
```

If agent-2 also shows `0r`, the gap between agents exceeded the 5-minute cache TTL — likely a quota wait or a slow prior
agent.

### Hollow sessions (quota exhaustion)

**Symptom**: No `[TOKENS]` lines at all, followed by:

```
[WARN][I-3] quota exhausted (attempt 1/30): session had only 1 turn
```

The agent was killed before producing any useful output. The probe/wait loop burns tokens too — each `probeQuota` call
sends a minimal prompt but still costs ~100 tokens.

### Context leak between agents

Agents run with `--no-session-persistence` — no context carries over between agent sessions. If you see turn-1 `ctx`
values growing across sequential agents:

```
[TOKENS][I-1] turn 1 | ctx: 15000 (initial)    # theme-01
[TOKENS][I-2] turn 1 | ctx: 22000 (initial)    # theme-02
[TOKENS][I-3] turn 1 | ctx: 31000 (initial)    # theme-03
```

This is not a leak — it's `priorFindings` injection. Each investigator receives all prior theme outputs in its user
message. This is by design but grows linearly. Monitor if it approaches the context window limit (~180k tokens for
sonnet).

### Disproportionate output tokens

**Symptom**: `out` values >> 2000 per turn.

The model is generating excessive reasoning or overly verbose tool call arguments. Typical healthy values:

- MCP query turns: 200–800 out
- File write turns: 1000–3000 out
- Final summary turns: 500–1500 out

Values above 5000 suggest the prompt is not constraining output well enough or the model is chain-of-thought looping.

## Quick health checks

```bash
# Show all TOKENS lines for a case
grep '\[TOKENS\]' investigations/<case-id>/investigation.log

# Show only totals per agent
grep '\[TOKENS\].*total' investigations/<case-id>/investigation.log

# Find the biggest context growth spikes
grep '\[TOKENS\]' investigations/<case-id>/investigation.log | grep -oP '\+\d+' | sort -n | tail -10

# Show tool calls that caused the biggest growth (pair TOKENS + next TOOL)
grep -E '\[TOKENS\]|\[TOOL\]' investigations/<case-id>/investigation.log | grep -B1 '\[TOOL\]'

# Total output tokens across all agents
grep '\[TOKENS\].*total' investigations/<case-id>/investigation.log | grep -oP 'out: \d+' | grep -oP '\d+' | paste -sd+ | bc
```
