import axios from 'axios'
import { ActionItem, AlertRow, DeploymentMatch, DigestData, ForecastRow, FreezeRow, NotificationItem, RmNudge, SnapshotData } from './types'

const BASE = ''

export interface ApiData {
  snapshot: SnapshotData
  forecast: ForecastRow[]
  alerts: AlertRow[]
  freeze: FreezeRow[]
}

export async function fetchAll(): Promise<{ data: ApiData; offline: boolean }> {
  const [snapshot, forecast, alerts, freeze] = await Promise.all([
    axios.get<SnapshotData>(`${BASE}/api/bench/snapshot`),
    axios.get<ForecastRow[]>(`${BASE}/api/bench/forecast`),
    axios.get<AlertRow[]>(`${BASE}/api/bench/alerts`),
    axios.get<FreezeRow[]>(`${BASE}/api/bench/hiring-freeze`),
  ])
  return {
    data: {
      snapshot: snapshot.data,
      forecast: forecast.data,
      alerts: alerts.data,
      freeze: freeze.data,
    },
    offline: false,
  }
}

export async function fetchActions(): Promise<ActionItem[]> {
  const res = await axios.get<ActionItem[]>(`${BASE}/api/bench/actions`)
  return res.data
}

export async function fetchDigest(): Promise<DigestData> {
  const res = await axios.get<DigestData>(`${BASE}/api/bench/digest`)
  return res.data
}

export async function fetchNudges(): Promise<RmNudge[]> {
  const res = await axios.get<RmNudge[]>(`${BASE}/api/bench/rm-nudges`)
  return res.data
}

export async function fetchDeploymentMatches(): Promise<DeploymentMatch[]> {
  const res = await axios.get<DeploymentMatch[]>(`${BASE}/api/bench/deployment-matches`)
  return res.data
}

export interface UploadResult {
  status: string
  filename: string
  deployable_bench_count: number
  run_date: string
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const res = await axios.get<NotificationItem[]>(`${BASE}/api/bench/notifications`)
  return res.data
}

export interface TeamsResult {
  status: 'sent' | 'skipped' | 'error'
  reason?: string
  teams_status?: number
}

export async function sendToTeams(
  message: string,
  severity: string,
  action_type: string,
): Promise<TeamsResult> {
  const res = await axios.post<TeamsResult>(`${BASE}/api/bench/notify-teams`, {
    message, severity, action_type,
  })
  return res.data
}

export async function uploadRisFile(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  // Do NOT set Content-Type manually — browser must set it with the multipart boundary
  const res = await axios.post<UploadResult>(`${BASE}/api/bench/upload`, form)
  return res.data
}
