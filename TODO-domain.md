# TODO-domain — Improving Fraud Detection with the viespirkiai MCP

> Domain review of the procurement-fraud detection logic — the 27 themes, the MCP index, and the data actually exposed
> by the `viespirkiai-local` MCP. Unlike `TODO.md` (system architecture), this file is about **detection quality**:
> which fraud signals the data can support, which the themes miss, and where the docs misdescribe the data.
> **Prioritised, not estimated.** Each item: _what_, _why_ (grounded in a live query where possible), _where_ (theme /
> table / column).

## Method — what I verified against the live database

Queried the live MCP (`localhost:9019`) directly while writing this. Open items below are grounded in these confirmed
facts:

- **View column drift breaks queries.** `SELECT "draustieji" FROM v_company` → `column "draustieji" does not exist`
  (real column is `darbuotojai`). `v_company`, `v_pirkimas`, and `v_bylos` were all documented with wrong column names
  in the MCP index (fixed in the index; **P2.2** automates prevention of recurrence).
- **`v_dalyviai` (competition data) coverage:** 7,201 rows, **403 procurements, 38 buyers** — one buyer (JAR 135163499,
  Kauno klinikos) is **62%** of it. Grounds **P0.2** and theme 28.
- **Single-bidding is computable and high:** of the covered procurements, **~26% had a single bidder** (102/397) — the
  single strongest empirical corruption proxy in the literature. **Now implemented as a first-class indicator in
  [theme 28](docs/themes/28-single-bidding-competition-intensity.md)** (per buyer / CPV / supplier), cross-referenced
  from themes 2 and 20.
- **`v_dalyviai.eileNumeris` is 100% NULL** (raw `atn1pasiulymuEile` and the view) — bid rank / winner is **not
  recoverable**, so any query filtering `eileNumeris = 1` returns nothing (silently breaks theme 2's win-rate SQL and
  theme 17 winner logic). Single-bidding sidesteps it (sole bidder = winner). Documented in the MCP-specific section.
- **`get_schema` exposes join safety** (`strict` / `semantic` / `sparse`) that the themes ignore — e.g.
  `v_dalyviai.tiekejoKodas → v_company` is `sparse`, and `pirkimoNumeris` joins are `semantic`. Naive INNER JOINs on
  these silently drop rows and turn "data exists" into a false "no data." Grounds **P2.1**.

---

## P0 — Data the system already has but does not use (highest detection upside)

### P0.1 Exploit the richer real columns the themes ignore

- **What:** Use the verified columns now in the index: `faktineIvykdimoVerte`/`faktineIvykdimoData` (cost overruns,
  themes 8/18/22), `v_sutartys` consortia arrays `tiekejaiKodai[]` / `papildomiTiekejai[]` (joint bids / subcontracting,
  themes 1/2/16), `v_dalyviai.salis` (cross-border bidder, themes 11/24), `v_person_links.susijusioAsmensVardas`
  /`Pavarde` + `dalyvaujaViesuosePirkimuose` (family-link conflict of interest, theme 4),
  `v_pirkimas.pasiulymuPateikimoTerminas` vs `paskelbimoData` (short advertisement period — a standard CRI red flag, no
  theme computes it).
- **Why:** These are already in the data; the themes leave authoritative signals on the table while reconstructing
  weaker proxies by hand.
- **Where:** targeted edits to themes 1, 2, 4, 8, 11, 16, 18, 22, 24; add an "advertisement-period" check to theme 7/20.

### P0.2 State the ATN1 competition-data ceiling prominently per theme

- **What:** Themes that depend on bid-level data (2 cover bidding, 3 bid rotation, 17 price cartel, and the competition
  parts of 14) should open with the coverage reality: ~400 reports / 38 buyers / 62% one buyer — so for most entities
  these analyses return **no data, not no fraud**, and the agent must pivot to non-ATN1 signals.
- **Why:** Without this, an empty `v_dalyviai` result reads as "no cartel found." Empirically, outside Kauno klinikos
  these themes are mostly inoperative. This is a correctness/anti-false-negative issue, not just a caveat.
- **Where:** themes 2, 3, 14, 17 headers; reinforce the existing coverage note.

---

## P1 — Detection methodology (turn LLM judgement into reproducible indicators)

### P1.1 Standardised red-flag indicator set with thresholds (a Tyras CRI)

