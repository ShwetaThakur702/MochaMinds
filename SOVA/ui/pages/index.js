import { useState } from 'react'
import Head from 'next/head'
import axios from 'axios'
import { Play, Download, ChevronDown, AlertCircle, CheckCircle, Loader2, Terminal, X, Sheet } from 'lucide-react'
import clsx from 'clsx'
import Sidebar from '../components/Sidebar'
import StatCard from '../components/StatCard'
import FileDropzone from '../components/FileDropzone'
import ExceptionsTable from '../components/ExceptionsTable'
import RuleChart from '../components/RuleChart'
import HistoryPage from './history'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function Home() {
  const [page, setPage] = useState('validate')
  const [soFile, setSoFile] = useState(null)
  const [risFile, setRisFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [showLogs, setShowLogs] = useState(false)
  const [dlLoading, setDlLoading] = useState(false)
  const [sheetsLoading, setSheetsLoading] = useState(false)
  const [sheetsUrl, setSheetsUrl] = useState(null)

  const canRun = soFile && risFile && !loading

  const handleValidate = async () => {
    if (!canRun) return
    setLoading(true)
    setError(null)
    setResult(null)

    const form = new FormData()
    form.append('so_file', soFile)
    form.append('ris_file', risFile)

    try {
      const res = await axios.post(`${API}/validate`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      })
      setResult(res.data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message || 'Validation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    if (!result?.summary?.output_path) return
    setDlLoading(true)
    try {
      const filename = result.summary.output_path.split(/[\\/]/).pop()
      const res = await axios.get(`${API}/download/${filename}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Download failed')
    } finally {
      setDlLoading(false)
    }
  }

  const handleShareSheets = async () => {
    if (!result) return
    setSheetsLoading(true)
    setSheetsUrl(null)
    try {
      const res = await axios.post(`${API}/export/sheets`, {
        summary: result.summary,
        exceptions: result.exceptions,
        run_id: result.run_id,
      })
      setSheetsUrl(res.data.url)
      window.open(res.data.url, '_blank')
    } catch (e) {
      setError(e.response?.data?.detail || 'Google Sheets export failed')
    } finally {
      setSheetsLoading(false)
    }
  }

  const summary = result?.summary
  const exceptions = result?.exceptions || []
  const logs = result?.logs || []

  return (
    <>
      <Head>
        <title>SOVA — SO Validity Agent</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="flex min-h-screen grid-bg">
        <Sidebar page={page} setPage={setPage} />

        <main className="flex-1 overflow-y-auto">
          {page === 'history' ? (
            <HistoryPage API={API} />
          ) : (
            <div className="max-w-7xl mx-auto px-8 py-8">

              {/* Header */}
              <div className="flex items-start justify-between mb-8 animate-fade-up opacity-0" style={{ animationFillMode: 'forwards' }}>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-1">
                    ITC Infotech · Hackathon 2026
                  </div>
                  <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
                    SO Validity Dashboard
                  </h1>
                  <p className="text-sm text-[var(--text-muted)] mt-1">
                    Validate Staffing Orders against R1–R5 business rules automatically.
                  </p>
                </div>
                {summary && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={sheetsUrl ? () => window.open(sheetsUrl, '_blank') : handleShareSheets}
                      disabled={sheetsLoading}
                      title={sheetsUrl ? 'Exported! Click to open' : 'Share to Google Sheets'}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] hover:border-[rgba(66,133,244,0.6)] bg-[rgba(66,133,244,0.08)] hover:bg-[rgba(66,133,244,0.15)] text-[#4285F4] text-sm font-medium transition-all disabled:opacity-60"
                    >
                      {sheetsLoading
                        ? <Loader2 size={15} className="animate-spin" />
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zM7 17H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V7h2v2zm10 8H9v-2h8v2zm0-4H9v-2h8v2zm0-4H9V7h8v2z" /></svg>
                      }
                      {sheetsUrl ? 'Open Sheet ↗' : sheetsLoading ? 'Exporting...' : 'Share to Sheets'}
                    </button>
                    <button
                      onClick={handleDownload}
                      disabled={dlLoading}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--green-primary)] hover:bg-[var(--green-light)] text-white text-sm font-medium transition-all shadow-glow disabled:opacity-60"
                    >
                      {dlLoading
                        ? <Loader2 size={15} className="animate-spin" />
                        : <Download size={15} />
                      }
                      Export Report
                    </button>
                  </div>
                )}
              </div>

              {/* Upload Panel */}
              {!result && (
                <div className="card p-6 mb-6 animate-fade-up opacity-0 stagger-1" style={{ animationFillMode: 'forwards' }}>
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-4">
                    Input Files
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <FileDropzone
                      label="SO Ageing File"
                      file={soFile}
                      onFile={setSoFile}
                    />
                    <FileDropzone
                      label="RIS Data File"
                      file={risFile}
                      onFile={setRisFile}
                    />
                  </div>
                  <button
                    onClick={handleValidate}
                    disabled={!canRun}
                    className={clsx(
                      'w-full flex items-center justify-center gap-3 py-3.5 rounded-xl text-sm font-semibold transition-all',
                      canRun
                        ? 'bg-[var(--green-primary)] hover:bg-[var(--green-light)] text-white shadow-glow'
                        : 'bg-[var(--bg-card-hover)] text-[var(--text-dim)] cursor-not-allowed'
                    )}
                  >
                    {loading
                      ? <><Loader2 size={16} className="animate-spin" /> Running Validation...</>
                      : <><Play size={16} /> Run Validation</>
                    }
                  </button>
                </div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="card p-10 flex flex-col items-center gap-4 animate-fade-in opacity-0" style={{ animationFillMode: 'forwards' }}>
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full border-2 border-[var(--border)] flex items-center justify-center">
                      <Loader2 size={28} className="text-[var(--green-primary)] animate-spin" />
                    </div>
                    <div className="absolute inset-0 rounded-full border-2 border-[var(--green-primary)] opacity-20 animate-ping" />
                  </div>
                  <div className="text-center">
                    <div className="font-display font-semibold text-[var(--text-primary)]">Validating SOs...</div>
                    <div className="text-sm text-[var(--text-muted)] mt-1">Running R1–R5 rule engine against your data</div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] mb-6 animate-fade-in opacity-0" style={{ animationFillMode: 'forwards' }}>
                  <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 text-sm text-red-300">{error}</div>
                  <button onClick={() => setError(null)}><X size={14} className="text-red-400" /></button>
                </div>
              )}

              {/* Results */}
              {result && !loading && (
                <>
                  {/* Success banner */}
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-[rgba(35,150,96,0.08)] border border-[var(--border-bright)] mb-6 animate-fade-in opacity-0" style={{ animationFillMode: 'forwards' }}>
                    <CheckCircle size={16} className="text-[var(--green-primary)] flex-shrink-0" />
                    <span className="text-sm text-[var(--green-primary)] font-semibold">Validation complete — {summary.run_date}</span>
                    <span className="ml-auto text-xs font-semibold text-[var(--text-dim)] mr-2">
                      {summary.so_file} · {summary.ris_file}
                    </span>
                    <button
                      onClick={() => { setResult(null); setSoFile(null); setRisFile(null) }}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(59,130,246,0.3)] border border-blue-400 hover:bg-blue-400 hover:scale-105 transition-all"
                    >
                      <Play size={12} fill="currentColor" />
                      New Run
                    </button>
                  </div>

                  {/* Skipped rules warning */}
                  {summary.skipped_rules?.length > 0 && (
                    <div className="flex items-start gap-3 p-4 rounded-xl bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.2)] mb-6">
                      <AlertCircle size={15} className="text-amber-400 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-amber-300">
                        Rules skipped (missing reference files): <strong>{summary.skipped_rules.join(', ')}</strong>
                      </span>
                    </div>
                  )}

                  {/* KPI Row 1 */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <StatCard label="Total SO Validated" value={summary.total_sos} accent="blue" delay={50} />
                    <StatCard label="Total Exceptions" value={summary.total_exceptions} accent="amber" delay={100} />
                    <StatCard label="Rejected Rows" value={summary.rejected_rows} accent="red" delay={150} />
                    <StatCard label="Skipped Rules" value={summary.skipped_rules?.join(', ') || 'None'} accent="green" delay={200} />
                  </div>

                  {/* Chart Row */}
                  <div className="mb-6">
                    <RuleChart summary={summary} />
                  </div>

                  {/* Exceptions table */}
                  {exceptions.length > 0
                    ? <ExceptionsTable exceptions={exceptions} />
                    : (
                      <div className="card p-10 text-center animate-fade-up opacity-0 stagger-4" style={{ animationFillMode: 'forwards' }}>
                        <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
                        <div className="font-display font-semibold text-[var(--text-primary)]">All SOs Passed</div>
                        <div className="text-sm text-[var(--text-muted)] mt-1">No exceptions found for this run.</div>
                      </div>
                    )
                  }

                  {/* Agent Logs */}
                  <div className="mt-4 card animate-fade-up opacity-0 stagger-5" style={{ animationFillMode: 'forwards' }}>
                    <button
                      className="w-full flex items-center justify-between px-6 py-4 text-left"
                      onClick={() => setShowLogs(v => !v)}
                    >
                      <div className="flex items-center gap-2">
                        <Terminal size={14} className="text-[var(--text-dim)]" />
                        <span className="text-sm font-semibold text-[var(--text-muted)]">Agent Logs</span>
                        <span className="text-xs text-[var(--text-dim)]">({logs.length})</span>
                      </div>
                      <ChevronDown size={14} className={clsx('text-[var(--text-dim)] transition-transform', showLogs && 'rotate-180')} />
                    </button>
                    {showLogs && (
                      <div className="px-6 pb-4 border-t border-[var(--border)] max-h-60 overflow-y-auto">
                        {logs.map((l, i) => (
                          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-[rgba(255,255,255,0.03)] last:border-0">
                            <span className={clsx('text-[10px] mt-0.5 flex-shrink-0',
                              l.level === 'WARNING' ? 'text-amber-500' : 'text-[var(--green-primary)]'
                            )}>
                              {l.level === 'WARNING' ? '⚠' : '✓'}
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">{l.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
