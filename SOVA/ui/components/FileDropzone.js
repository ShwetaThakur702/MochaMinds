import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X } from 'lucide-react'
import clsx from 'clsx'

export default function FileDropzone({ label, file, onFile, accept = '.xlsx' }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      className={clsx('drop-zone p-6 cursor-pointer select-none transition-all', dragging && 'active')}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      {file ? (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[rgba(35,150,96,0.15)] flex items-center justify-center">
            <FileSpreadsheet size={20} className="text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--text-primary)] truncate">{file.name}</div>
            <div className="text-xs text-[var(--text-muted)]">{(file.size / 1024).toFixed(0)} KB · Excel</div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onFile(null) }}
            className="w-7 h-7 rounded-full hover:bg-[rgba(120,120,120,0.1)] flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-[var(--text-muted)]" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-2">
          <div className="w-12 h-12 rounded-xl border border-[var(--border-bright)] flex items-center justify-center">
            <Upload size={20} className="text-[var(--green-primary)]" />
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
            <div className="text-xs text-[var(--text-dim)] mt-1">Drag & drop or click to browse · .xlsx</div>
          </div>
        </div>
      )}
    </div>
  )
}
