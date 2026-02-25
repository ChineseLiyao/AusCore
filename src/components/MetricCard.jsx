import { Cpu, Monitor, HardDrive, Network } from 'lucide-react'
import './MetricCard.css'

function MetricCard({ title, value, subtitle, uploadValue, color, icon, history = [] }) {
  const getIcon = () => {
    switch (icon) {
      case 'cpu': return <Cpu size={24} />
      case 'memory': return <Monitor size={24} />
      case 'disk': return <HardDrive size={24} />
      case 'network': return <Network size={24} />
      default: return <Monitor size={24} />
    }
  }

  const renderChart = () => {
    if (!history.length || history.length < 2) return null

    if (icon === 'network' || icon === 'disk') {
      const allValues = history.flatMap(h => [h.down || 0, h.up || 0])
      const dataMax = Math.max(...allValues, 0.1)
      const dataMin = Math.min(...allValues, 0)
      const dataRange = dataMax - dataMin
      const padding = Math.max(dataRange * 0.07, dataMax * 0.15, 0.1)
      const min = Math.max(0, dataMin - padding)
      const max = dataMax + padding
      const range = max - min

      return (
        <svg className="metric-chart" viewBox="0 0 200 60" preserveAspectRatio="none">
          <polyline
            points={history.map((h, i) => `${(i / (history.length - 1)) * 200},${60 - (((h.down || 0) - min) / range) * 60}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
          <polyline
            points={history.map((h, i) => `${(i / (history.length - 1)) * 200},${60 - (((h.up || 0) - min) / range) * 60}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="4,2"
          />
        </svg>
      )
    }

    const validHistory = history.filter(v => typeof v === 'number' && !isNaN(v))
    if (validHistory.length < 2) return null

    const dataMax = Math.max(...validHistory)
    const dataMin = Math.min(...validHistory)
    const dataRange = dataMax - dataMin
    const padding = Math.max(dataRange * 0.07, dataMax * 0.15, 1)
    const min = Math.max(0, dataMin - padding)
    const max = dataMax + padding
    const range = max - min

    return (
      <svg className="metric-chart" viewBox="0 0 200 60" preserveAspectRatio="none">
        <polyline
          points={validHistory.map((val, i) => `${(i / (validHistory.length - 1)) * 200},${60 - ((val - min) / range) * 60}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
      </svg>
    )
  }

  return (
    <div className="metric-card" style={{ borderTopColor: color }}>
      <div className="metric-header">
        <div className="metric-icon" style={{ backgroundColor: `${color}20`, color }}>
          {getIcon()}
        </div>
        <div className="metric-info">
          <div className="metric-title">{title}</div>
          <div className="metric-value">{value}</div>
          {uploadValue !== undefined && (
            <div className="metric-upload">↑ {uploadValue.toFixed(2)} MB/s</div>
          )}
        </div>
      </div>
      <div className="metric-subtitle">{subtitle}</div>
      <div className="metric-chart-container">
        {renderChart()}
      </div>
    </div>
  )
}

export default MetricCard
