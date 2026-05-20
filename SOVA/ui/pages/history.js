import { useEffect, useState } from 'react'
import axios from 'axios'
import { History, Download, AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

const API = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function HistoryPage() {
  const [runs, setRuns]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [dlMap, setDlMap]           = useState({})
  const [sheetsMap, setSheetsMap]   = useState({})  // run_id -> url | 'loading'

  const fetchHistory = async () => {
    setLoading(true); setError(null)
    try {
      const res = await axios.get(`${API}/history`, { timeout: 10000 })
      setRuns(res.data)
    } catch (e) {
      setError(e.message || 'Failed to load history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchHistory() }, [])

  const handleDownload = async (run) => {
    if (!run.output_file || run.output_file === 'N/A') return
    setDlMap(m => ({ ...m, [run.id]: true }))
    try {
      const res = await axios.get(`${API}/download/${run.output_file}`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a'); a.href = url; a.download = run.output_file; a.click()
      URL.revokeObjectURL(url)
    } catch { /* silent */ } finally {
      setDlMap(m => ({ ...m, [run.id]: false }))
    }
  }

  const handleShareSheets = async (run) => {
    setSheetsMap(m => ({ ...m, [run.id]: 'loading' }))
    try {
      const res = await axios.post(`${API}/export/sheets/${run.id}`)
      setSheetsMap(m => ({ ...m, [run.id]: res.data.url }))
      window.open(res.data.url, '_blank')
    } catch (e) {
      setSheetsMap(m => ({ ...m, [run.id]: null }))
      alert(e.response?.data?.detail || 'Google Sheets export failed')
    }
  }

  const RULE_COLORS = { r1: 'text-red-400', r2: 'text-amber-400', r3: 'text-orange-400', r4: 'text-purple-400', r5: 'text-green-400' }

  return (
    <div className="max-w-7xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 animate-fade-up opacity-0" style={{ animationFillMode: 'forwards' }}>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)] mb-1">Audit Trail</div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">Run History</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">All previous validation runs stored in PostgreSQL.</p>
        </div>
        <button
          onClick={fetchHistory}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-bright)] hover:text-[var(--text-primary)] text-sm transition-all"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="text-[var(--green-primary)] animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)]">
          <AlertCircle size={15} className="text-red-400" />
          <span className="text-sm text-red-300">{error}</span>
        </div>
      )}

      {!loading && !error && runs.length === 0 && (
        <div className="card p-16 text-center">
          <History size={32} className="text-[var(--text-dim)] mx-auto mb-3" />
          <div className="font-display font-semibold text-[var(--text-muted)]">No Runs Yet</div>
          <div className="text-sm text-[var(--text-dim)] mt-1">Run a validation from the Dashboard to see history here.</div>
        </div>
      )}

      {!loading && runs.length > 0 && (
        <div className="card overflow-hidden animate-fade-up opacity-0 stagger-1" style={{ animationFillMode: 'forwards' }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]">
                {['Run #', 'Timestamp', 'SO File', 'Total SOs', 'Exceptions', 'R1', 'R2', 'R3', 'R4', 'R5', 'Skipped', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, i) => (
                <tr
                  key={run.id}
                  className="trow border-b border-[var(--border)] animate-fade-up opacity-0"
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'forwards' }}
                >
                  <td className="px-4 py-3 font-mono text-xs text-green-400">#{run.id}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] font-mono whitespace-nowrap">
                    {new Date(run.run_timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)] max-w-[10rem] truncate">{run.so_file_name}</td>
                  <td className="px-4 py-3 text-xs font-mono text-[var(--text-primary)]">{run.total_sos}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-bold text-amber-400">{run.total_exceptions}</span>
                  </td>
                  {['r1_count','r2_count','r3_count','r4_count','r5_count'].map((k, ci) => (
                    <td key={k} className={clsx('px-4 py-3 text-xs font-mono', Object.values(RULE_COLORS)[ci])}>
                      {run[k]}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-xs font-mono text-[var(--text-dim)]">
                    {run.skipped_rules || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Google Sheets export */}
                      <button
                        onClick={() =>
                          sheetsMap[run.id] && sheetsMap[run.id] !== 'loading'
                            ? window.open(sheetsMap[run.id], '_blank')
                            : handleShareSheets(run)
                        }
                        disabled={sheetsMap[run.id] === 'loading'}
                        title="Share to Google Sheets"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgba(66,133,244,0.08)] hover:bg-[rgba(66,133,244,0.18)] border border-[var(--border)] text-[#4285F4] text-xs transition-all disabled:opacity-50"
                      >
                        {sheetsMap[run.id] === 'loading'
                          ? <Loader2 size={11} className="animate-spin" />
                          : <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zM7 17H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V7h2v2zm10 8H9v-2h8v2zm0-4H9v-2h8v2zm0-4H9V7h8v2z"/></svg>
                        }
                        {sheetsMap[run.id] && sheetsMap[run.id] !== 'loading' ? '↗' : 'Sheets'}
                      </button>

                      {/* Excel download */}
                      {run.output_file && run.output_file !== 'N/A' && (
                        <button
                          onClick={() => handleDownload(run)}
                          disabled={dlMap[run.id]}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgba(35,150,96,0.1)] hover:bg-[rgba(35,150,96,0.2)] border border-[var(--border)] text-green-400 text-xs transition-all disabled:opacity-50"
                        >
                          {dlMap[run.id]
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Download size={11} />
                          }
                          .xlsx
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
