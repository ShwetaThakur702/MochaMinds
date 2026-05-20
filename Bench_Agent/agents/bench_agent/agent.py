"""
Bench Agent — LangGraph StateGraph (Phase 5e)

Node order:
  load_data → preprocess → apply_exclusions → engineer_features
  → run_r1 → run_r2 → run_r3 → run_r4_rules → run_r4_llm
  → run_action_advisor → persist_outputs

TC2 COMPLIANCE: run_r4_llm sends only aggregated skill-level stats to the LLM.
No Emplid, no employee names, no individual rows leave this process.

Environment variables (all loaded from .env):
  LLM_MODEL       — OpenAI model name (default: gpt-4o-mini)
  OPENAI_API_KEY  — API key (required for live LLM calls)
  OPENAI_API_BASE — API base URL (default: https://api.openai.com/v1)
  MOCK_LLM        — Set to "true" to skip the real LLM call (default: false)
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any, TypedDict

import pandas as pd
from dotenv import load_dotenv
from langgraph.graph import END, StateGraph

# ---------------------------------------------------------------------------
# Path resolution — ensure project root is importable regardless of CWD
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from agents.bench_agent.prompts import HIRING_FREEZE_PROMPT
from output.excel_writer import write_output
from pipeline.persistence import save_alerts, save_forecast, save_snapshot
from pipeline.exclusion_filters import apply_exclusion_filters
from pipeline.feature_engineering import engineer_features
from pipeline.ingestion import load_all
from pipeline.preprocessing import preprocess_ris
from pipeline.r1_bench_snapshot import compute_bench_snapshot
from pipeline.r2_forecast import compute_bucket_summary, compute_daily_forecast
from pipeline.r3_threshold import compute_threshold_alerts
from pipeline.r4_hiring_freeze import compute_hiring_freeze, compute_deployment_matches
from pipeline.action_advisor import run_action_advisor

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Config — all overridable via .env; model is the only thing that changes
# between evaluator runs
# ---------------------------------------------------------------------------
LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
MOCK_LLM: bool = os.getenv("MOCK_LLM", "false").lower() == "true"
_OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
_OPENAI_API_BASE: str = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")


# ---------------------------------------------------------------------------
# State schema
# ---------------------------------------------------------------------------
class AgentState(TypedDict, total=False):
    raw_data: dict
    ris_df: Any
    deployable_bench_df: Any
    excluded_df: Any
    enriched_bench_df: Any
    r1_snapshot: dict
    r2_daily_forecast_df: Any
    r2_bucket_summary_df: Any
    r3_alerts_df: Any
    r4_freeze_df: Any
    action_items: Any


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

_BATCH_SIZE = 4  # Max skills per LLM call to stay within free-tier token budget


def _format_batch_summary(batch_rows: pd.DataFrame) -> str:
    """Compact TC2-compliant summary for one batch of skills — no PII."""
    parts = []
    for _, row in batch_rows.iterrows():
        parts.append(
            f"{row['skill']} supply={int(row['total_supply'])} demand={int(row['open_demand_count'])}"
        )
    return ", ".join(parts)


def _build_batch_prompt(batch_rows: pd.DataFrame) -> str:
    """Build an explicit JSON-template prompt that fits in ~83 prompt tokens."""
    skills = list(batch_rows["skill"])
    template = "{" + ",".join(f'"{s}":"..."' for s in skills) + "}"
    summary = _format_batch_summary(batch_rows)
    return HIRING_FREEZE_PROMPT.format(template=template, supply_demand_summary=summary)


def _mock_llm_response(freeze_rows: pd.DataFrame) -> dict:
    """Return a structurally valid dict response without calling the real LLM."""
    result: dict[str, str] = {}
    for _, row in freeze_rows.iterrows():
        surplus = int(row["supply_surplus"])
        if surplus > 5:
            action = "Pause hiring immediately"
        elif surplus >= 3:
            action = "Pause hiring 30 days"
        else:
            action = "Pause hiring 60 days"
        result[row["skill"]] = action
    return result


def _call_llm_batch(batch_rows: pd.DataFrame) -> dict:
    """Call LLM for one batch of skills. Returns {skill: advisory} dict.

    TC2: only aggregated supply/demand stats sent — no PII.
    """
    from langchain_core.messages import HumanMessage
    from langchain_openai import ChatOpenAI

    prompt = _build_batch_prompt(batch_rows)
    llm = ChatOpenAI(
        model=LLM_MODEL,
        openai_api_key=_OPENAI_API_KEY,
        openai_api_base=_OPENAI_API_BASE,
        temperature=0,
        max_tokens=50,
        default_headers={
            "HTTP-Referer": "http://localhost",
            "X-Title": "BenchAgent",
        },
        request_timeout=30,
    )
    content = llm.invoke([HumanMessage(content=prompt)]).content.strip()

    # Strip markdown fences
    if content.startswith("```"):
        content = content.split("```", 2)[1]
        if content.startswith("json"):
            content = content[4:]
        content = content.rsplit("```", 1)[0].strip()

    parsed = json.loads(content)
    return {str(k): str(v) for k, v in parsed.items()} if isinstance(parsed, dict) else {}


def _call_llm(freeze_rows: pd.DataFrame) -> dict:
    """Call LLM in batches of _BATCH_SIZE. Returns merged {skill: advisory} dict.

    TC2: only aggregated skill-level stats are sent — no PII.
    Falls back silently; callers must handle exceptions.
    """
    if MOCK_LLM:
        logger.warning("MOCK_LLM=true — returning mock LLM response (no API call made)")
        return _mock_llm_response(freeze_rows)

    narrative_map: dict[str, str] = {}
    rows_list = [freeze_rows.iloc[i:i+_BATCH_SIZE] for i in range(0, len(freeze_rows), _BATCH_SIZE)]
    logger.info("run_r4_llm: calling model=%s, %d batch(es) of ≤%d skills", LLM_MODEL, len(rows_list), _BATCH_SIZE)

    for batch_idx, batch in enumerate(rows_list):
        try:
            result = _call_llm_batch(batch)
            narrative_map.update(result)
            logger.info("run_r4_llm: batch %d/%d — got %d narratives", batch_idx + 1, len(rows_list), len(result))
        except Exception as exc:
            logger.warning("run_r4_llm: batch %d failed (%s) — will use advisory_note for these skills", batch_idx + 1, exc)

    return narrative_map


# ---------------------------------------------------------------------------
# Node functions
# ---------------------------------------------------------------------------

def load_data(state: AgentState) -> dict:
    logger.info("=== Node: load_data ===")
    raw = load_all()
    logger.info("load_data: loaded %d source datasets", len(raw))
    return {"raw_data": raw}


def preprocess(state: AgentState) -> dict:
    logger.info("=== Node: preprocess ===")
    ris_df = preprocess_ris(state["raw_data"]["ris"])
    return {"ris_df": ris_df}


def apply_exclusions(state: AgentState) -> dict:
    logger.info("=== Node: apply_exclusions ===")
    deployable, excluded, _ = apply_exclusion_filters(state["ris_df"])
    logger.info(
        "apply_exclusions: deployable=%d  excluded=%d",
        len(deployable), len(excluded),
    )
    return {"deployable_bench_df": deployable, "excluded_df": excluded}


def engineer_features_node(state: AgentState) -> dict:
    logger.info("=== Node: engineer_features ===")
    enriched = engineer_features(
        state["deployable_bench_df"],
        state["raw_data"]["threshold"],
    )
    return {"enriched_bench_df": enriched}


def run_r1(state: AgentState) -> dict:
    logger.info("=== Node: run_r1 ===")
    snapshot = compute_bench_snapshot(state["enriched_bench_df"])
    logger.info("run_r1: headcount=%d", snapshot["total_headcount"])
    return {"r1_snapshot": snapshot}


def run_r2(state: AgentState) -> dict:
    logger.info("=== Node: run_r2 ===")
    daily = compute_daily_forecast(state["enriched_bench_df"])
    bucket = compute_bucket_summary(daily)
    return {"r2_daily_forecast_df": daily, "r2_bucket_summary_df": bucket}


def run_r3(state: AgentState) -> dict:
    logger.info("=== Node: run_r3 ===")
    alerts = compute_threshold_alerts(
        state["enriched_bench_df"],
        state["raw_data"]["threshold"],
    )
    logger.info("run_r3: %d org slices evaluated", len(alerts))
    return {"r3_alerts_df": alerts}


def run_r4_rules(state: AgentState) -> dict:
    logger.info("=== Node: run_r4_rules ===")
    freeze_df = compute_hiring_freeze(
        state["enriched_bench_df"],
        state["raw_data"]["so_ageing"],
        state["raw_data"]["skill"],
    )
    freeze_count = int(freeze_df["freeze_recommended"].sum())
    logger.info("run_r4_rules: %d skills analysed, %d freeze recommended", len(freeze_df), freeze_count)
    return {"r4_freeze_df": freeze_df}


def run_r4_llm(state: AgentState) -> dict:
    """Add LLM-generated narrative to the hiring freeze DataFrame.

    TC2: only aggregated skill-level stats are sent to the LLM.
    Falls back to rule-based advisory_note on any error.
    """
    logger.info("=== Node: run_r4_llm (model=%s, mock=%s) ===", LLM_MODEL, MOCK_LLM)
    freeze_df = state["r4_freeze_df"].copy()

    # Only freeze-recommended rows are sent to the LLM
    freeze_rows = freeze_df[freeze_df["freeze_recommended"] == True].copy()

    if freeze_rows.empty:
        logger.info("run_r4_llm: no freeze-recommended skills — skipping LLM, using advisory_note")
        freeze_df["llm_narrative"] = freeze_df["advisory_note"]
        return {"r4_freeze_df": freeze_df}

    # _call_llm batches the rows and returns {skill: advisory} — TC2: no PII sent
    narrative_map = _call_llm(freeze_rows)
    logger.info("run_r4_llm: received narratives for %d/%d skills", len(narrative_map), len(freeze_rows))

    # Use LLM output where available, advisory_note as fallback
    freeze_df["llm_narrative"] = freeze_df.apply(
        lambda row: narrative_map.get(row["skill"], row["advisory_note"]),
        axis=1,
    )

    return {"r4_freeze_df": freeze_df}


def run_action_advisor_node(state: AgentState) -> dict:
    logger.info("=== Node: run_action_advisor ===")
    items = run_action_advisor(
        enriched_bench_df=state["enriched_bench_df"],
        r1_snapshot=state["r1_snapshot"],
        r2_daily_forecast_df=state["r2_daily_forecast_df"],
        r3_alerts_df=state["r3_alerts_df"],
        r4_freeze_df=state["r4_freeze_df"],
    )
    logger.info("run_action_advisor: %d action items generated", len(items))
    return {"action_items": items}


def persist_outputs(state: AgentState) -> dict:
    """Write Excel output and persist to PostgreSQL (Phase 6)."""
    logger.info("=== Node: persist_outputs ===")
    raw = load_all()
    deployment_df = compute_deployment_matches(
        state["enriched_bench_df"], raw["so_ageing"], raw["skill"]
    )
    out_path = write_output(
        dashboard_df=state["enriched_bench_df"],
        forecast_df=state["r2_daily_forecast_df"],
        alerts_df=state["r3_alerts_df"],
        freeze_df=state["r4_freeze_df"],
        deployment_df=deployment_df,
    )
    logger.info("persist_outputs: Excel written → %s", out_path)

    save_snapshot(state["r1_snapshot"])
    save_forecast(state["r2_daily_forecast_df"])
    save_alerts(state["r3_alerts_df"], state["r4_freeze_df"])
    return {}


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """Construct and compile the LangGraph StateGraph."""
    graph = StateGraph(AgentState)

    graph.add_node("load_data",          load_data)
    graph.add_node("preprocess",         preprocess)
    graph.add_node("apply_exclusions",   apply_exclusions)
    graph.add_node("engineer_features",  engineer_features_node)
    graph.add_node("run_r1",             run_r1)
    graph.add_node("run_r2",             run_r2)
    graph.add_node("run_r3",             run_r3)
    graph.add_node("run_r4_rules",       run_r4_rules)
    graph.add_node("run_r4_llm",          run_r4_llm)
    graph.add_node("run_action_advisor",  run_action_advisor_node)
    graph.add_node("persist_outputs",     persist_outputs)

    graph.set_entry_point("load_data")

    graph.add_edge("load_data",         "preprocess")
    graph.add_edge("preprocess",        "apply_exclusions")
    graph.add_edge("apply_exclusions",  "engineer_features")
    graph.add_edge("engineer_features", "run_r1")
    graph.add_edge("run_r1",            "run_r2")
    graph.add_edge("run_r2",            "run_r3")
    graph.add_edge("run_r3",            "run_r4_rules")
    graph.add_edge("run_r4_rules",      "run_r4_llm")
    graph.add_edge("run_r4_llm",         "run_action_advisor")
    graph.add_edge("run_action_advisor", "persist_outputs")
    graph.add_edge("persist_outputs",    END)

    compiled = graph.compile()
    logger.info("LangGraph StateGraph compiled successfully — 11 nodes connected")
    return compiled


# Module-level compiled graph (importable by FastAPI layer in Phase 8)
compiled_graph = build_graph()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_pipeline() -> AgentState:
    """Execute the full pipeline and return the final state."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logger.info("Starting Bench Agent pipeline (LLM_MODEL=%s, MOCK_LLM=%s)", LLM_MODEL, MOCK_LLM)
    final_state: AgentState = compiled_graph.invoke({})
    logger.info("Pipeline complete.")
    return final_state


if __name__ == "__main__":
    run_pipeline()
