import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  PieChart,
  Wifi,
  Clock,
  Heart,
  Trash2,
  Settings,
  ChevronRight,
  HardDrive,
  Smartphone,
  Tablet,
  ExternalLink,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { DriveInfo } from '../../types'

const primaryNav = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/dashboard', color: '#3b82f6' },
  { label: 'File Explorer', icon: FolderOpen, to: '/explorer/' + encodeURIComponent('C:\\'), color: '#f59e0b' },
  { label: 'Storage Analyzer', icon: PieChart, to: '/analyzer', color: '#8b5cf6' },
  { label: 'Wireless Transfer', icon: Wifi, to: '/transfer', color: '#10b981' },
]

const libraryNav = [
  { label: 'Recent Files', icon: Clock, to: '/recent', color: '#06b6d4' },
  { label: 'Favorites', icon: Heart, to: '/favorites', color: '#ec4899' },
  { label: 'Trash', icon: Trash2, to: '/trash', color: '#f97316' },
]

import { useTheme } from '../../hooks/useTheme'
import { useScan } from '../../context/ScanContext'
import { Sun, Moon } from 'lucide-react'

export function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [portableDevices, setPortableDevices] = useState<any[]>([])

  const loadStorage = () => {
    window.electronAPI?.fs.getDrives().then((res) => {
      if (res?.success && res.data) setDrives(res.data)
    })
    window.electronAPI?.fs.getConnectedDevices().then((res) => {
      if (res?.success && res.data) setPortableDevices(res.data)
    })
  }

  useEffect(() => {
    loadStorage()
    const onFocus = () => loadStorage()
    window.addEventListener('focus', onFocus)
    const interval = setInterval(loadStorage, 12000)
    return () => {
      window.removeEventListener('focus', onFocus)
      clearInterval(interval)
    }
  }, [])

  return (
    <aside
      className="w-60 flex-shrink-0 flex flex-col h-full border-r select-none transition-colors"
      style={{
        background: theme === 'light' ? 'rgba(255, 255, 255, 0.85)' : 'rgba(12, 12, 18, 0.85)',
        borderColor: theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Main Section */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider px-3 mb-2 text-gray-500">
            Navigation
          </p>
          <div className="space-y-0.5">
            {primaryNav.map((item) => (
              <SidebarItem key={item.to} {...item} />
            ))}
          </div>
        </div>

        {/* Library Section */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider px-3 mb-2 text-gray-500">
            Quick Library
          </p>
          <div className="space-y-0.5">
            {libraryNav.map((item) => (
              <SidebarItem key={item.to} {...item} />
            ))}
          </div>
        </div>

        {/* Mounted Drives */}
        {drives.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider px-3 mb-2 text-gray-500">
              Drives
            </p>
            <div className="space-y-1">
              {drives.map((d) => {
                const labelText = d.label && d.label.includes(d.letter) ? d.label : `${d.label || 'Local Disk'} (${d.letter})`
                return (
                  <NavLink
                    key={d.letter}
                    to={`/explorer/${encodeURIComponent(d.letter + '\\')}`}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-white/10 text-white font-semibold'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`
                    }
                  >
                    <HardDrive size={14} className="text-blue-400 flex-shrink-0" />
                    <span className="truncate flex-1">{labelText}</span>
                  </NavLink>
                )
              })}
            </div>
          </div>
        )}

        {/* Connected Mobile & Portable Devices (Phones, Tablets) */}
        {portableDevices.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-3 mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-purple-400">
                Connected Devices
              </p>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Device connected" />
            </div>
            <div className="space-y-1">
              {portableDevices.map((dev) => {
                const Icon = dev.type === 'tablet' ? Tablet : Smartphone
                const devRoute = `/explorer/${encodeURIComponent(`portable://${dev.name}`)}`
                const isSelected = location.pathname.includes(encodeURIComponent(dev.name))
                return (
                  <div
                    key={dev.id || dev.name}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all group ${
                      isSelected
                        ? 'bg-purple-500/20 text-white font-semibold border border-purple-500/30'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <NavLink
                      to={devRoute}
                      state={{ fromDashboard: true, initialPath: `portable://${dev.name}`, deviceName: dev.name }}
                      className="flex items-center gap-2.5 flex-1 min-w-0"
                    >
                      <div className="w-5 h-5 rounded-md bg-purple-500/20 flex items-center justify-center flex-shrink-0 text-purple-400 group-hover:scale-110 transition-transform">
                        <Icon size={12} />
                      </div>
                      <div className="truncate flex-1">
                        <p className="truncate font-medium">{dev.name}</p>
                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-emerald-400 inline-block" />
                          {dev.status || (dev.type === 'tablet' ? 'Tablet' : 'Phone')}
                        </p>
                      </div>
                    </NavLink>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        window.electronAPI?.fs.openDeviceInExplorer(dev.name)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-opacity"
                      title="Open in Windows Explorer"
                    >
                      <ExternalLink size={12} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Settings & Theme at Bottom */}
      <div className="p-3 border-t space-y-1.5" style={{ borderColor: theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)' }}>
        <SidebarItem
          label="Settings"
          icon={Settings}
          to="/settings"
          color="#94a3b8"
        />
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:bg-black/5 dark:hover:bg-white/5 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
        >
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500/10 text-amber-500 dark:bg-blue-500/10 dark:text-blue-400">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </div>
          <span className="truncate flex-1 text-left font-medium">
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 uppercase font-mono text-gray-400">
            {theme}
          </span>
        </button>
      </div>
    </aside>
  )
}

function SidebarItem({
  label,
  icon: Icon,
  to,
  color,
}: {
  label: string
  icon: any
  to: string
  color: string
}) {
  const location = useLocation()
  const { isScanning } = useScan()
  const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to + '/'))
  const isAnalyzerScanning = to === '/analyzer' && isScanning

  return (
    <NavLink to={to}>
      <motion.div
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.98 }}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
          isActive
            ? 'text-white bg-white/10 shadow-sm shadow-black/20 font-semibold'
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 font-medium'
        }`}
      >
        {isActive && (
          <motion.div
            layoutId="sidebar-active-indicator"
            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full"
            style={{ background: color }}
            transition={{ type: 'spring', stiffness: 350, damping: 30 }}
          />
        )}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: isActive ? `${color}25` : 'transparent',
            color: isActive ? color : 'inherit',
          }}
        >
          <Icon size={16} />
        </div>
        <span className="text-sm truncate flex-1">{label}</span>
        {isAnalyzerScanning && (
          <span className="flex h-2 w-2 relative flex-shrink-0" title="Analyzing in background...">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
        )}
        {isActive && !isAnalyzerScanning && <ChevronRight size={13} style={{ color }} />}
      </motion.div>
    </NavLink>
  )
}