- **What:** A computed indicator library with explicit thresholds — single-bidding (**already built as theme 28 with
  verified SQL; fold its per-buyer/CPV/supplier queries in as the first indicator**), **bid Coefficient of Variation**
  (theme 17 already uses this per-tender — generalise it), **HHI** market concentration per CPV/buyer, advertisement-
  period length, direct-award/negotiated-procedure share (`v_pirkimas.pirkimoBudas`), repeat buyer–supplier
  concentration, new-company-fast-win (theme 1), and overrun ratio (theme 8) — modelled on the published Corruption Risk
  Index (Fazekas et al. / Opentender).
- **Why:** Most themes ask the LLM to decide whether something is "suspicious"/"anomalous" with no baseline. Computed
  indicators with thresholds make findings reproducible, comparable across cases, and defensible in a referral.
- **Where:** new `docs/themes/00-indicator-framework.md` + parameterised SQL; referenced by all quantitative themes.

### P1.2 Composite risk score per entity/contract

- **What:** Combine the P1.1 indicators into a weighted score (count of independent flags × severity) producing a banded
  risk level, recorded per entity.
- **Why:** Replaces inconsistent per-theme "High/Medium/Low" gut calls with one comparable score; lets the reporter rank
  entities and lets a human triage. (Ties into `TODO.md` P2.2.)
- **Where:** scoring rubric in the indicator framework + reporter logic.

### P1.3 CPV-aware analysis using the `bvpzKodai` reference table

- **What:** Join the unused `bvpzKodai` table (9,454 CPV codes) to translate and group CPV codes instead of the bare
  `LEFT(code, 2/3)` heuristics, and to define sector-risk weightings (theme 27).
- **Why:** Current CPV grouping is opaque digit-slicing; named CPV groups make contract-splitting (5), diversification
  (25), and sector red-flags (27) interpretable and let "homogeneous need" judgements be grounded.
- **Where:** themes 5, 25, 27 + CPV helper.

### P1.4 Asset verification via `regitra` (vehicles) and registry capacity

- **What:** Use `regitra` (503k vehicle records) and registry/Sodra capacity to corroborate or contradict delivery
  capacity — e.g. a "construction"/"transport" supplier with large contracts but no registered vehicles or employees.
- **Why:** Strengthens shell-company (1) and fictitious-deliverables (22) findings with an independent operational
  footprint signal, reducing both false positives and false negatives.
- **Where:** themes 1, 22 (+ optional asset-mismatch indicator in P1.1).

### P1.5 Deeper SABIS payment-flow detection (builds on the now-implemented payment-flow block)

The P0 SABIS work wired invoices into themes 8/18/22/25 via the `sabisSutartys.vpId` bridge. Three higher-value SABIS
signals remain unused:

- **Entity-first SABIS attribution.** Investigations usually start from a JAR code, but the new theme SQL is
  contract-bridge-first. Add an entity-first path: all invoices where a company is supplier **or** payee, via
  `sabisSaskaituSalys.validusJarKodas` (no registry bridge needed) — surfaces money flow for suppliers whose contracts
  never reached the registry. Reuse in themes 1, 22, 25 and the person-investigation sequence.
- **Invoice-CPV vs contract-CPV mismatch.** `sabisSaskaitos.cpvKodas` is per-invoice. Compare it to the contract's
  `bvpzKodas`: systematically billing a different CPV than contracted is scope substitution / disguised purchasing
  (themes 8, 22, 27). No theme uses invoice-line CPV today.
- **Payment-timing / prepayment patterns.** `sfApmokejimoTerminas` (due date) vs `israsymoData` (issue date) and the
  share of `Išankstinė sąskaita` (advance) invoices per supplier — abnormally short terms, mass prepayment, or
  end-of-year invoice bunching are layering/favoritism signals (themes 22, 25, 26).
- **Where:** new shared "SABIS entity & timing" query snippets + edits to themes 1, 8, 22, 25, 26, 27.

---

## P2 — Query correctness & doc hygiene (prevent silent wrong answers)

### P2.1 Teach agents the join-type semantics from `get_schema`

- **What:** Document and enforce: `strict` joins are INNER-safe; `semantic` and `sparse` joins must use LEFT JOIN (or be
  acknowledged as lossy). List the risky links (`v_dalyviai.tiekejoKodas→v_company` = sparse; all `pirkimoNumeris` links
  = semantic).
- **Why:** Naive INNER JOINs on semantic/sparse links silently drop rows, producing undercounts and false "no data" —
  directly causing false negatives in a fraud context.
- **Where:** MCP index "Views" section + a note in the per-theme SQL conventions.

### P2.2 Regenerate the schema reference from the live DB and keep it in sync

- **What:** Generate the view/column reference (and a checked-in snapshot) directly from `get_schema` rather than
  maintaining it by hand; re-run on schema changes.
