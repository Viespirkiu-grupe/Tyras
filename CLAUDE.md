## MCP tool rules (enforced across all agents)

- **Discovery**: use `search_sutartys`, `search_juridiniai`, `search_failai`, `search_viesieji_pirkimai`
- **Aggregations and scale confirmation**: use `execute_query` with views (`v_sutartys`, `v_company`, `v_pirkimas`,
  `v_person_links`, `v_bylos`)
- **QUANTITATIVE CLAIMS RULE**: any count, total, or ratio must be backed by an `execute_query` result — `search_*`
  tools return at most 50 rows with `total: null` and cannot confirm scale
- **Bidders and bid prices are not queryable** — read them per procurement from the ATN-1 XLSX:
  `get_viesasis_pirkimas(pirkimoId)` → ATN-1 file (filename `PPA-`/`ATN-`/`Atn-1`) →
  `get_failas_tekstas(<fileId>, puslapis=4, kiekis=4)` (p.4 bidders+codes, p.7 ranked bids+prices). Only new CVP IS
  procurements (~2022→today) have these; old CVPP procurements have none. See **Participant & bid data** in
  `docs/index/mcp-investigator-prompt.md`
- `EXISTS` / correlated subqueries are blocked by the query engine — rewrite as JOIN + `GROUP BY`/`DISTINCT`
- Call `get_schema` to confirm column names before writing SQL

## Person investigation sequence (mandatory, in order)

1. `get_pinreg_asmuo("Vardas Pavardė")`
2. `search_sutartys(search="Pavardė")` — surfaces self-dealing contracts in metadata; filter by first name
3. `search_failai(search="Vardas Pavardė")`
4. `search_sutartys(tiekejoKodas=...)` for each linked company
5. `execute_query` on `v_sutartys` to confirm totals — mandatory if step 4 returned results

## tech-report.md

Each agent appends a section to `investigations/<case-id>/tech-report.md` describing what failed or was missing when
using MCP tools. The file may already contain entries from prior agents — **append only, never overwrite**. This is the
feedback loop for identifying data gaps and tool deficiencies — do not skip it.

## Theme library

28 fraud detection themes in `docs/themes/`. Index and MCP tool reference: `docs/index/mcp-investigator-prompt.md`.

## Formatting

Prettier formats all `.md` files (print width 120, prose wrap always). Run `npm run format` before committing.
