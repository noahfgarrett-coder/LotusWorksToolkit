import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar.tsx'
import { Header } from './Header.tsx'
import { Toast } from '@/components/common/Toast.tsx'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-full w-full">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {children}
        </main>
      </div>
      <Toast />
    </div>
  )
}
