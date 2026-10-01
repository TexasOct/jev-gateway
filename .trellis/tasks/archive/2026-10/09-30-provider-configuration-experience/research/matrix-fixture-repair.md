# Matrix fixture repair evidence

The bounded repair makes `tests/test_task_aware_matrix.py` exercise the documented seven-label matrix from a self-contained test fixture. Final verification reports 64 passed, 0 failed, and 0 skipped. All eight failures listed in the parent backend gate now pass with their original assertions.

Only these repository files were written:

- `tests/test_task_aware_matrix.py`: module/helper docstrings, `CONFIG_PATH`, and removal of the local-file absence skip.
- `tests/fixtures/task_aware_matrix.json`: a new credential-free matrix fixture.
- This research note.

No product strategy, shared test helper, tracked example configuration, or task metadata was edited. No Git commands, builds, agents, task-pointer changes, or archives were run. The parent session owns the full backend suite rerun.

## Pre-existing dependency and byte comparison

Before editing, the test source was copied to this test-source-only snapshot:

`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-matrix-fixture-repair-ywkjpzy1/test_task_aware_matrix.before.py`

It is byte-identical to the main session's earlier snapshot:

`/var/folders/z1/x_q902n155vc8_nypm6nw_sc0000gn/T/jev-provider-before-z84iyawv/tests/test_task_aware_matrix.py`

Both contain 10,914 bytes and have SHA-256 `56497ac42798d781987af34c6ba3500c94d654676936d65d8d79bb1eb8515542`. Comparison returned `True`. Only the test source was read from the main snapshot.

The unchanged pre-edit source contains:

```python
CONFIG_PATH = PROJECT_ROOT / "models.json"

pytestmark = pytest.mark.skipif(
    not CONFIG_PATH.is_file(), reason="models.json is a local, git-ignored file"
)
```

`shipped_document()` reads `CONFIG_PATH`. The dependency on operator-local configuration therefore predates this repair. The old test was not deliberately rerun against the private model document. The failure count and node IDs come from the existing parent gate's `research/final-gates/pytest.log`, which records `8 failed, 696 passed in 36.43s`.

## Fixture sources and scope

The matrix authority is the seven-label table in `docs/routing-design.md:296` and `docs/models-config.md:244`, together with the unchanged test's rule-number expectations. The tracked `models.example.json` and `jev_gateway/templates/models.example.json` supply credential-free configuration shapes. Both example files are byte-identical and define five task-aware labels, so their task-aware rules were not copied as the matrix authority.

| Label, in order | Fixture pool | Effort |
| --- | --- | --- |
| `quick` | DeepSeek | `minimal` |
| `draft` | DeepSeek, Luna | `low` |
| `review` | DeepSeek, Luna | `medium` |
| `investigate` | DeepSeek | `high` |
| `craft` | Luna | `medium` |
| `engineering` | Luna, Sol | `high` |
| `ultra` | Astra | `xhigh` |

Canonical IDs remain `deepseek/deepseek-flash`, `openai/gpt-6-luna`, `openai/gpt-6-sol`, and `openai/gpt-6-astra`. Terra retains only `quality/analysis`, as documented.

| Rule | Ordered condition | Label | Selection |
| --- | --- | --- | --- |
| 1 | Cross-domain coding or reverse | `ultra` | `quality_first` |
| 2 | Reverse | `engineering` | `quality_first` |
| 3 | Large coding | `engineering` | `quality_first` |
| 4 | Moderate coding with exacting rigor | `engineering` | `quality_first` |
| 5 | Remaining coding | `craft` | `cheapest_adequate` |
| 6 | Research with exacting rigor | `investigate` | `cheapest_adequate` |
| 7 | Docs or small change with exacting rigor | `review` | `cheapest_adequate` |
| 8 | Bounded small change with draft rigor | `quick` | `cheapest_adequate` |
| 9 | Remaining draft research, docs, or small change | `draft` | `cheapest_adequate` |

The documented fallback is `review` plus `cheapest_adequate`, selecting Luna in this fixture. `docs/routing-design.md` states nine rules. The introductory sentence in `docs/models-config.md` says ten; its table and the unchanged test expectations map to the nine rules above. No tenth rule was invented and neither document was edited.

All five profiles' non-tag fields are copied exactly from the tracked example, including priorities, quality weights, costs, limits, and reasoning capabilities. The three question definitions, the `quality` strategy, and the top-level base policy also match the example exactly. Task-aware tags implement the documented pools; unused economy tags and strategy were omitted. The base policy is required by the existing compact-strategy parser.

