import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useRef, useEffect } from 'react'
import './Breadcrumb.css'

// 全局缓存项目名称，避免重复请求和闪烁
const projectNameCache = {}

function Breadcrumb() {
  const location = useLocation()
  const navigate = useNavigate()
  const fromProjectRef = useRef(null)

  const pathSegments = location.pathname.split('/').filter(Boolean)

  // 从项目列表进入项目详情时缓存名称
  useEffect(() => {
    if (location.state?.fromProject) {
      fromProjectRef.current = location.state.fromProject
      projectNameCache[location.state.fromProject.id] = location.state.fromProject.name
    }
    if (location.state?.projectName && pathSegments[0] === 'projects' && pathSegments[1]) {
      projectNameCache[pathSegments[1]] = location.state.projectName
    }
    if (pathSegments[0] !== 'files') {
      fromProjectRef.current = null
    }
  }, [location])

  if (pathSegments.length === 0 || (pathSegments.length === 1 && pathSegments[0] === 'dashboard')) {
    return null
  }

  const buildCrumbs = () => {
    const crumbs = []
    const fromProject = fromProjectRef.current

    if (pathSegments[0] === 'projects') {
      crumbs.push({ label: '项目列表', path: '/projects' })
      if (pathSegments[1]) {
        const name = projectNameCache[pathSegments[1]]
        // 没有缓存时不显示项目名，避免闪烁
        if (name) {
          crumbs.push({ label: name, path: `/projects/${pathSegments[1]}` })
        }
      }
    } else if (pathSegments[0] === 'files') {
      if (fromProject) {
        crumbs.push({ label: '项目列表', path: '/projects' })
        crumbs.push({ label: fromProject.name, path: `/projects/${fromProject.id}` })
      }
      crumbs.push({ label: '文件管理', path: '/files' })

      const fileParts = pathSegments.slice(1)
      fileParts.forEach((part, i) => {
        const fullPath = '/files/' + fileParts.slice(0, i + 1).join('/')
        crumbs.push({ label: decodeURIComponent(part), path: fullPath })
      })
    } else if (pathSegments[0] === 'terminal') {
      crumbs.push({ label: '服务器终端', path: '/terminal' })
    } else {
      crumbs.push({ label: pathSegments[0], path: `/${pathSegments[0]}` })
    }

    return crumbs
  }

  const crumbs = buildCrumbs()

  return (
    <nav className="breadcrumb" aria-label="breadcrumb">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1
        return (
          <span key={crumb.path + index} className="breadcrumb-item">
            {index > 0 && <ChevronRight size={14} className="breadcrumb-separator" />}
            {isLast ? (
              <span className="breadcrumb-current">{crumb.label}</span>
            ) : (
              <button className="breadcrumb-link" onClick={() => navigate(crumb.path)}>
                {crumb.label}
              </button>
            )}
          </span>
        )
      })}
    </nav>
  )
}

export default Breadcrumb
