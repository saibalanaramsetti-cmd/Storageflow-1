import { useState, useEffect } from 'react'
import {
  Settings as SettingsIcon,
  Moon,
  Sun,
  FolderOpen,
  Wifi,
  Sliders,
  Shield,
  Info,
  Check,
  Gauge,
  Cpu,
  Zap,
  User,
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { usePerformanceProfile } from '../hooks/usePerformanceProfile'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

export function Settings() {
  const { theme, toggleTheme } = useTheme()
  const { mode, activeTier, hardwareProfile, setMode } = usePerformanceProfile()
  const [displayName, setDisplayName] = useState<string>('')
  const [downloadPath, setDownloadPath] = useState<string>('')
  const [transferPort, setTransferPort] = useState<number>(52140)
  const [previewEnabled, setPreviewEnabled] = useState<boolean>(true)
  const [confirmDelete, setConfirmDelete] = useState<boolean>(true)
  const [savedNotice, setSavedNotice] = useState<boolean>(false)

  useEffect(() => {
    const savedName = localStorage.getItem('sf-display-name')
    if (savedName) {
      setDisplayName(savedName)
    } else {
      window.electronAPI?.system.getInfo().then((res) => {
        if (res?.success && res.data?.username) {
          setDisplayName(res.data.username)
        }
      })
    }

    const saved = localStorage.getItem('sf-download-dir')
    if (saved) {
      setDownloadPath(saved)
    } else {
      window.electronAPI?.system.getInfo().then((res) => {
        if (res?.success && res.data?.homeDir) {
          setDownloadPath(`${res.data.homeDir}\\Downloads\\StorageFlow`)
        }
      })
    }
  }, [])

  const handleSelectDownloadDir = async () => {
    const res = await window.electronAPI?.dialog.openDirectory()
    if (res?.success && res.data && !res.data.canceled && res.data.filePaths[0]) {
      const chosen = res.data.filePaths[0]
      setDownloadPath(chosen)
      localStorage.setItem('sf-download-dir', chosen)
      window.electronAPI?.transfer.setDownloadDir(chosen)
    }
  }

  const handleSave = () => {
    if (displayName.trim()) {
      localStorage.setItem('sf-display-name', displayName.trim())
    }
    if (downloadPath) {
      localStorage.setItem('sf-download-dir', downloadPath)
      window.electronAPI?.transfer.setDownloadDir(downloadPath)
    }
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2500)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Settings & Preferences
            <SettingsIcon size={20} className="text-gray-400" />
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Configure application appearance, wireless transfer behavior, and security defaults
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave}>
          {savedNotice ? 'Saved Successfully! ✓' : 'Save Changes'}
        </Button>
      </div>

      {/* User Profile & Display Name */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <User size={16} className="text-cyan-400" />
          User Profile
        </h3>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-300">Dashboard Greeting Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sai Bala"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (displayName.trim()) {
                  localStorage.setItem('sf-display-name', displayName.trim())
                  setSavedNotice(true)
                  setTimeout(() => setSavedNotice(false), 2000)
                }
              }}
            >
              Update Name
            </Button>
          </div>
          <p className="text-[11px] text-gray-500">
            StorageFlow detects your active Windows user profile automatically, but you can customize your greeting name here.
          </p>
        </div>
      </div>

      {/* Appearance Section */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Moon size={16} className="text-blue-400" />
          Appearance & Themes
        </h3>

        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
          <div>
            <p className="text-xs font-semibold text-white">Visual Theme</p>
            <p className="text-[11px] text-gray-400">Toggle between macOS dark glassmorphism and clean light mode</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleTheme}
            icon={theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          >
            {theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          </Button>
        </div>
      </div>

      {/* Universal Windows Performance & Hardware Profile */}
      <div className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Gauge size={16} className="text-amber-400" />
            Hardware Detection & Performance Profiles
          </h3>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
            Active: {activeTier.toUpperCase()}
          </span>
        </div>

        {/* Live Detected Diagnostics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs">
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">Processor</span>
            <span className="font-medium text-gray-200 truncate block" title={hardwareProfile?.cpuModel}>
              {hardwareProfile?.cpuModel ? `${hardwareProfile.cpuModel.split('@')[0].trim()} (${hardwareProfile.cpuCores} cores)` : 'Detecting...'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">System Memory</span>
            <span className="font-medium text-gray-200">
              {hardwareProfile ? `${hardwareProfile.totalRamGB} GB (${hardwareProfile.freeRamGB} GB free)` : 'Detecting...'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">Windows Platform</span>
            <span className="font-medium text-gray-200 truncate block">
              {hardwareProfile?.osName || 'Windows 10/11'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block text-[10px] uppercase font-semibold">Primary Display</span>
            <span className="font-medium text-gray-200 truncate block">
              {hardwareProfile?.displayResolution || 'Auto DPI'}
            </span>
          </div>
        </div>

        {/* Profile Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {/* Low-End Mode */}
          <div
            onClick={() => setMode('low-end')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              mode === 'low-end' || (mode === 'auto' && activeTier === 'low-end')
                ? 'bg-blue-600/20 border-blue-500/60 ring-1 ring-blue-500/40 shadow-lg shadow-blue-500/10'
                : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Cpu size={14} className="text-blue-400" />
                  Low-End Mode
                </span>
                {(mode === 'low-end' || (mode === 'auto' && activeTier === 'low-end')) && (
                  <Check size={14} className="text-blue-400" />
                )}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Strips GPU blur layers, disables heavy shadows, and maximizes 60fps responsiveness on 4GB RAM & Intel UHD.
              </p>
            </div>
            <span className="text-[10px] font-mono text-blue-300/80 mt-3 block">
              Dual-Core / 4GB RAM / HDD
            </span>
          </div>

          {/* Balanced Mode */}
          <div
            onClick={() => setMode('balanced')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              mode === 'balanced' || (mode === 'auto' && activeTier === 'balanced')
                ? 'bg-purple-600/20 border-purple-500/60 ring-1 ring-purple-500/40 shadow-lg shadow-purple-500/10'
                : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Sliders size={14} className="text-purple-400" />
                  Balanced Mode
                </span>
                {(mode === 'balanced' || (mode === 'auto' && activeTier === 'balanced')) && (
                  <Check size={14} className="text-purple-400" />
                )}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Moderate glassmorphism, responsive file list virtualization, and balanced scanning concurrency.
              </p>
            </div>
            <span className="text-[10px] font-mono text-purple-300/80 mt-3 block">
              Quad-Core / 8GB RAM / SSD
            </span>
          </div>

          {/* High-Performance Mode */}
          <div
            onClick={() => setMode('high-performance')}
            className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
              mode === 'high-performance' || (mode === 'auto' && activeTier === 'high-performance')
                ? 'bg-emerald-600/20 border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-lg shadow-emerald-500/10'
                : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'
            }`}
          >
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap size={14} className="text-emerald-400" />
                  High-Performance
                </span>
                {(mode === 'high-performance' || (mode === 'auto' && activeTier === 'high-performance')) && (
                  <Check size={14} className="text-emerald-400" />
                )}
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Full fidelity glassmorphism, rich animations, fast multi-threaded I/O, and maximum background throughput.
              </p>
            </div>
            <span className="text-[10px] font-mono text-emerald-300/80 mt-3 block">
              6+ Cores / 16GB+ RAM / NVMe
            </span>
          </div>
        </div>

        {/* Auto Selection Switch */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 mt-2">
          <div>
            <p className="text-xs font-semibold text-white">Auto-Detect Profile</p>
            <p className="text-[11px] text-gray-400">
              Automatically adjust visual fidelity and concurrency to match hardware resources
            </p>
          </div>
          <Button
            variant={mode === 'auto' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('auto')}
          >
            {mode === 'auto' ? 'Auto-Detection Active ✓' : 'Enable Auto-Detect'}
          </Button>
        </div>
      </div>

      {/* Wireless Transfer Section */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Wifi size={16} className="text-emerald-400" />
          Wireless Direct Transfer Configuration
        </h3>

        <div className="space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-300">Default Download Directory</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={downloadPath}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
              <Button variant="secondary" size="sm" onClick={handleSelectDownloadDir} icon={<FolderOpen size={13} />}>
                Browse...
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-48">
            <label className="text-xs font-semibold text-gray-300">Local Transfer Port</label>
            <input
              type="number"
              value={transferPort}
              onChange={(e) => setTransferPort(parseInt(e.target.value) || 52140)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white font-mono"
            />
          </div>
        </div>
      </div>

      {/* File Management & Safety */}
      <div className="glass-card p-5 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Shield size={16} className="text-purple-400" />
          File Safety & Scanner Options
        </h3>

        <div className="space-y-3">
          <label className="flex items-center justify-between p-3 rounded-xl bg-white/5 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-white">File Previews</p>
              <p className="text-[11px] text-gray-400">Generate image and text previews inside explorer</p>
            </div>
            <input
              type="checkbox"
              checked={previewEnabled}
              onChange={(e) => setPreviewEnabled(e.target.checked)}
              className="rounded"
            />
          </label>

          <label className="flex items-center justify-between p-3 rounded-xl bg-white/5 cursor-pointer">
            <div>
              <p className="text-xs font-semibold text-white">Confirm Before Deletion</p>
              <p className="text-[11px] text-gray-400">Always ask for confirmation before moving to Recycle Bin</p>
            </div>
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.checked)}
              className="rounded"
            />
          </label>
        </div>
      </div>

      {/* Application Information */}
      <div className="glass-card p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Info size={16} className="text-blue-400" />
          Application Information
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-gray-400 block">App Name</span>
            <span className="font-bold text-white">StorageFlow</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-gray-400 block">Version</span>
            <span className="font-bold text-blue-400">1.1.0 Pro</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-gray-400 block">Architecture</span>
            <span className="font-bold text-gray-200">Electron + React + TS</span>
          </div>
          <div className="p-3 rounded-xl bg-white/5">
            <span className="text-gray-400 block">Security Isolation</span>
            <span className="font-bold text-emerald-400">Context Isolated</span>
          </div>
        </div>
      </div>
    </div>
  )
}