All endpoints use reserved `.example` hosts. Every provider references `JEV_OPENROUTER_API_KEY`, which the existing route helper overwrites with `test-key` before catalog construction. The existing `httpx.post` stub supplies decision answers or raises a controlled connection error. The fixture contains no credential values and the tests send no upstream chat requests.

Source preservation hashes recorded before editing:

| Source | SHA-256 |
| --- | --- |
| `models.example.json` | `a83f3eb8aabff6f27fad0fdf7f1de727c7d0b475d0d0b9b68f7f4f19fddefa07` |
| `jev_gateway/templates/models.example.json` | `a83f3eb8aabff6f27fad0fdf7f1de727c7d0b475d0d0b9b68f7f4f19fddefa07` |
| `docs/routing-design.md` | `bada0bb8882461fe3fab8ddb4ce05be8c5ecd702fe1954c2318ab4d0a0ca889b` |
| `docs/models-config.md` | `8c72a0d3d97ba59fba520384eabf4077aa868141718428cf92390ffd603389c8` |

After the repair, all four source hashes still match.

## Case and assertion preservation

Source comparison confirms all 10 test function definitions remain byte-identical. The `CASES` and `RESERVED_CASES` values, test decorators, and inline effort parameters remain unchanged. There are 29 assertion statements before and after the repair.

Pytest runs the existing 64 cases: 12 everyday routes, 2 reserved routes, 40 workload/scale/rigor combinations, 4 everyday effort cases, and 6 individual pool, fallback, label-order, quality-label, and reserved-effort checks. The absence skip was removed; no replacement skip, xfail, assertion removal, or expected-result adjustment was added.

## Final checks

```text
PYTHON_DOTENV_DISABLED=1 LITELLM_LOCAL_MODEL_COST_MAP=true uv run pytest -q tests/test_task_aware_matrix.py
64 passed in 0.06s
Exit: 0

uvx pyright tests/test_task_aware_matrix.py
0 errors, 0 warnings, 0 informations
Exit: 0
```

A second run used the same environment flags with an in-memory Python audit hook installed before importing pytest. The hook rejects opens whose basename is `models.json`, `.env`, or their dotted backup names, and rejects `socket.connect` and `socket.getaddrinfo`. A pytest plugin recorded call reports and checked the eight previous node IDs individually. Result:

```text
64 passed in 0.06s
Call reports: 64 passed: 64
Private-configuration/network access attempts: 0
Previously failing node IDs now pass: 8 of 8
Exit: 0
```

The source diff is limited to the two docstrings, fixture path, and absence-skip removal. Byte comparisons preserve test functions, decorators, and case constants. Whitespace checks cover all three owned files, including trailing whitespace, final newlines, and conflict markers. Git was not used for the diff check.

## Previously failing cases now passing

Each ID below is prefixed with `tests/test_task_aware_matrix.py::` in pytest:

```text
test_reserved_work_reaches_the_top_tier[cross-domain engineering-answers0-rule_1]
test_reserved_work_reaches_the_top_tier[cross-domain audit-answers1-rule_1]
test_astra_requires_cross_domain_coding_or_reverse[draft-cross_domain-coding]
test_astra_requires_cross_domain_coding_or_reverse[draft-cross_domain-reverse]
test_astra_requires_cross_domain_coding_or_reverse[exacting-cross_domain-coding]
test_astra_requires_cross_domain_coding_or_reverse[exacting-cross_domain-reverse]
test_only_reserved_rules_reach_the_reserved_pool
test_the_reserved_tier_thinks_at_the_deepest_configured_level
```

## Dependency import finding

The first fixture run failed all 64 cases because the new fixture omitted the base policy required by compact strategies. Copying that unchanged policy from the tracked example fixed the fixture schema.

The initial pytest commands did not set `PYTHON_DOTENV_DISABLED=1`. A later guarded run caught LiteLLM's import calling `dotenv.load_dotenv()` and attempting to open `.env`; the audit hook blocked the open before contents were read in that run. The earlier unguarded commands may have loaded `.env` internally. No private configuration contents were directly inspected or displayed, and the fixture's configured key reference is overwritten with the dummy value before routing. This note does not claim the earlier commands avoided dependency-managed dotenv access.

The installed `litellm/__init__.py:30` invokes dotenv loading in its default development mode. The installed `dotenv/main.py` checks `PYTHON_DOTENV_DISABLED` before searching for or opening `.env`. Final ordinary and guarded runs used that supported flag and passed. Use it for the parent full-suite rerun when private dotenv access must be excluded.
