interface Props {
  count: number
  psids?: string[]
}

export default function PsidTooltip({ count, psids }: Props) {
  if (!psids?.length) {
    return <span className="num-chip">{count}</span>
  }

  return (
    <span className="psid-wrap">
      <span className="num-chip psid-trigger">{count}</span>
      <div className="psid-tooltip">
        <div className="psid-tooltip-header">PSIDs ({psids.length})</div>
        <div className="psid-tooltip-list">
          {psids.map(id => (
            <span key={id} className="psid-tag">{id}</span>
          ))}
        </div>
      </div>
    </span>
  )
}
