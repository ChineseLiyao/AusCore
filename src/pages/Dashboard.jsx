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
      <div className="dashboard-footer">
        <img 
          src="/logo.png" 
          alt="Logo" 
          className="dashboard-logo"
        />
      </div>
    </div>
  )
}

export default Dashboard
