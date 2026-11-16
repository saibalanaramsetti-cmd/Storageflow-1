import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  PieChart,
  HardDrive,
  Folder,
  FileText,
  StopCircle,
  Play,
  RotateCw,
  TrendingDown,
  Layers,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Database,
  Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Badge } from '../components/ui/Badge'
import { FolderConsumptionTree } from '../components/analyzer/FolderConsumptionTree'
import { formatBytes, getFileTypeColor } from '../utils/formatters'
import type { DriveInfo } from '../types'

import { useScan } from '../context/ScanContext'

export function StorageAnalyzer() {
  const navigate = useNavigate()
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const {
    isScanning,
    selectedPath,
    setSelectedPath,
    progress,
    scanResult,
    error,
    startScan,
    cancelScan,
  } = useScan()

  const activeDrive = drives.find((d) => selectedPath.toLowerCase().startsWith(d.letter.toLowerCase())) || drives[0]
  const usedPercent = activeDrive && activeDrive.total > 0 ? ((activeDrive.used / activeDrive.total) * 100).toFixed(1) : '0'
  const freePercent = activeDrive && activeDrive.total > 0 ? ((activeDrive.free / activeDrive.total) * 100).toFixed(1) : '0'

  // Load available drives
  useEffect(() => {
    window.electronAPI?.fs.getDrives().then((res) => {
      if (res?.success && res.data && res.data.length > 0) {
        setDrives(res.data)
        if (!selectedPath) {
          const root = res.data[0].letter
          const initial = root.endsWith('\\') || root.endsWith('/') ? root : `${root}\\`
          setSelectedPath(initial)
        }
      }
    })
  }, [selectedPath, setSelectedPath])

  // Start Scan
  const handleStartScan = async () => {
    await startScan()
  }

  // Cancel Scan
  const handleCancelScan = async () => {
    await cancelScan()
  }

  // Select custom folder for scan
  const handleChooseFolder = async () => {
    const res = await window.electronAPI?.dialog.openDirectory()
    if (res?.success && res.data && !res.data.canceled && res.data.filePaths[0]) {
      setSelectedPath(res.data.filePaths[0])
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Storage Analyzer
            <PieChart size={20} className="text-purple-400" />
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Deep recursive disk usage inspection, largest folders identification & type distribution
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isScanning ? (
            <Button
              variant="danger"
              size="sm"
              onClick={handleCancelScan}
              icon={<StopCircle size={14} />}
            >
              Cancel Scan
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleStartScan}
              icon={<Play size={14} />}
            >
              Start Deep Scan
            </Button>
          )}
        </div>
      </div>

      {/* Target Drive / Folder Selector */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Target Location:
          </span>
          <div className="flex items-center gap-2">
            {drives.map((d) => (
              <button
                key={d.letter}
                disabled={isScanning}
                onClick={() => setSelectedPath(d.letter.endsWith('\\') || d.letter.endsWith('/') ? d.letter : `${d.letter}\\`)}
                title={d.label}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                  selectedPath.toLowerCase().startsWith(d.letter.toLowerCase())
                    ? 'bg-purple-600/30 border-purple-500/60 text-white shadow-md shadow-purple-500/20'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <HardDrive size={13} />
                {d.label || d.letter} ({formatBytes(d.total)})
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono max-w-xs truncate">
            {selectedPath}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={isScanning}
            onClick={handleChooseFolder}
          >
            Choose Folder...
          </Button>
        </div>
      </div>

      {/* Live Scan Progress Card */}
      {isScanning && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 border border-purple-500/30 bg-purple-950/10 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400">
                <RotateCw size={16} className="animate-spin" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Analyzing Storage Hierarchy...</h4>
                <p className="text-xs text-gray-400 font-mono truncate max-w-xl">
                  {progress.currentPath}
                </p>
              </div>
            </div>
            <Badge color="#8b5cf6">Scanning Non-Blocking</Badge>
          </div>

          <ProgressBar value={100} color="#8b5cf6" height={6} className="animate-pulse" />

          <div className="grid grid-cols-3 gap-4 pt-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-white/5">
              <span className="text-gray-400 block">Total Scanned Size</span>
              <span className="text-base font-bold text-white">
                {formatBytes(progress.scannedSize)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5">
              <span className="text-gray-400 block">Files Processed</span>
              <span className="text-base font-bold text-purple-300">
                {progress.scannedFiles.toLocaleString()}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white/5">
              <span className="text-gray-400 block">Directories Traversed</span>
              <span className="text-base font-bold text-gray-200">
                {progress.scannedFolders.toLocaleString()}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Before Deep Scan: Instant Drive Hardware & Partition Status */}
      {!scanResult && !isScanning && activeDrive && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Drive Overview Metric Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Box 1: Used Space */}
            <div className="glass-card p-5 border-l-4 border-blue-500 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Used Space</span>
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shadow-md shadow-blue-500/50" />
              </div>
              <p className="text-3xl font-black text-blue-400 tracking-tight">
                {formatBytes(activeDrive.used)}
              </p>
              <p className="text-xs text-blue-300/80">
                {usedPercent}% of total partition space utilized
              </p>
            </div>

            {/* Box 2: Free Space */}
            <div className="glass-card p-5 border-l-4 border-emerald-500 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Free Space</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-md shadow-emerald-500/50" />
              </div>
              <p className="text-3xl font-black text-emerald-400 tracking-tight">
                {formatBytes(activeDrive.free)}
              </p>
              <p className="text-xs text-emerald-300/80">
                {freePercent}% unallocated and available
              </p>
            </div>

            {/* Box 3: Total Capacity */}
            <div className="glass-card p-5 border-l-4 border-purple-500 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Drive Capacity</span>
                <span className="text-xs font-mono text-purple-300">{activeDrive.fileSystem}</span>
              </div>
              <p className="text-3xl font-black text-white tracking-tight">
                {formatBytes(activeDrive.total)}
              </p>
              <p className="text-xs text-gray-400 truncate">
                {activeDrive.label || activeDrive.letter}
              </p>
            </div>
          </div>

          {/* Drive Partition Progress Bar */}
          <div className="glass-card p-5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-300 flex items-center gap-2">
                <HardDrive size={16} className="text-purple-400" />
                <span>{activeDrive.label} ({activeDrive.letter}) Allocation Breakdown</span>
              </span>
              <span className="text-gray-400 font-mono">
                {formatBytes(activeDrive.used)} used / {formatBytes(activeDrive.total)} total
              </span>
            </div>

            <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden flex p-0.5 border border-white/10">
              <div
                style={{ width: `${usedPercent}%` }}
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-l-full transition-all duration-500"
                title={`Used: ${formatBytes(activeDrive.used)} (${usedPercent}%)`}
              />
              <div
                style={{ width: `${freePercent}%` }}
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-r-full transition-all duration-500"
                title={`Free: ${formatBytes(activeDrive.free)} (${freePercent}%)`}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-400 pt-1">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  <span>Used: <strong className="text-white">{formatBytes(activeDrive.used)}</strong> ({usedPercent}%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span>Free: <strong className="text-white">{formatBytes(activeDrive.free)}</strong> ({freePercent}%)</span>
                </span>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleStartScan}
                icon={<Play size={14} />}
              >
                Scan Drive Hierarchy
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Scan Results Display */}
      {scanResult && !isScanning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-6"
        >
          {/* Summary Metric Row - 6 Cards with Live Used Space & Free Space */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Box 1: Used Space */}
            <div className="glass-card p-4 border-l-2 border-blue-500 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase flex items-center justify-between">
                  <span>Used Space</span>
                  <span className="w-2 h-2 rounded-full bg-blue-500 inline-block shadow-sm shadow-blue-500/50" />
                </span>
                <p className="text-2xl font-extrabold text-blue-400 mt-1">
                  {activeDrive ? formatBytes(activeDrive.used) : '--'}
                </p>
              </div>
              <span className="text-xs text-blue-300/80 flex items-center gap-1 mt-1 truncate">
                {activeDrive && activeDrive.total > 0
                  ? `${usedPercent}% Partition Used`
                  : 'Windows Disk'}
              </span>
            </div>

            {/* Box 2: Free Space */}
            <div className="glass-card p-4 border-l-2 border-emerald-500 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase flex items-center justify-between">
                  <span>Free Space</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shadow-sm shadow-emerald-500/50" />
                </span>
                <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                  {activeDrive ? formatBytes(activeDrive.free) : '--'}
                </p>
              </div>
              <span className="text-xs text-emerald-300/80 flex items-center gap-1 mt-1 truncate">
                {activeDrive && activeDrive.total > 0
                  ? `${freePercent}% Available`
                  : 'Free Space'}
              </span>
            </div>

            {/* Box 3: Analyzed Size */}
            <div className="glass-card p-4 border-l-2 border-purple-500 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase flex items-center justify-between">
                  <span>Analyzed Size</span>
                  <span className="w-2 h-2 rounded-full bg-purple-500 inline-block shadow-sm shadow-purple-500/50" />
                </span>
                <p className="text-2xl font-extrabold text-white mt-1">
                  {formatBytes(scanResult.totalSize)}
                </p>
              </div>
              <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1 truncate">
                <CheckCircle2 size={12} className="flex-shrink-0" /> Scan Cached
              </span>
            </div>

            {/* Box 4: Total Files */}
            <div className="glass-card p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase">Total Files</span>
                <p className="text-2xl font-extrabold text-purple-400 mt-1">
                  {scanResult.totalFiles.toLocaleString()}
                </p>
              </div>
              <span className="text-xs text-gray-400 mt-1 block truncate">Cataloged items</span>
            </div>

            {/* Box 5: Total Folders */}
            <div className="glass-card p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase">Total Folders</span>
                <p className="text-2xl font-extrabold text-cyan-400 mt-1">
                  {scanResult.totalFolders.toLocaleString()}
                </p>
              </div>
              <span className="text-xs text-gray-400 mt-1 block truncate">Subdirectories</span>
            </div>

            {/* Box 6: Root Path */}
            <div className="glass-card p-4 flex flex-col justify-between">
              <div>
                <span className="text-xs text-gray-400 font-semibold uppercase">Root Path</span>
                <p className="text-xs font-mono font-bold text-gray-200 mt-1 truncate" title={scanResult.rootTree?.path || selectedPath}>
                  {scanResult.rootTree?.path || selectedPath}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs w-full justify-center"
                onClick={() =>
                  navigate(`/explorer/${encodeURIComponent(scanResult.rootTree?.path || selectedPath)}`)
                }
              >
                Open in Explorer
              </Button>
            </div>
          </div>

          {/* Hierarchical Folder Consumption Tree (Matches Reference Image) */}
          {scanResult.rootTree && (
            <FolderConsumptionTree
              rootNode={scanResult.rootTree}
              totalScanSize={scanResult.totalSize}
            />
          )}

          {/* Two Columns: Largest Folders & Type Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Largest Folders List */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown size={18} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Largest Folders (Space Hogs)</h3>
                </div>
                <span className="text-xs text-gray-400">Top consumers</span>
              </div>

              <div className="space-y-3">
                {scanResult.largestFolders.map((folder: any, index: number) => {
                  const pct =
                    scanResult.totalSize > 0 ? (folder.size / scanResult.totalSize) * 100 : 0
                  return (
                    <div
                      key={folder.path}
                      onClick={() =>
                        navigate(`/explorer/${encodeURIComponent(folder.path)}`)
                      }
                      className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] cursor-pointer transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className="w-5 text-gray-500 font-mono text-[11px]">
                            #{index + 1}
                          </span>
                          <Folder size={14} className="text-amber-400 flex-shrink-0" />
                          <span className="font-semibold text-gray-200 truncate" title={folder.path}>
                            {folder.name}
                          </span>
                        </div>
                        <span className="font-bold text-white flex-shrink-0">
                          {formatBytes(folder.size)}
                        </span>
                      </div>
                      <ProgressBar value={pct} color="#f59e0b" height={4} />
                      <div className="flex justify-between text-[10px] text-gray-500">
                        <span className="truncate max-w-[280px]">{folder.path}</span>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* File Type Distribution */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers size={18} className="text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Storage Breakdown by Category</h3>
                </div>
                <span className="text-xs text-gray-400">Disk Consumption</span>
              </div>

              <div className="space-y-4">
                {Object.entries(scanResult.typeDistribution)
                  .sort(([, a]: any, [, b]: any) => b.size - a.size)
                  .map(([type, stats]: [string, any]) => {
                    const color = getFileTypeColor(type)
                    const pct =
                      scanResult.totalSize > 0 ? (stats.size / scanResult.totalSize) * 100 : 0
                    return (
                      <div key={type} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-300 flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ background: color }}
                            />
                            {type}
                          </span>
                          <div className="text-right">
                            <span className="font-bold text-white mr-2">
                              {formatBytes(stats.size)}
                            </span>
                            <span className="text-gray-500">
                              ({stats.count.toLocaleString()} files, {pct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                        <ProgressBar value={pct} color={color} height={6} />
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

