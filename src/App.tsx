import { lazy, Suspense, useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore.ts'
import { AppShell } from '@/components/layout/AppShell.tsx'
import { ToolContainer } from '@/components/layout/ToolContainer.tsx'
import { WelcomeScreen } from '@/components/WelcomeScreen.tsx'
import { ErrorBoundary } from '@/components/common/ErrorBoundary.tsx'
import { UpdateModal } from '@/components/common/UpdateModal.tsx'
import { checkForUpdate } from '@/utils/updateChecker.ts'
import type { UpdateInfo } from '@/utils/updateChecker.ts'
import type { ToolId } from '@/types/index.ts'

// Lazy-load each tool
const toolComponents: Record<ToolId, React.LazyExoticComponent<React.ComponentType>> = {
  'pdf-merge': lazy(() => import('@/tools/pdf-merge/PdfMergeTool.tsx')),
  'pdf-split': lazy(() => import('@/tools/pdf-split/PdfSplitTool.tsx')),
  'pdf-annotate': lazy(() => import('@/tools/pdf-annotate/PdfAnnotateTool.tsx')),
  'pdf-watermark': lazy(() => import('@/tools/pdf-watermark/WatermarkTool.tsx')),
  'text-extract': lazy(() => import('@/tools/text-extract/TextExtractTool.tsx')),
  'image-resizer': lazy(() => import('@/tools/image-resizer/ImageResizerTool.tsx')),
  'image-bg-remove': lazy(() => import('@/tools/image-bg-remove/BgRemoveTool.tsx')),
  'file-compressor': lazy(() => import('@/tools/file-compressor/CompressorTool.tsx')),
  'file-converter': lazy(() => import('@/tools/file-converter/ConverterTool.tsx')),
  'form-creator': lazy(() => import('@/tools/form-creator/FormCreatorTool.tsx')),
  'org-chart': lazy(() => import('@/tools/org-chart/OrgChartTool.tsx')),
  'dashboard': lazy(() => import('@/tools/dashboard/DashboardTool.tsx')),
  'flowchart': lazy(() => import('@/tools/flowchart/FlowchartTool.tsx')),
  'qr-code': lazy(() => import('@/tools/qr-code/QrCodeTool.tsx')),
  'json-csv-viewer': lazy(() => import('@/tools/json-csv-viewer/JsonCsvViewerTool.tsx')),
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-lotus-orange/30 border-t-lotus-orange rounded-full animate-spin" />
    </div>
  )
}

export default function App() {
  const activeTool = useAppStore((s) => s.activeTool)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdateModal, setShowUpdateModal] = useState(false)

  useEffect(() => {
    checkForUpdate().then((info) => {
      if (info) {
        setUpdateInfo(info)
        setShowUpdateModal(true)
      }
    })
  }, [])

  const ActiveComponent = activeTool ? toolComponents[activeTool] : null

  return (
    <AppShell>
      {ActiveComponent ? (
        <ToolContainer key={activeTool}>
          <ErrorBoundary>
            <Suspense fallback={<LoadingFallback />}>
              <ActiveComponent />
            </Suspense>
          </ErrorBoundary>
        </ToolContainer>
      ) : (
        <WelcomeScreen />
      )}
      {updateInfo && (
        <UpdateModal
          open={showUpdateModal}
          onClose={() => setShowUpdateModal(false)}
          info={updateInfo}
        />
      )}
    </AppShell>
  )
}
