import { Cpu, Monitor, HardDrive, Network } from 'lucide-react'
import './MetricCard.css'

// Catmull-Rom 平滑：把折线点转换为三次贝塞尔曲线路径
function smoothPath(points) {
  if (!points.length) return ''
  if (points.length < 3) return `M${points.join(' L')}`
  const d = [`M${points[0]}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? parse(points[i - 1]) : parse(points[i])
    const p1 = parse(points[i])
    const p2 = parse(points[i + 1])
    const p3 = i < points.length - 2 ? parse(points[i + 2]) : p2
    // Catmull-Rom 控制点张力系数 / 6
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`)
  }
  return d.join(' ')

  function parse(str) {
    const [x, y] = str.split(',').map(Number)
    return { x, y }
  }
}

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
          <path
            d={smoothPath(history.map((h, i) => `${(i / (history.length - 1)) * 200},${60 - (((h.down || 0) - min) / range) * 60}`))}
            fill="none"
            stroke={color}
            strokeWidth="2"
          />
          <path
            d={smoothPath(history.map((h, i) => `${(i / (history.length - 1)) * 200},${60 - (((h.up || 0) - min) / range) * 60}`))}
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
        <path
          d={smoothPath(validHistory.map((val, i) => `${(i / (validHistory.length - 1)) * 200},${60 - ((val - min) / range) * 60}`))}
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
