import { useCallback, useEffect, useState } from 'react'
import {
  fetchAll, fetchActions, fetchNudges, fetchDeploymentMatches, fetchDigest,
  fetchNotifications, uploadRisFile,
} from './api'
import Header from './components/Header'
import TabNav from './components/TabNav'
import BenchSummary from './components/BenchSummary'
import Forecast from './components/Forecast'
import ThresholdAlerts from './components/ThresholdAlerts'
import HiringFreeze from './components/HiringFreeze'
import RecommendedActions from './components/RecommendedActions'
import DeploymentMatches from './components/DeploymentMatches'
import SkillGap from './components/SkillGap'
import SkillIntelligence from './components/SkillIntelligence'
import GradeIntelligence from './components/GradeIntelligence'
import ToastContainer, { ToastMessage } from './components/Toast'
import {
  sampleSnapshot, sampleForecast, sampleAlerts, sampleFreeze,
  sampleActions, sampleNudges, sampleDeploymentMatches, sampleDigest,
} from './sampleData'
import {
  ActionItem, AlertRow, DeploymentMatch, DigestData,
  ForecastRow, FreezeRow, NotificationItem, RmNudge, SnapshotData,
} from './types'

type Tab = 'summary' | 'forecast' | 'alerts' | 'freeze' | 'actions' | 'deployment' | 'skillgap' | 'skilliq' | 'gradeiq'

let _toastCounter = 0

export default function App() {
  const [tab, setTab]           = useState<Tab>('summary')
  const [offline, setOffline]   = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [dark, setDark]         = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toasts, setToasts]     = useState<ToastMessage[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const [snapshot, setSnapshot]                   = useState<SnapshotData>(sampleSnapshot)
  const [forecast, setForecast]                   = useState<ForecastRow[]>(sampleForecast)
  const [alerts, setAlerts]                       = useState<AlertRow[]>(sampleAlerts)
  const [freeze, setFreeze]                       = useState<FreezeRow[]>(sampleFreeze)
  const [actions, setActions]                     = useState<ActionItem[]>(sampleActions)
  const [nudges, setNudges]                       = useState<RmNudge[]>(sampleNudges)
  const [deploymentMatches, setDeploymentMatches] = useState<DeploymentMatch[]>(sampleDeploymentMatches)
  const [digest, setDigest]                       = useState<DigestData>(sampleDigest)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  const refreshNotifications = useCallback(() => {
    fetchNotifications()
      .then(data => setNotifications(data))
      .catch(() => {/* non-fatal — keep stale list */})
  }, [])

  // Initial fetch + 30-second polling
  useEffect(() => {
    refreshNotifications()
    const interval = setInterval(refreshNotifications, 30_000)
    return () => clearInterval(interval)
  }, [refreshNotifications])

  function handleMarkAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  function addToast(type: ToastMessage['type'], text: string) {
    const id = ++_toastCounter
    setToasts(prev => [...prev, { id, type, text }])
  }

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const ts = () =>
    new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  // Fetch all dashboard data from the API
  const refreshAll = useCallback(() => {
    return Promise.all([
      fetchAll(),
      fetchActions(),
      fetchNudges(),
      fetchDeploymentMatches(),
      fetchDigest(),
    ]).then(([base, acts, nds, dms, dg]) => {
      setSnapshot(base.data.snapshot)
      setForecast(base.data.forecast)
      setAlerts(base.data.alerts)
      setFreeze(base.data.freeze)
      setActions(acts)
      setNudges(nds)
      setDeploymentMatches(dms)
      setDigest(dg)
      setOffline(false)
      setLastUpdated(ts())
    })
  }, [])

  // Initial load
  useEffect(() => {
    refreshAll().catch(() => {
      setOffline(true)
      setLastUpdated(ts())
    })
  }, [refreshAll])

  // Upload handler — TC1: backend saves with timestamp prefix, never touches RIS_Synthetic.xlsx
  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const result = await uploadRisFile(file)
      // Refresh all tabs with the new pipeline results
      await refreshAll()
      refreshNotifications()
      addToast(
        'success',
        `Data updated — ${result.deployable_bench_count} deployable bench employees found`,
      )
    } catch (err: unknown) {
      let msg = 'Upload failed'
      if (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof err.response === 'object' &&
        'data' in err.response &&
        err.response.data &&
        typeof err.response.data === 'object' &&
        'detail' in err.response.data
      ) {
        msg = `Upload failed — ${(err.response.data as { detail: string }).detail}`
      } else if (err instanceof Error) {
        msg = `Upload failed — ${err.message}`
      }
      addToast('error', msg)
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <Header
        offline={offline}
        lastUpdated={lastUpdated}
        dark={dark}
        onToggleDark={() => setDark(d => !d)}
        digest={digest}
        actions={actions}
        onUpload={handleUpload}
        uploading={uploading}
        notifications={notifications}
        onMarkAllRead={handleMarkAllRead}
      />
      <TabNav active={tab} onChange={(t) => setTab(t as Tab)} />

      {uploading && (
        <div className="upload-overlay">
          <div className="upload-overlay-inner">
            <span className="upload-overlay-spinner" />
            <span>Processing new data…</span>
          </div>
        </div>
      )}

      <main className="app-main">
        {tab === 'summary'    && <BenchSummary data={snapshot} />}
        {tab === 'forecast'   && <Forecast data={forecast} />}
        {tab === 'alerts'     && <ThresholdAlerts data={alerts} />}
        {tab === 'freeze'     && <HiringFreeze data={freeze} />}
        {tab === 'actions'    && <RecommendedActions actions={actions} nudges={nudges} />}
        {tab === 'deployment' && <DeploymentMatches data={deploymentMatches} />}
        {tab === 'skillgap'   && <SkillGap data={deploymentMatches} />}
        {tab === 'skilliq'    && <SkillIntelligence snapshot={snapshot} deploymentMatches={deploymentMatches} />}
        {tab === 'gradeiq'    && <GradeIntelligence snapshot={snapshot} />}
      </main>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
