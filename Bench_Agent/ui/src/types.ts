export interface ExclusionAudit {
  total_input_rows: number
  excluded_on_leave: number
  excluded_bz: number
  excluded_d_rated: number
  excluded_exit: number
  excluded_resignation: number
  excluded_campus_no_fbd: number
  excluded_cao_new: number
  total_excluded: number
  deployable_bench_count: number
}

export interface SnapshotData {
  total_headcount: number
  run_date: string
  status_counts: Record<string, number>
  current_vs_future: Record<string, number>
  aging_distribution: Record<string, number>
  by_location: Record<string, number>
  exclusion_audit?: ExclusionAudit
  skill_rating_distribution?: Record<string, number>
  skill_staleness?: Record<string, number>
  grade_supply?: Record<string, number>
  grade_demand?: Record<string, number>
}

export type MatchConfidence = 'HIGH' | 'LOW' | 'NONE'

export interface ForecastRow {
  forecast_date: string
  days_from_today: number
  total_forecast_bench: number
  confirmed_count: number
  projected_count: number
  forecast_confidence_band: string
  bucket: string
}

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'OK'

export interface AlertRow {
  org_slice: string
  current_bench_count: number
  bench_threshold: number
  breach_amount: number
  is_breached: boolean
  alert_severity: AlertSeverity
  recommended_action: string
  run_date: string
  bench_psids?: string[]
}

export interface FreezeRow {
  skill: string
  bench_count: number
  near_term_releases: number
  total_supply: number
  open_demand_count: number
  supply_surplus: number
  freeze_recommended: boolean
  avg_skill_rating: number | null
  advisory_note: string
  run_date: string
  llm_narrative?: string
  coverage_ratio?: number
  understaffing_severity?: string
  endorsed_match_count?: number
  stale_match_count?: number
  endorsement_pending_count?: number
  match_confidence?: MatchConfidence
  supply_psids?: string[]
}

export type ActionPriority = 'IMMEDIATE' | '7-DAY' | '30-DAY'

export interface ActionItem {
  rule: string
  priority: ActionPriority
  owner: string
  action: string
  rationale: string
  run_date: string
}

export interface RmNudge {
  nudge_id: number
  category: string
  org_slice_or_skill: string
  nudge_text: string
  supporting_data: Record<string, number | string>
  run_date: string
  email_subject: string
  email_body: string
  urgency: 'HIGH' | 'MEDIUM'
}

export type CoverageLabel = 'FULL' | 'PARTIAL' | 'NONE'

export interface DeploymentMatch {
  skill: string
  bench_count: number
  open_demand_count: number
  matched_count: number
  endorsed_match_count: number
  stale_match_count: number
  endorsement_pending_count: number
  match_confidence: MatchConfidence
  gap: number
  coverage_pct: number
  coverage_label: CoverageLabel
  run_date: string
}

export interface NotificationItem {
  id: number
  type: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  message: string
  timestamp: string
  read: boolean
}

export interface DigestData {
  run_date: string
  total_bench: number
  at_risk_count: number
  nafd_count: number
  nafd_pct: number
  proposed_count: number
  breached_slices: string[]
  forecasted_breach_slices: string[]
  freeze_recommended_skills: string[]
  combined_surplus: number
  bench_7d_forecast: number
  bench_30d_forecast: number
  aging_breakdown: Record<string, number>
  top_3_org_slices: Record<string, number>
  summary_text: string
}