- **Why:** The drift fixed earlier (3 views, ~12 wrong column names) happened because the reference was hand-maintained.
  The server even returns a "column does not exist — call get_schema" hint, but that costs the agent turns and risks
  give-up/fabrication. (Ties into `TODO.md` P1.6.)
- **Where:** a small generator script + `docs/reference/schema-snapshot.md`.

### P2.3 Document `execute_query` ergonomics the index omits

- **What:** Note that `execute_query` requires a `purpose` argument of **≥5 characters** (queries fail validation
  otherwise), that results paginate at 50 rows, and that `search_sutartys`/`search_*` filtered by `tiekejoKodas` /
  `perkanciosiosOrganizacijosKodas` already return `sutarciuKiekis` + `bendraVerte` — so single-entity totals do **not**
  need a separate `execute_query`. See the query-engine constraints in the MCP-specific section below for the full list
  agents repeatedly hit.
- **Why:** Avoids avoidable validation failures and wasted aggregation calls; slightly relaxes the blanket "search\_\*
  can never confirm scale" framing for the common single-entity-total case.
- **Where:** MCP index tool-reference section.

### P2.4 Audit remaining theme SQL against the live schema

- **What:** Run each theme's example SQL (parameterised on a real entity) against the live DB and fix any column/table
  references that error or silently return nothing; verify referenced columns like `vdiPazeidimai.<datecol>` (theme 22
  leaves it as a TODO) and `nepatikimiTiekejai`/`melagingiTiekejai` start-date columns (theme 9 flags uncertainty).
- **Why:** Several themes contain self-flagged "verify column name via get_schema" comments — i.e. known-unverified SQL
  that may fail at investigation time. A one-pass smoke test removes that risk.
- **Status:** Index views, theme 1, and the SABIS queries in themes 8/18/22/25 are verified. The remaining themes should
  be swept the same way. Pairs naturally with P2.2.
- **Where:** all 27 theme files.

---

## Data limitation notes and Viešpirkiai MCP specific issues

Issues in the data or the MCP server itself — not in the Tyras agentic system. Some are inherent limitations to state in
reports; others are candidate feature requests / fixes for the MCP team.

### Inherent data limitations (state in reports; not fixable by us)

- **Competition/bid-level analysis is barely covered** (`v_dalyviai`: ~38 buyers). Themes 2, 3, 17, 28 are mostly
  inoperative outside a handful of buyers — treat absence as "no data," not "no fraud."
- **No notice-level "tenders received" count.** Bidder counts exist **only** in `v_dalyviai` (ATN1). `v_pirkimas`,
  `cvppViesiejiPirkimai`, and `sutartysAtviriDuomenys` record notices/awards but not how many bids each attracted — so
  single-bidding (theme 28) cannot be computed system-wide, only for the ~38 covered buyers. A notice-level bid-count
  field would let the strongest corruption proxy run across the whole market (candidate MCP feature request).
- **No unit-price data** — theme 8's "per-unit price vs national average" is not supported by the schema; only contract
  totals and `faktineIvykdimoVerte` exist. State this rather than implying unit-price benchmarking.
- **`faktineIvykdimoVerte` is ~12% populated** — overrun themes (8/18/22) must report coverage so a NULL isn't read as
  "no overrun."
- **No company→company ownership table** — UBO (11) remains one-hop person links plus OSINT, as the theme already notes.
- **PINREG name-based person matching** risks homonyms — surname joins in themes 4/13 can match different people; prefer
  PINREG identifiers and date filters (ties into `TODO.md` P3.4).

### SABIS data-quality issues (worth flagging upstream)

- **SABIS does not join directly to the procurement registry.** `sabisSaskaitos.sutartiesUid` (a 16-char token) does not
  match `v_sutartys.sutartiesUnikalusId` (0 rows) — analysis must bridge through `sabisSutartys.vpId`. A documented
  registry↔SABIS key (or a view) would remove a sharp footgun.
- **Only ~36% of the 14.4M invoices have an amount** (`bendraSfSuma`) and ~36% have `sutartiesUid` — so **absence of
  invoices is not evidence of non-payment**; coverage must be stated.
- **`bendraSfSuma` contains extreme unit/decimal errors** (a €7.2M contract showed €4.5B of invoices) — raw
  invoiced/contract ratios need plausibility bounds and per-invoice inspection; they are leads, not evidence.
- **`israsymoData` has out-of-range garbage** (years `0024`–`5025`) — every date query must be bounded.
- **`sabisSaskaituSalys.pavadinimas` is hashed** — parties must be attributed by `validusJarKodas` /
  `validusAsmensKodas` and resolved to names via `jarCsv` / `v_company`.

