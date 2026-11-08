import MetricCard from '../components/MetricCard'
import './Dashboard.css'

function Dashboard({ metrics, error }) {
  return (
    <div className="dashboard-content">
      {error && <div className="error-banner">{error}</div>}
      <div className="metrics-grid">
        <MetricCard
          title="CPU"
          value={`${metrics.cpu.value.toFixed(1)}%`}
          subtitle={`Load ${metrics.cpu.load}`}
          color="hsl(354, 88%, 71%)"
          icon="cpu"
          history={metrics.cpu.history}
        />
        <MetricCard
          title="Memory"
          value={`${metrics.memory.value.toFixed(1)}%`}
          subtitle={`${metrics.memory.used} / ${metrics.memory.total}`}
          color="hsl(208, 40%, 35%)"
          icon="memory"
          history={metrics.memory.history}
        />
        <MetricCard
          title="Disk"
          value={`${metrics.disk.read.toFixed(2)}`}
          subtitle="MB/s"
          uploadValue={metrics.disk.write}
          color="hsl(343, 40%, 59%)"
          icon="disk"
          history={metrics.disk.history}
        />
        <MetricCard
          title="Network"
          value={`${metrics.network.download.toFixed(2)}`}
          subtitle="MB/s"
          uploadValue={metrics.network.upload}
          color="hsl(272, 15%, 42%)"
          icon="network"
          history={metrics.network.history}
        />
      </div>
      {/* Logo 水印背景：置于内容层之下，不拦截鼠标，不与卡片冲突 */}
      <div className="dashboard-logo-bg" aria-hidden="true">
        <img src="./logo.png" alt="" />
      </div>
    </div>
  )
}

export default Dashboard
