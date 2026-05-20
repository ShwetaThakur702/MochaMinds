HIRING_FREEZE_PROMPT = (
    'You are a workforce advisory AI. For each skill below, bench supply exceeds open demand — '
    'write a concise 1-sentence hiring freeze recommendation. '
    'Output ONLY valid JSON in this exact template (no markdown, no extra keys): {template}. '
    'Each value must be a single sentence advising a hiring pause, stating the surplus and suggested freeze duration. '
    'Data: {supply_demand_summary}.'
)
