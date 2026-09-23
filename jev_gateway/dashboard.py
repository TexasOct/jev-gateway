"""Read-only dashboard routes for live sessions and retained routing evidence."""

from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, Protocol

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import HTMLResponse

from jev_gateway.records import StorageUnavailableError


class DashboardState(Protocol):
    """Mutable gateway state consumed without importing the composition root."""

    gateway_api_key: str | None
    engine: Any


Authorize = Callable[[str | None, str | None], None]


PROVIDER_WINDOW_SECONDS = 900


_DASHBOARD_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JEV gateway sessions</title>
<style>
:root{color-scheme:light dark;--bg:#f5f7fa;--panel:#fff;--text:#17202a;--muted:#637083;--line:#d8dee8;--accent:#3b66d9;--good:#207a4b;--bad:#b33b3b;--code:#edf1f7}
@media(prefers-color-scheme:dark){:root{--bg:#11151b;--panel:#1a2029;--text:#edf2f7;--muted:#9aa8ba;--line:#344050;--accent:#8da9ff;--good:#65d69c;--bad:#ff8e8e;--code:#111820}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 system-ui,sans-serif}header{display:flex;gap:1rem;align-items:center;justify-content:space-between;padding:1rem 1.25rem;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:2}h1,h2,h3{margin:.2rem 0}button,input{font:inherit}button{padding:.55rem .8rem;border:1px solid var(--line);border-radius:.45rem;background:var(--panel);color:var(--text);cursor:pointer}button:hover{border-color:var(--accent)}main{display:grid;grid-template-columns:minmax(280px,36%) minmax(0,1fr);gap:1rem;padding:1rem;min-height:calc(100vh - 66px)}section{min-width:0}.provider-panel{grid-column:1/-1}.provider-table-wrap{overflow-x:auto}.provider-table{border-collapse:collapse;width:100%;text-align:left}.provider-table th,.provider-table td{padding:.55rem;border-bottom:1px solid var(--line);white-space:nowrap}.provider-table th{color:var(--muted);font-weight:600}.provider-table td:first-child{overflow-wrap:anywhere;white-space:normal;min-width:10rem}.panel,.card{background:var(--panel);border:1px solid var(--line);border-radius:.7rem;padding:1rem}.sessions{display:grid;gap:.65rem;margin-top:.8rem}.session{width:100%;text-align:left;padding:.8rem}.session.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.route{color:var(--accent);font-weight:650;overflow-wrap:anywhere}.meta,.empty,.storage{color:var(--muted)}.preview{margin:.35rem 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.status-ok{color:var(--good)}.status-bad{color:var(--bad)}.timeline{display:grid;gap:.8rem;margin-top:.8rem}.stage{margin-top:.55rem}details{border-top:1px solid var(--line);padding:.55rem 0}summary{cursor:pointer;font-weight:650}pre{overflow:auto;background:var(--code);padding:.7rem;border-radius:.4rem;white-space:pre-wrap;overflow-wrap:anywhere}.auth{display:none;gap:.5rem;align-items:center}.auth.visible{display:flex}.auth input{min-width:14rem;padding:.55rem;border:1px solid var(--line);border-radius:.4rem;background:var(--panel);color:var(--text)}@media(max-width:760px){main{grid-template-columns:1fr}header{align-items:flex-start;flex-wrap:wrap}.auth{width:100%}.auth input{min-width:0;flex:1}}
</style>
</head>
<body>
<header><div><h1>Gateway sessions</h1><div class="meta">Live process state and retained routing evidence</div></div><form id="auth" class="auth"><input id="key" type="password" autocomplete="off" placeholder="Gateway API key" aria-label="Gateway API key"><button type="submit">Connect</button></form><button id="refresh" type="button">Refresh</button></header>
<main><section class="panel provider-panel"><h2>Retained outcomes, last 15 minutes</h2><p class="meta">Best-effort evidence may be incomplete after retention, queue loss, or restart. Missing outcomes are not active requests.</p><div id="provider-storage" class="storage"></div><div class="provider-table-wrap"><table class="provider-table"><thead><tr><th>Provider</th><th>Credential</th><th>Attempts</th><th>Completed</th><th>Succeeded</th><th>Failed</th><th>Incomplete evidence</th><th>Avg. duration</th><th>Latest result</th><th>Observed condition</th></tr></thead><tbody id="providers"><tr><td colspan="10">Loading…</td></tr></tbody></table></div></section><section class="panel"><h2>Current sessions</h2><div id="storage" class="storage"></div><div id="sessions" class="sessions"><div class="empty">Loading…</div></div></section><section class="panel"><h2 id="detail-title">Select a session</h2><div id="detail-storage" class="storage"></div><div id="timeline" class="timeline"><div class="empty">Choose a live session to inspect retained requests.</div></div></section></main>
<script>
(()=>{'use strict';let apiKey=null,selected=null;const auth=document.getElementById('auth'),key=document.getElementById('key'),sessions=document.getElementById('sessions'),timeline=document.getElementById('timeline'),storage=document.getElementById('storage'),detailStorage=document.getElementById('detail-storage'),detailTitle=document.getElementById('detail-title');
const text=(tag,value,cls)=>{const node=document.createElement(tag);if(cls)node.className=cls;node.textContent=value;return node};
const request=async path=>{const headers={};if(apiKey!==null)headers.Authorization='Bearer '+apiKey;const response=await fetch(path,{headers,cache:'no-store'});if(response.status===401){auth.classList.add('visible');key.focus();throw new Error('Authentication required');}if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error(body.error?.message||('Request failed: '+response.status));}auth.classList.remove('visible');return response.json()};
const storageText=data=>data.evidence_available?'Retained evidence available':('Evidence unavailable'+(data.storage?.error?': '+data.storage.error:''));
const renderProviders=data=>{const body=document.getElementById('providers');document.getElementById('provider-storage').textContent=storageText(data);body.replaceChildren();if(!data.providers.length){const row=document.createElement('tr');const cell=text('td','No configured providers.','empty');cell.colSpan=10;row.append(cell);body.append(row);return}const conditions={no_recent_data:'No recent data',all_observed_attempts_succeeded:'All observed attempts succeeded',mixed_outcomes:'Mixed outcomes',all_observed_attempts_failed:'All observed attempts failed'};for(const provider of data.providers){const row=document.createElement('tr');const latest=provider.last_outcome_at===null?'—':new Date(provider.last_outcome_at*1000).toLocaleString()+' · '+(provider.last_outcome_ok?'succeeded':'failed');for(const value of [provider.id+' ('+provider.type+')',provider.has_api_key?'Resolved':'Not resolved',provider.attempts,provider.completed,provider.succeeded,provider.failed,provider.incomplete_evidence,provider.average_latency_ms===null?'—':provider.average_latency_ms.toFixed(1)+' ms',latest,provider.observed_condition===null?'Evidence unavailable':conditions[provider.observed_condition]])row.append(text('td',value===null?'—':String(value)));body.append(row)}};
const loadProviders=async()=>{try{renderProviders(await request('/v1/routing/providers/summary'))}catch(error){const body=document.getElementById('providers');const row=document.createElement('tr');const cell=text('td',error.message,'empty');cell.colSpan=10;row.append(cell);body.replaceChildren(row)}};
const showJSON=(name,value,open=false)=>{const box=document.createElement('details');box.open=open;box.append(text('summary',name));box.append(text('pre',value===null?'Not recorded':JSON.stringify(value,null,2)));return box};
const renderDetail=data=>{detailTitle.textContent=data.session.session_id;detailStorage.textContent=storageText(data);timeline.replaceChildren();if(!data.evidence_available){timeline.append(text('div','Live session data is available, but retained request evidence cannot be queried.','empty'));return}if(!data.requests.length){timeline.append(text('div','No retained requests for this live session.','empty'));return}for(const item of data.requests){const card=text('article','', 'card');const req=item.request;card.append(text('h3',new Date(req.received_at*1000).toLocaleString()));card.append(text('div',req.request_id+' · '+(item.outcome===null?'pending':item.outcome.ok?'succeeded':'failed'),'meta'));card.append(showJSON('1. Inbound request',req,true));card.append(showJSON('2. Routing decision',item.decision));card.append(showJSON('3. LiteLLM request',item.upstream_request));card.append(showJSON('Outcome',item.outcome));timeline.append(card)}};
const loadDetail=async()=>{if(!selected)return;try{renderDetail(await request('/v1/routing/sessions/'+encodeURIComponent(selected)+'/requests'))}catch(error){timeline.replaceChildren(text('div',error.message,'empty'))}};
const renderSessions=data=>{storage.textContent=storageText(data);sessions.replaceChildren();if(!data.data.length){sessions.append(text('div','No live sessions.','empty'));return}for(const session of data.data){const button=text('button','', 'session'+(session.session_id===selected?' active':''));button.type='button';button.append(text('div',session.route||'Route unavailable','route'));button.append(text('div',session.session_id,'meta'));const latest=session.latest_request;button.append(text('div',latest?(latest.content_captured?(latest.prompt||'Empty user message'):'Content not captured'):'No retained request','preview'));button.append(text('div',[session.strategy||'strategy unavailable',session.label||'label unavailable',session.provider&&session.upstream_model?session.provider+'/'+session.upstream_model:'provider unavailable',session.turn_count+' turn'+(session.turn_count===1?'':'s'),latest?.ok===true?'succeeded':latest?.ok===false?'failed':'pending'].join(' · '),'meta'));button.addEventListener('click',()=>{selected=session.session_id;renderSessions(data);loadDetail()});sessions.append(button)}};
const refresh=async()=>{await loadProviders();try{const data=await request('/v1/routing/sessions');if(selected&&!data.data.some(item=>item.session_id===selected)){selected=null;detailTitle.textContent='Select a session';timeline.replaceChildren(text('div','The selected session is no longer live.','empty'))}renderSessions(data);await loadDetail()}catch(error){sessions.replaceChildren(text('div',error.message,'empty'))}};
auth.addEventListener('submit',event=>{event.preventDefault();apiKey=key.value;key.value='';refresh()});document.getElementById('refresh').addEventListener('click',refresh);refresh();})();
</script>
</body>
</html>"""


def _storage_state(state: DashboardState) -> tuple[dict[str, Any], bool]:
    status = state.engine.record_store.status()
    available = bool(
        state.engine.record_store.enabled
        and status.get("error") is None
        and status.get("alive", True)
    )
    return status, available


def _observed_condition(row: dict[str, Any]) -> str:
    completed = row["completed"]
    if completed == 0:
        return "no_recent_data"
    if row["failed"] == 0:
        return "all_observed_attempts_succeeded"
    if row["succeeded"] == 0:
        return "all_observed_attempts_failed"
    return "mixed_outcomes"


def _unknown_session(session_id: str) -> HTTPException:
    return HTTPException(
        status_code=404,
        detail={
            "error": {
                "message": f"No live session {session_id!r}.",
                "type": "invalid_request_error",
                "param": None,
                "code": "unknown_session",
            }
        },
    )


def create_dashboard_router(state: DashboardState, authorize: Authorize) -> APIRouter:
    """Create dashboard routes bound to mutable gateway state."""
    router = APIRouter()

    @router.get("/dashboard", response_class=HTMLResponse)
    def dashboard() -> HTMLResponse:
        return HTMLResponse(
            _DASHBOARD_HTML,
            headers={
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Content-Security-Policy": (
                    "default-src 'none'; style-src 'unsafe-inline'; "
                    "script-src 'unsafe-inline'; connect-src 'self'; "
                    "img-src 'self'; base-uri 'none'; form-action 'self'; "
                    "frame-ancestors 'none'"
                ),
            },
        )

    @router.get("/v1/routing/providers/summary", response_model=None)
    def routing_provider_summary(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        end = time.time()
        start = end - PROVIDER_WINDOW_SECONDS
        storage, evidence_available = _storage_state(state)
        evidence: dict[str, dict[str, Any]] = {}
        if evidence_available:
            try:
                evidence = state.engine.record_store.provider_summary(
                    window_start=start, window_end=end
                )
            except (StorageUnavailableError, RuntimeError, ValueError) as error:
                storage = {**storage, "error": str(error)}
                evidence_available = False
        providers: list[dict[str, Any]] = []
        metric_names = (
            "attempts", "completed", "succeeded", "failed",
            "incomplete_evidence", "average_latency_ms", "last_outcome_at",
            "last_outcome_ok",
        )
        for profile in state.engine.catalog.providers:
            row: dict[str, Any] = {
                "id": profile.name,
                "type": profile.type,
                "configured": True,
                "has_api_key": bool(profile.api_key),
            }
            if evidence_available:
                metrics = evidence.get(profile.name, {})
                row.update({
                    name: metrics.get(name, 0 if name in metric_names[:5] else None)
                    for name in metric_names
                })
                row["observed_condition"] = _observed_condition(row)
            else:
                row.update(dict.fromkeys(metric_names, None))
                row["observed_condition"] = None
            providers.append(row)
        return {
            "window": {
                "seconds": PROVIDER_WINDOW_SECONDS,
                "start": start,
                "end": end,
                "basis": "upstream_requests.created_at",
            },
            "storage": storage,
            "evidence_available": evidence_available,
            "providers": providers,
        }

    @router.get("/v1/routing/sessions", response_model=None)
    def routing_sessions(
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        snapshots = state.engine.store.snapshots()
        storage, evidence_available = _storage_state(state)
        evidence: dict[str, dict[str, Any]] = {}
        if evidence_available and snapshots:
            try:
                evidence = state.engine.record_store.latest_session_evidence(
                    tuple(item["session_id"] for item in snapshots)
                )
            except (StorageUnavailableError, RuntimeError, ValueError) as error:
                storage = {**storage, "error": str(error)}
                evidence_available = False
        data: list[dict[str, Any]] = []
        for snapshot in snapshots:
            item = dict(snapshot)
            found = evidence.get(snapshot["session_id"], {})
            latest = found.get("latest_request")
            decision = found.get("latest_decision")
            if isinstance(decision, dict):
                item.update(
                    route=decision.get("route") or item.get("route"),
                    provider=decision.get("provider"),
                    upstream_model=decision.get("upstream_model"),
                    strategy=decision.get("strategy") or item.get("strategy"),
                    label=decision.get("label") or item.get("label"),
                )
            else:
                profile = state.engine.catalog.by_name(str(item.get("route", "")))
                item["provider"] = profile.provider if profile is not None else None
                item["upstream_model"] = profile.model if profile is not None else None
            item["latest_request"] = latest
            data.append(item)
        data.sort(
            key=lambda item: (
                item["latest_request"] is not None,
                item["latest_request"]["received_at"]
                if item["latest_request"] is not None
                else item["updated_at"],
            ),
            reverse=True,
        )
        return {
            "storage": storage,
            "evidence_available": evidence_available,
            "data": data,
        }

    @router.get("/v1/routing/sessions/{session_id:path}/requests", response_model=None)
    def routing_session_requests(
        session_id: str,
        authorization: str | None = Header(default=None),
    ) -> dict[str, Any]:
        authorize(state.gateway_api_key, authorization)
        snapshot = state.engine.store.snapshot(session_id)
        if snapshot is None:
            raise _unknown_session(session_id)
        storage, evidence_available = _storage_state(state)
        retained: list[dict[str, Any]] = []
        if evidence_available:
            try:
                retained = state.engine.record_store.session_request_evidence(session_id)
            except (StorageUnavailableError, RuntimeError, ValueError) as error:
                storage = {**storage, "error": str(error)}
                evidence_available = False
        return {
            "session": snapshot,
            "storage": storage,
            "evidence_available": evidence_available,
            "requests": retained if evidence_available else [],
        }

    return router
