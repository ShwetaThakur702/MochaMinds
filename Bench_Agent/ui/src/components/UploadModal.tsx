import { useCallback, useRef, useState } from 'react'

interface Props {
  uploading: boolean
  onUpload: (file: File) => Promise<void>
  onClose: () => void
}

const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isAccepted(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.csv') ||
    ACCEPTED_MIME.includes(file.type)
  )
}

export default function UploadModal({ uploading, onUpload, onClose }: Props) {
  const [dragging, setDragging]   = useState(false)
  const [selected, setSelected]   = useState<File | null>(null)
  const [typeError, setTypeError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const pickFile = useCallback((file: File) => {
    if (!isAccepted(file)) {
      setTypeError(true)
      setSelected(null)
      return
    }
    setTypeError(false)
    setSelected(file)
  }, [])

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) pickFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) pickFile(file)
    e.target.value = ''
  }

  async function handleUpload() {
    if (!selected || uploading) return
    await onUpload(selected)
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="upload-modal-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Upload RIS File</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="2" y1="2" x2="14" y2="14" /><line x1="14" y1="2" x2="2" y2="14" />
            </svg>
          </button>
        </div>

        {/* Drop zone */}
        <div
          className={`upload-dropzone ${dragging ? 'upload-dropzone-active' : ''} ${selected ? 'upload-dropzone-has-file' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !selected && inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && !selected && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            style={{ display: 'none' }}
            onChange={handleInputChange}
          />

          {selected ? (
            <div className="upload-file-preview">
              <span className="upload-file-icon">
                {selected.name.endsWith('.csv') ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="8" y1="13" x2="16" y2="13"/>
                    <line x1="8" y1="17" x2="16" y2="17"/>
                    <line x1="8" y1="9" x2="10" y2="9"/>
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <rect x="8" y="12" width="8" height="6" rx="1"/>
                    <line x1="11" y1="12" x2="11" y2="18"/>
                    <line x1="8" y1="15" x2="16" y2="15"/>
                  </svg>
                )}
              </span>
              <div className="upload-file-info">
                <span className="upload-file-name">{selected.name}</span>
                <span className="upload-file-size">{formatBytes(selected.size)}</span>
              </div>
              <button
                className="upload-file-clear"
                onClick={e => { e.stopPropagation(); setSelected(null); setTypeError(false) }}
                aria-label="Remove file"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <line x1="2" y1="2" x2="14" y2="14" /><line x1="14" y1="2" x2="2" y2="14" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="upload-dropzone-prompt">
              <span className="upload-dropzone-icon">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16"/>
                  <line x1="12" y1="12" x2="12" y2="21"/>
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                </svg>
              </span>
              <p className="upload-dropzone-label">
                {dragging ? 'Drop it here' : 'Drag & drop your file here'}
              </p>
              <p className="upload-dropzone-sub">or <span className="upload-browse-link">browse to upload</span></p>
              <p className="upload-dropzone-types">Accepts .xlsx and .csv</p>
            </div>
          )}
        </div>

        {typeError && (
          <p className="upload-type-error">Only .xlsx and .csv files are supported.</p>
        )}

        {/* Footer actions */}
        <div className="upload-modal-footer">
          <button className="upload-modal-cancel" onClick={onClose} disabled={uploading}>
            Cancel
          </button>
          <button
            className={`upload-modal-submit ${uploading ? 'upload-modal-submit-loading' : ''}`}
            onClick={handleUpload}
            disabled={!selected || uploading}
          >
            {uploading ? (
              <>
                <span className="upload-spinner" />
                Processing…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="8 2 8 10"/><polyline points="4 6 8 2 12 6"/>
                  <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1"/>
                </svg>
                Upload
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}
