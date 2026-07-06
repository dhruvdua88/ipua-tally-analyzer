import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { currentRoute, navigate } from '@/nav'
import { Layout } from '@/components/Layout'
import { DrilldownDialog } from '@/components/DrilldownDialog'
import { Dashboard } from '@/pages/Dashboard'
import { ExceptionsPage } from '@/pages/Exceptions'
import { UploadPage } from '@/pages/Upload'
import { MappingPage } from '@/pages/Mapping'
import { TdsPage } from '@/pages/Tds'
import { AdvancesPage } from '@/pages/Advances'
import { GstReconPage } from '@/pages/GstRecon'
import { PnlBsPage } from '@/pages/PnlBs'
import { RawPreviewPage } from '@/pages/RawPreview'

export function App() {
  const [route, setRoute] = useState(currentRoute())
  const hydrate = useStore((s) => s.hydrate)
  const dataset = useStore((s) => s.dataset)
  const loading = useStore((s) => s.loading)

  useEffect(() => { hydrate() }, [hydrate])
  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Route to upload when no data (except the upload page itself)
  const effectiveRoute = !loading && !dataset && route !== 'upload' ? 'upload' : route
  useEffect(() => {
    if (!loading && !dataset && route !== 'upload') navigate('upload')
  }, [loading, dataset, route])

  const page = () => {
    if (loading) return <div className="grid place-items-center h-[60vh] text-muted text-sm">Loading…</div>
    switch (effectiveRoute) {
      case 'dashboard': return <Dashboard />
      case 'exceptions': return <ExceptionsPage />
      case 'upload': return <UploadPage />
      case 'mapping': return <MappingPage />
      case 'tds': return <TdsPage />
      case 'advances': return <AdvancesPage />
      case 'gstrecon': return <GstReconPage />
      case 'pnlbs': return <PnlBsPage />
      case 'preview': return <RawPreviewPage />
      default: return <Dashboard />
    }
  }

  return (
    <Layout route={effectiveRoute}>
      {page()}
      <DrilldownDialog />
    </Layout>
  )
}
