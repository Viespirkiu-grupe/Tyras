## MCP tool rules (enforced across all agents)

### Tool selection

| Goal                                                            | Tool                                |
| --------------------------------------------------------------- | ----------------------------------- |
| Find contracts by party, CPV, value, date                       | `search_sutartys`                   |
| Find persons in contract metadata (signatories, counterparties) | `search_sutartys(search="Pavardė")` |
| Find companies by name or code                                  | `search_juridiniai`                 |
| Find persons, emails, phones, IBANs in uploaded documents       | `search_failai`                     |
| Find procurement notices                                        | `search_viesieji_pirkimai`          |
| Aggregate totals, counts, ratios, joins                         | `execute_query`                     |
| Get company registry details by JAR code                        | `get_juridinis(jarKodas)`           |
| Get PINREG declarations for an individual                       | `get_pinreg_asmuo(vardas)`          |

### Rules

- **QUANTITATIVE CLAIMS RULE**: any count, total, or ratio must be backed by an `execute_query` result — `search_*`
  tools return at most 50 rows with `total: null` and cannot confirm scale
- **Prefer views over raw tables** inside `execute_query`:
  - `v_company` — company + Sodra data + compliance flags
  - `v_sutartys` — contracts with resolved buyer/supplier names
  - `v_pirkimas` — procurement notices (CVP IS + CVPP); filter `WHERE "saltinis" = 'cvpis'` for procedure-type analysis
  - `v_person_links` — PINREG links to companies
  - `v_bylos` — court/admin cases linked to companies
  - `v_dalyviai` — ATN-1 bid participant data: bidder codes, prices, ranks (CVP IS only, ~400 procurements)
- **Bidders and bid prices**: check `v_dalyviai` first for parsed ATN-1 data. If not there, use per-procurement route:
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