### Misleading / unreliable columns (don't use as red flags)

- **`v_dalyviai.interesuKonfliktasNustatytas`** is never `true` in current data (0/7,201, unpopulated) — do not read its
  absence as "no conflict."
- **`v_dalyviai.konkurencijaIskreipiantisAsmuo`** is `true` for ~48% of rows and is a boilerplate administrative
  declaration — **not** a fraud signal without separate validation.
- **`v_dalyviai.eileNumeris` is 100% NULL** (raw `atn1pasiulymuEile` and the view) — bid rank / winner-vs-loser is **not
  recoverable**. Any query filtering `eileNumeris = 1` returns nothing (silently breaks theme 2's win-rate screen and
  theme 17 winner logic). Until populated, only the bidder _count_ dimension (single vs. multi, theme 28) is usable; a
  populated rank column would unlock cover-bidding margin and winning-spread analysis.

### Query-engine constraints agents repeatedly hit (document in index per P2.3; some are upstream feature requests)

- `execute_query` rejects a `purpose` shorter than **5 characters**.
- **`EXISTS` / correlated subqueries are blocked** (function allow-list) — rewrite as JOIN + `GROUP BY`/`DISTINCT`.
- **`information_schema` and schema-qualified table references are blocked** — table discovery must go through
  `get_schema`, not SQL catalog queries.
- **Large multi-table joins occasionally fail** with a shared-memory error
  (`could not resize shared memory segment … No space left on device`) — keep joins lean, filter/aggregate early, and
  add `LIMIT`; retry usually succeeds. A larger `work_mem` / temp budget on the server would help the SABIS-scale joins.

## Next steps

Please update all related notes and investigation templates with this up-to-date knowledge:

v_dalyviai is hidden due to its limited coverage so it will not be available to MCP and LLM. Also, all tables with that
start with "atn1" ("atn1ataskaitos", "atn1dalyviai", "atn1pasiulymuEile", " atn1atmestiPasiulymai") are hidden as well,
because they're not fully populated and may cause confusion. Of cours, do not mention that v_dalyviai is deprecated
anywhere! Instead, you must rewrite those investigation guides. If additional route is needed, you can check your new
routes or hypotheses by using MCP.

As an alternative, it is possible to call `get_viesasis_pirkimas`. MCP description is updated as following:

UPDATE:

```text
Grąžina išsamią informaciją apie vieną viešąjį pirkimą pagal pirkimo ID. Apima turinį, failus (sieti tik pagal
versijos md5 arba versijos key "id"), vykdytojo duomenis. Gavus failo md5 arba numerinį id — naudok get_failas (ne
search_failai!). Sumos - eurais. Dalyviai ir pasiūlymų kainos (tik nauja CVP IS, t.y. kai pirkimas turi failus): rask
ATN-1 xlsx failą (pavadinimas prasideda "PPA-", "ATN-" arba "Atn-1") — tai Pirkimo procedūrų ataskaita. Tada
get_failas_tekstas(id, puslapis=4, kiekis=4) grąžins: p.4 = dalyviai su kodais, p.6 = atmesti pasiūlymai su kainomis,
p.7 = pasiūlymų eilė su kainomis, p.10 = sutarties sumos. Seni pirkimai (CVPP) šių failų neturi — dalyvių duomenys ten
nepasiekiami.;
```

Additional clarification from the MCP team:

| Source                          | Records | Date range              | Participant data |
|---------------------------------|---------|-------------------------|------------------|
| cvppViesiejiPirkimai (old CVPP) | 257,556 | 2017-07-04 → 2024-12-24 | None             |
| v_pirkimas (new CVP IS)         | 44,466  | 2022-09-24 → today      | ATN-1 xlsx files |

Old CVPP (2017–2024): The table exists and has basic metadata — procurement number, title, buyer, dates, links back to
cvpp.lt portal — but no participant or bid data. The actual participant data lived in CVPP portal reports (HTML/PDF on
cvpp.lt), which weren't scraped. So MCP can surface "this procurement existed with this buyer on this date" but nothing
about who bid or at what price.

New CVP IS (2022–present, overlap with CVPP until end of 2024): Full data via get_viesasis_pirkimas + ATN-1 xlsx files
for participants/prices.

The description in getViesasisPirkimas.js is accurate. The only thing worth noting: cvppViesiejiPirkimai isn't reachable
through get_viesasis_pirkimas (that tool queries viesiejiPirkimai, a different table) — it's only queryable via
execute_query. The LLM can at least answer "did this procurement happen and who organized it" for old CVPP records, just
not "who bid and at what price."
