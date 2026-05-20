export function downloadCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h] ?? ''
        const str = String(val).replace(/"/g, '""')
        return str.includes(',') || str.includes('\n') || str.includes('"')
          ? `"${str}"`
          : str
      }).join(',')
    ),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function printToPDF(title: string) {
  const originalTitle = document.title
  document.title = title
  window.print()
  document.title = originalTitle
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '')
}
