"""Public metadata candidates and source evidence, independent of routing."""

from __future__ import annotations

import copy
import json
import math
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, distribution
from typing import Any, Callable, Mapping, TypeGuard
from urllib.parse import urlsplit

from .discovery_network import DiscoveryNetworkError, JsonResponse, safe_get_json
from .reasoning import EFFORT_LADDER

SOURCE_LIMIT = 16 * 1024 * 1024
CACHE_TTL = 6 * 60 * 60
REFRESH_INTERVAL = 30
SOURCE_URLS = {
    "models_dev": "https://models.dev/api.json",
    "models_dev_catalog": "https://models.dev/catalog.json",
    "openrouter": "https://openrouter.ai/api/v1/models",
}
MODELS_DEV_SCHEMA_REVISION = "f4f37ea6a4315ebdb733a49c35499aa93fd35840"
_ENDPOINTS = {
    "openai": {("api.openai.com", "/v1")},
    "anthropic": {("api.anthropic.com", ""), ("api.anthropic.com", "/v1")},
    "deepseek": {("api.deepseek.com", ""), ("api.deepseek.com", "/v1")},
    "openrouter": {("openrouter.ai", "/api/v1")},
}
_EFFORTS = set(EFFORT_LADDER)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_identifier(value: Any) -> TypeGuard[str]:
    return isinstance(value, str) and 0 < len(value) <= 256 and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/@+\-]*", value)) and "://" not in value and ".." not in value and "//" not in value


def _number(value: Any, *, multiplier: float = 1.0, integer: bool = False) -> float | int | None:
    if value is None or isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    try:
        number = float(value) * multiplier
    except (ValueError, OverflowError):
        return None
    if not math.isfinite(number) or number < 0:
        return None
    if integer:
        return int(number) if number > 0 and number.is_integer() else None
    return number


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, dict) else {}


def _levels(value: Any) -> list[str] | None:
    if not isinstance(value, list) or len(value) > 16 or any(not isinstance(v, str) or v not in _EFFORTS for v in value):
        return None
    return list(dict.fromkeys(value))


def _empty_fields() -> dict[str, Any]:
    return {
        "input_per_million": None, "output_per_million": None,
        "cache_read_per_million": None, "cache_write_per_million": None,
        "tools": None, "vision": None, "json_mode": None, "reasoning": None,
        "temperature": None, "reasoning_effort": None,
        "context_window": None, "max_output_tokens": None,
    }


def _evidence(source: str, provider: str, model: str, fetched_at: str, *, applicable: bool = True) -> dict[str, Any]:
    result: dict[str, Any] = {
        "source": source, "source_provider": provider, "source_model": model,
        "fetched_at": fetched_at, "applicable": applicable, "fields": {},
    }
    if source in SOURCE_URLS:
        result["url"] = SOURCE_URLS[source]
    if source.startswith("models_dev"):
        result["schema_revision"] = MODELS_DEV_SCHEMA_REVISION
    return result


def _put(evidence: dict[str, Any], field: str, value: Any, source_field: str, unit: str | None = None) -> None:
    field = field.removeprefix("cost.").removeprefix("capabilities.")
    item = {"value": value, "source_field": source_field}
    if unit is not None:
        item["unit"] = unit
        if unit == "USD/M tokens":
            item["source_unit"] = "USD/token" if evidence["source"] in {"openrouter", "litellm_snapshot"} else "USD/M tokens"
    evidence["fields"][field] = item


def _bool(evidence: dict[str, Any], field: str, value: Any, source_field: str) -> None:
    if value is None or isinstance(value, bool):
        _put(evidence, "capabilities." + field, value, source_field)


def _price_details(cost: Mapping[str, Any], *, multiplier: float, source: str) -> dict[str, Any]:
    """Keep only numeric charges and structured conditions from public sources."""
    allowed = {
        "input", "output", "reasoning", "cache_read", "cache_write", "input_audio", "output_audio",
        "prompt", "completion", "input_cache_read", "input_cache_write", "input_cache_write_1h", "web_search", "request",
        "image", "internal_reasoning",
        "input_cost_per_token", "output_cost_per_token", "cache_read_input_token_cost", "cache_creation_input_token_cost",
        "input_cost_per_token_above_200k_tokens", "output_cost_per_token_above_200k_tokens",
    }
    if source == "litellm_snapshot":
        price_key = re.compile(r"(?:(?:input|output)_cost_per_token(?:_(?:above_\d+k_tokens|batches|cache_hit|flex|priority))*|cache_(?:creation|read)_input_(?:audio_)?token_cost(?:_(?:above_\d+k_tokens|above_\d+hr|flex|priority))*|citation_cost_per_token)")
        allowed.update(key for key in cost if price_key.fullmatch(key))
    details: dict[str, Any] = {}
    for key in allowed:
        if key in cost:
            token_charge = key not in {"web_search", "request", "image"}
            details[key] = {"value": _number(cost[key], multiplier=multiplier if token_charge else 1), "unit": "USD/M tokens" if token_charge else "USD/source unit"}
    for key in ("tiers", "overrides"):
        if isinstance(cost.get(key), list):
            conditions = []
            for row in cost[key][:32]:
                if not isinstance(row, dict):
                    continue
                projected = _price_details({k: v for k, v in row.items() if k in allowed}, multiplier=multiplier, source=source)
                tier = _mapping(row.get("tier"))
                if tier.get("type") == "context" and _number(tier.get("size"), integer=True) is not None:
                    projected["condition"] = {"type": "context", "size": _number(tier["size"], integer=True)}
                # OpenRouter conditions are evidence; no billing rules are evaluated.
                if key == "overrides":
                    for name in ("min_prompt_tokens", "utc_start", "utc_end"):
                        value = row.get(name)
                        number = _number(value)
                        if number is not None and float(number).is_integer():
                            projected[name] = int(number)
                    days = row.get("utc_days")
                    weekdays = {"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
                    if isinstance(days, list) and len(days) <= 7 and all(isinstance(day, str) and day in weekdays for day in days):
                        projected["utc_days"] = list(days)
                    known = allowed | {"min_prompt_tokens", "utc_start", "utc_end", "utc_days", "condition"}
                    if any(name not in known for name in row):
                        projected["unrecognized_conditions"] = True
                    condition = _mapping(row.get("condition"))
                    projected["condition_fields"] = sorted(k for k in condition if k in {"context", "context_length", "time", "start_time", "end_time"})
                    for k in ("context_length", "context"):
                        if k in condition and _number(condition[k]) is not None:
                            projected[k] = _number(condition[k])
                    for k in ("time", "start_time", "end_time"):
                        value = condition.get(k)
                        if isinstance(value, str) and re.fullmatch(r"[0-9T:Z+./\- ]{1,64}", value):
                            projected[k] = value
                conditions.append(projected)
            details[key] = conditions
    if not cost.get("tiers") and isinstance(cost.get("context_over_200k"), dict):
        legacy = _price_details({key: value for key, value in cost["context_over_200k"].items() if key in allowed}, multiplier=multiplier, source=source)
        legacy["threshold_unverified"] = True
        details["context_over_200k"] = legacy
    return details


def native_model_metadata(row: Mapping[str, Any], transport: str, provider_id: str, fetched_at: str) -> dict[str, Any]:
    """Project only capabilities that the listing explicitly declares."""
    model = row.get("id")
    if not safe_identifier(model):
        return {"fields": _empty_fields(), "sources": [], "warnings": ["invalid_model_id"]}
    evidence = _evidence("native_listing", provider_id, model, fetched_at)
    warnings: list[str] = []
    if transport == "anthropic":
        if "max_tokens" in row:
            _put(evidence, "max_output_tokens", _number(row["max_tokens"], integer=True), "max_tokens", "tokens")
        if "max_input_tokens" in row:
            _put(evidence, "max_input_tokens", _number(row["max_input_tokens"], integer=True), "max_input_tokens", "tokens")
        caps = _mapping(row.get("capabilities"))
        # Native structured output does not certify LiteLLM's JSON format paths.
        for source_name, field in (("image_input", "vision"), ("thinking", "reasoning"), ("structured_outputs", "structured_output")):
            declaration = _mapping(caps.get(source_name))
            if "supported" in declaration:
                _bool(evidence, field, declaration["supported"], f"capabilities.{source_name}.supported")
        effort = _mapping(caps.get("effort"))
        if effort.get("supported") is False:
            _put(evidence, "capabilities.reasoning_effort", [], "capabilities.effort.supported")
        elif effort.get("supported") is True:
            names = ("low", "medium", "high", "xhigh", "max")
            declarations = {name: _mapping(effort.get(name)).get("supported") for name in names}
            levels = [name for name in names if declarations[name] is True]
            # Named true declarations prove only those levels. An empty ladder
            # requires every named level to be explicitly declared unsupported.
            value = levels if levels or all(type(v) is bool for v in declarations.values()) else None
            _put(evidence, "capabilities.reasoning_effort", value, "capabilities.effort")
    elif transport == "deepseek":
        for name in ("context_window", "max_output_tokens"):
            if name in row:
                _put(evidence, name, _number(row[name], integer=True), name, "tokens")
        modalities = row.get("input_modalities")
        if isinstance(modalities, list) and modalities and all(isinstance(v, str) and v in {"text", "image"} for v in modalities):
            _bool(evidence, "vision", "image" in modalities, "input_modalities")
        effort = _mapping(row.get("effort"))
        if "supported_levels" in effort:
            _put(evidence, "capabilities.reasoning_effort", _levels(effort["supported_levels"]), "effort.supported_levels")
    return _merge_candidates([evidence], warnings)


def _models_dev(row: Mapping[str, Any], source: str, provider: str, model: str, fetched_at: str, applicable: bool) -> dict[str, Any]:
    evidence = _evidence(source, provider, model, fetched_at, applicable=applicable)
    canonical = row.get("canonical_model_id", row.get("base_model"))
    if safe_identifier(canonical):
        evidence["canonical_model_id"] = canonical
    updated = row.get("last_updated")
    if isinstance(updated, str) and re.fullmatch(r"\d{4}-\d{2}(?:-\d{2})?", updated):
        evidence["source_updated_at"] = updated
    cost = _mapping(row.get("cost"))
    for key, field in (("input", "input_per_million"), ("output", "output_per_million"), ("cache_read", "cache_read_per_million"), ("cache_write", "cache_write_per_million")):
        if key in cost:
            _put(evidence, "cost." + field, _number(cost[key]), "cost." + key, "USD/M tokens")
    if cost:
        evidence["pricing"] = _price_details(cost, multiplier=1, source=source)
    for key, field in (("tool_call", "tools"), ("reasoning", "reasoning"), ("temperature", "temperature")):
        if key in row:
            _bool(evidence, field, row[key], key)
    # Structured-output declarations remain evidence until protocol confirmation.
    if "structured_output" in row and (row["structured_output"] is None or isinstance(row["structured_output"], bool)):
        _put(evidence, "structured_output", row["structured_output"], "structured_output")
    modalities = _mapping(row.get("modalities")).get("input")
    if isinstance(modalities, list) and len(modalities) <= 5 and all(isinstance(v, str) and v in {"text", "image", "audio", "video", "pdf"} for v in modalities) and len(set(modalities)) == len(modalities):
        evidence["input_modalities"] = {"value": list(modalities), "source_field": "modalities.input"}
    if "input_modalities" in evidence and modalities:
        _bool(evidence, "vision", "image" in modalities, "modalities.input")
    limit = _mapping(row.get("limit"))
    for key, field in (("context", "context_window"), ("output", "max_output_tokens")):
        if key in limit:
            _put(evidence, field, _number(limit[key], integer=True), "limit." + key, "tokens")
    options = row.get("reasoning_options")
    if isinstance(options, list) and len(options) <= 16:
        for index, option in enumerate(options):
            if isinstance(option, dict) and option.get("type") == "effort":
                levels = option.get("values")
                _put(evidence, "reasoning_effort", _levels(levels), f"reasoning_options.{index}.values")
                if isinstance(levels, list) and len(levels) <= 16 and all(value is None or isinstance(value, str) and value in _EFFORTS | {"default"} for value in levels):
                    evidence["source_reasoning_effort"] = list(levels)
    return evidence


def _openrouter(row: Mapping[str, Any], model: str, fetched_at: str) -> dict[str, Any]:
    evidence = _evidence("openrouter", "openrouter", model, fetched_at)
    cost = _mapping(row.get("pricing"))
    for key, field in (("prompt", "input_per_million"), ("completion", "output_per_million"), ("input_cache_read", "cache_read_per_million"), ("input_cache_write", "cache_write_per_million")):
        if key in cost:
            _put(evidence, "cost." + field, _number(cost[key], multiplier=1_000_000), "pricing." + key, "USD/M tokens")
    evidence["pricing"] = _price_details(cost, multiplier=1_000_000, source="openrouter")
    if "context_length" in row:
        _put(evidence, "context_window", _number(row["context_length"], integer=True), "context_length", "tokens")
    top = _mapping(row.get("top_provider"))
    if "max_completion_tokens" in top:
        _put(evidence, "max_output_tokens", _number(top["max_completion_tokens"], integer=True), "top_provider.max_completion_tokens", "tokens")
    parameters = row.get("supported_parameters")
    if isinstance(parameters, list) and all(isinstance(p, str) for p in parameters):
        for key, field in (("tools", "tools"), ("temperature", "temperature"), ("reasoning", "reasoning"), ("response_format", "json_mode")):
            _bool(evidence, field, key in parameters, "supported_parameters")
    modalities = _mapping(row.get("architecture")).get("input_modalities")
    if isinstance(modalities, list) and modalities and all(isinstance(v, str) for v in modalities):
        _bool(evidence, "vision", "image" in modalities, "architecture.input_modalities")
    return evidence


def _litellm(row: Mapping[str, Any], provider: str, model: str, fetched_at: str, applicable: bool) -> dict[str, Any]:
    evidence = _evidence("litellm_snapshot", provider, model, fetched_at, applicable=applicable)
    for key, field in (("input_cost_per_token", "input_per_million"), ("output_cost_per_token", "output_per_million"), ("cache_read_input_token_cost", "cache_read_per_million"), ("cache_creation_input_token_cost", "cache_write_per_million")):
        if key in row:
            _put(evidence, "cost." + field, _number(row[key], multiplier=1_000_000), key, "USD/M tokens")
    evidence["pricing"] = _price_details(row, multiplier=1_000_000, source="litellm_snapshot")
    for key, field in (("supports_function_calling", "tools"), ("supports_vision", "vision"), ("supports_reasoning", "reasoning"), ("supports_temperature", "temperature")):
        if key in row:
            _bool(evidence, field, row[key], key)
    if "supports_response_schema" in row:
        value = row["supports_response_schema"]
        if value is None or isinstance(value, bool):
            _put(evidence, "structured_output", value, "supports_response_schema")
    # max_input_tokens is an input limit, not a verified combined window.
    if "max_input_tokens" in row:
        _put(evidence, "max_input_tokens", _number(row["max_input_tokens"], integer=True), "max_input_tokens", "tokens")
    if "max_output_tokens" in row:
        _put(evidence, "max_output_tokens", _number(row["max_output_tokens"], integer=True), "max_output_tokens", "tokens")
    return evidence


def _merge_candidates(sources: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any]:
    fields = _empty_fields()
    candidates: dict[str, list[Any]] = {}
    for source in sources:
        if "pricing" in source and source["pricing"]:
            warnings.append("pricing_requires_confirmation")
        if "source_reasoning_effort" in source and any(value is None or value == "default" for value in source["source_reasoning_effort"]):
            warnings.append("reasoning_effort_requires_confirmation")
        if not source["applicable"]:
            warnings.append("reference_only")
            continue
        for path, evidence in source["fields"].items():
            if evidence["value"] is not None:
                candidates.setdefault(path, []).append(evidence["value"])
    for path, values in candidates.items():
        if any(value != values[0] for value in values[1:]):
            warnings.append("metadata_conflict")
            continue
        if path in fields:
            fields[path] = values[0]
    return {"fields": fields, "sources": sources, "warnings": list(dict.fromkeys(warnings))}


@dataclass
class _CacheEntry:
    data: Any
    fetched_at: str
    stored_at: float
    ttl: float
    validators: dict[str, str]


class MetadataClient:
    """Fixed-source, bounded cache with coalesced reads and refresh throttling."""

    def __init__(
        self, *, fetch: Callable[..., JsonResponse] = safe_get_json,
        clock: Callable[[], float] = time.monotonic,
        snapshot_loader: Callable[[], Any] | None = None,
    ) -> None:
        self.fetch = fetch
        self.clock = clock
        self.snapshot_loader = snapshot_loader or _load_litellm_snapshot
        self.cache: dict[str, _CacheEntry] = {}
        self.last_attempt: dict[str, float] = {}
        self.lock = threading.Lock()
        self.fetch_lock = threading.Lock()

    def _source(self, source: str, refresh: bool) -> tuple[_CacheEntry | None, bool, list[str]]:
        now = self.clock()
        with self.lock:
            entry = self.cache.get(source)
            if entry is not None and now - entry.stored_at >= CACHE_TTL:
                self.cache.pop(source, None)
                entry = None
            fresh = entry is not None and now - entry.stored_at < entry.ttl
            if fresh and not refresh:
                return entry, False, []
            last = self.last_attempt.get(source)
            if last is not None and now - last < REFRESH_INTERVAL:
                return entry, not fresh, ["refresh_throttled"]
        if not self.fetch_lock.acquire(blocking=False):
            return entry, not fresh, ["metadata_busy"]
        try:
            with self.lock:
                self.last_attempt[source] = now
            if source == "litellm_snapshot":
                data = self.snapshot_loader()
                response = JsonResponse(data)
            else:
                response = self.fetch(SOURCE_URLS[source], headers=entry.validators if entry else {}, timeout=20.0, max_bytes=SOURCE_LIMIT)
            if response.status == 304:
                if entry is None:
                    raise DiscoveryNetworkError("invalid_response")
                data = entry.data
            else:
                data = response.data
            if not isinstance(data, dict) or len(json.dumps(data, allow_nan=False).encode()) > SOURCE_LIMIT:
                raise DiscoveryNetworkError("invalid_response")
            headers = response.headers or {}
            ttl: float = CACHE_TTL
            control = headers.get("cache-control", "")
            match = re.search(r"(?:^|,)\s*max-age=(\d+)", control)
            if match:
                ttl = min(CACHE_TTL, int(match.group(1)))
            if "no-cache" in control or "no-store" in control:
                ttl = 0
            validators = {}
            for name, request_name in (("etag", "If-None-Match"), ("last-modified", "If-Modified-Since")):
                if name in headers and len(headers[name]) <= 1024 and all(32 <= ord(c) < 127 for c in headers[name]):
                    validators[request_name] = headers[name]
            updated = _CacheEntry(data, timestamp(), self.clock(), ttl, validators or (entry.validators if entry else {}))
            with self.lock:
                if "no-store" not in control:
                    self.cache[source] = updated
                else:
                    self.cache.pop(source, None)
            return updated, False, []
        except Exception:
            # Source failure is reported as stale candidates or unknown fields.
            return entry, True, ["metadata_source_unavailable"]
        finally:
            self.fetch_lock.release()

    def lookup(self, provider: Mapping[str, Any], upstream_models: list[str], *, refresh: bool = False) -> dict[str, Any]:
        if len(upstream_models) > 1000 or any(not safe_identifier(model) for model in upstream_models):
            return {"items": [], "fetched_at": None, "stale": False}
        if provider.get("protocol") == "system_one" or provider.get("type") == "system_one" or provider.get("kind") == "decision":
            return {"items": [], "fetched_at": None, "stale": False}
        source_provider = provider.get("brand_id") or provider.get("type")
        if not isinstance(source_provider, str) or source_provider not in _ENDPOINTS:
            source_provider = ""
        if not upstream_models:
            return {"items": [], "fetched_at": None, "stale": False}
        if not source_provider:
            return {"items": [{"upstream_model": model, "fields": _empty_fields(), "sources": [], "warnings": ["metadata_not_found"]} for model in dict.fromkeys(upstream_models)], "fetched_at": None, "stale": False}
        applicable = _serving_matches(provider, source_provider)
        source_names = ["models_dev", "models_dev_catalog"]
        if source_provider == "openrouter" and applicable:
            source_names.insert(0, "openrouter")
        entries: dict[str, _CacheEntry] = {}
        warnings: list[str] = []
        stale = False
        for source in source_names:
            entry, failed, notes = self._source(source, refresh)
            stale |= failed
            warnings.extend(notes)
            if entry is not None:
                entries[source] = entry
        # The installed snapshot is a fallback when public sources fail or miss.
        needs_snapshot = any(not _find_models_dev(entries, source_provider, model) and not _find_openrouter(entries, model) for model in upstream_models)
        if needs_snapshot:
            entry, failed, notes = self._source("litellm_snapshot", refresh)
            warnings.extend(notes)
            stale |= failed
            if entry is not None:
                entries["litellm_snapshot"] = entry
        items = []
        for model in dict.fromkeys(upstream_models):
            sources: list[dict[str, Any]] = []
            notes = list(warnings)
            native = _find_openrouter(entries, model)
            if native is not None and source_provider == "openrouter" and applicable:
                row, date = native
                sources.append(_openrouter(row, model, date))
            for source, row, date in _find_models_dev(entries, source_provider, model):
                sources.append(_models_dev(row, source, source_provider, model, date, applicable))
                canonical = row.get("canonical_model_id", row.get("base_model"))
                catalog = entries.get("models_dev_catalog")
                if safe_identifier(canonical) and catalog is not None:
                    fact = _mapping(catalog.data.get("models")).get(canonical)
                    if isinstance(fact, dict):
                        source_fact = _models_dev(fact, "models_dev_catalog", "canonical", canonical, catalog.fetched_at, applicable)
                        # Canonical facts never carry a serving price.
                        source_fact["fields"] = {k: v for k, v in source_fact["fields"].items() if k not in {"input_per_million", "output_per_million", "cache_read_per_million", "cache_write_per_million"}}
                        source_fact.pop("pricing", None)
                        sources.append(source_fact)
            if not sources:
                snapshot = entries.get("litellm_snapshot")
                if snapshot is not None and source_provider:
                    for key in (f"{source_provider}/{model}", model):
                        row = snapshot.data.get(key)
                        if isinstance(row, dict) and row.get("litellm_provider") == source_provider:
                            sources.append(_litellm(row, source_provider, model, snapshot.fetched_at, applicable))
                            break
            if not sources:
                notes.append("metadata_not_found")
            if not applicable:
                notes.append("serving_endpoint_unmatched")
            merged = _merge_candidates(sources, notes)
            items.append({"upstream_model": model, **merged})
        dates = [entry.fetched_at for entry in entries.values()]
        return {"items": items, "fetched_at": max(dates) if dates else None, "stale": stale}


def _serving_matches(provider: Mapping[str, Any], source_provider: str) -> bool:
    defaults = {"anthropic": "https://api.anthropic.com", "deepseek": "https://api.deepseek.com", "openrouter": "https://openrouter.ai/api/v1"}
    transport = provider.get("type")
    compatible = {"openai": {"openai"}, "anthropic": {"anthropic"}, "deepseek": {"deepseek", "openai"}, "openrouter": {"openrouter", "openai"}}
    if not isinstance(transport, str) or transport not in compatible.get(source_provider, set()):
        return False
    base = provider.get("api_base") or defaults.get(transport if isinstance(transport, str) else "", "")
    try:
        if not isinstance(base, str) or any(ord(c) < 33 or ord(c) == 127 for c in base) or "\\" in base:
            return False
        parts = urlsplit(base)
        return parts.scheme == "https" and not parts.netloc.endswith(":") and parts.port in {None, 443} and parts.username is None and not parts.query and not parts.fragment and (parts.hostname, parts.path.rstrip("/")) in _ENDPOINTS.get(source_provider, set())
    except (ValueError, TypeError):
        return False


def _find_models_dev(entries: Mapping[str, _CacheEntry], provider: str, model: str) -> list[tuple[str, Mapping[str, Any], str]]:
    results = []
    for source in ("models_dev", "models_dev_catalog"):
        entry = entries.get(source)
        if entry is None:
            continue
        providers = _mapping(entry.data.get("providers")) if source == "models_dev_catalog" else entry.data
        models = _mapping(_mapping(providers.get(provider)).get("models"))
        row = models.get(model)
        if isinstance(row, dict) and row.get("id", model) == model:
            results.append((source, row, entry.fetched_at))
    return results


def _find_openrouter(entries: Mapping[str, _CacheEntry], model: str) -> tuple[Mapping[str, Any], str] | None:
    entry = entries.get("openrouter")
    if entry is not None and isinstance(entry.data.get("data"), list):
        for row in entry.data["data"]:
            if isinstance(row, dict) and row.get("id") == model:
                return row, entry.fetched_at
    return None


def _load_litellm_snapshot() -> Any:
    try:
        package = distribution("litellm")
        path = package.locate_file("litellm/model_prices_and_context_window_backup.json")
        with open(str(path), "rb") as source:
            body = source.read(SOURCE_LIMIT + 1)
        if len(body) > SOURCE_LIMIT:
            raise DiscoveryNetworkError("response_too_large")
        return json.loads(body)
    except (OSError, PackageNotFoundError, ValueError):
        raise DiscoveryNetworkError("upstream_failed") from None


_CLIENT = MetadataClient()


def lookup_model_metadata(provider: Mapping[str, Any], upstream_models: list[str], *, refresh: bool = False) -> dict[str, Any]:
    """Return detached suggestions; callers retain all confirmed catalog values."""
    return copy.deepcopy(_CLIENT.lookup(provider, upstream_models, refresh=refresh))
