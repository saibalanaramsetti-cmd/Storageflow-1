import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trash2,
  RefreshCw,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Code,
  Search,
  ExternalLink,
  HardDrive,
  CheckCircle,
} from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { formatBytes, getFileTypeCategory, getFileTypeColor } from '../utils/formatters'
import { useTheme } from '../hooks/useTheme'

interface TrashedItem {
  name: string
  path?: string
  originalLocation: string
  dateDeleted: string
  size: number
  type: string
}

export function Trash() {
  const { theme } = useTheme()
  const [items, setItems] = useState<TrashedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false)
  const [restoringName, setRestoringName] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    item: TrashedItem
  } | null>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  const loadItems = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.electronAPI?.trash.getItems()
      if (res?.success && res.data) {
        setItems(res.data)
      } else {
        setItems([])
      }
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // Dismiss context menu on click outside or Escape
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleCloseMenu)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('click', handleCloseMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const totalTrashedBytes = useMemo(() => {
    return items.reduce((acc, item) => acc + (item.size || 0), 0)
  }, [items])

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const q = searchQuery.toLowerCase()
    return items.filter(
      (item) =>
        (item.name && item.name.toLowerCase().includes(q)) ||
        (item.originalLocation && item.originalLocation.toLowerCase().includes(q))
    )
  }, [items, searchQuery])

  const handleRestore = async (itemName: string) => {
    setRestoringName(itemName)
    try {
      const res = await window.electronAPI?.trash.restoreItem(itemName)
      if (res?.success) {
        showToast(`Restored "${itemName}" to original location! 🎉`)
        await loadItems()
      } else {
        showToast(`Could not restore: ${res?.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      showToast(`Restore error: ${e.message}`)
    } finally {
      setRestoringName(null)
    }
  }

  const handleDeleteItem = async (item: TrashedItem) => {
    setRestoringName(item.name)
    try {
      const res = await window.electronAPI?.trash.deleteItem(item.path || '', item.name)
      if (res?.success) {
        showToast(`Permanently deleted "${item.name}" 🗑️`)
        await loadItems()
      } else {
        showToast(`Could not delete item: ${res?.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      showToast(`Delete error: ${e.message}`)
    } finally {
      setRestoringName(null)
    }
  }

  const handleEmpty = async () => {
    setConfirmEmptyOpen(false)
    setLoading(true)
    try {
      const res = await window.electronAPI?.trash.empty()
      if (res?.success) {
        showToast('Recycle Bin permanently emptied! Storage reclaimed. 🧹')
        await loadItems()
      } else {
        showToast('Failed to empty Recycle Bin')
      }
    } catch (e: any) {
      showToast(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const getItemIcon = (name: string, type: string) => {
    const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')).toLowerCase() : ''
    const cat = getFileTypeCategory(ext)
    const color = getFileTypeColor(ext)

    if (type && type.toLowerCase().includes('folder')) {
      return <Folder size={18} className="text-amber-400" />
    }

    switch (cat) {
      case 'Images':
        return <ImageIcon size={18} style={{ color }} />
      case 'Videos':
        return <Video size={18} style={{ color }} />
      case 'Audio':
        return <Music size={18} style={{ color }} />
      case 'Documents':
        return <FileText size={18} style={{ color }} />
      case 'Code':
        return <Code size={18} style={{ color }} />
      case 'Archives':
        return <Archive size={18} style={{ color }} />
      default:
        return <File size={18} style={{ color }} />
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 right-8 z-50 px-4 py-2.5 rounded-2xl bg-black/85 backdrop-blur-xl border border-white/20 text-white text-xs font-semibold shadow-2xl flex items-center gap-2"
          >
            <CheckCircle size={15} className="text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2-Option Right Click Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{
              top: contextMenu.y,
              left: contextMenu.x,
            }}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 w-56 rounded-2xl bg-[#0f0f18]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-1.5 flex flex-col gap-0.5 select-none"
          >
            <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-white/5 truncate">
              {contextMenu.item.name}
            </div>

            {/* Option 1: Restore */}
            <button
              onClick={() => {
                const target = contextMenu.item
                setContextMenu(null)
                handleRestore(target.name)
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-200 hover:text-white hover:bg-blue-600/25 transition-all text-left group"
            >
              <RotateCcw size={15} className="text-blue-400 group-hover:scale-110 transition-transform flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-white">Restore</span>
                <span className="text-[10px] text-gray-400 font-normal truncate">Return to original location</span>
              </div>
            </button>

            {/* Option 2: Delete */}
            <button
              onClick={() => {
                const target = contextMenu.item
                setContextMenu(null)
                handleDeleteItem(target)
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-200 hover:bg-red-500/20 transition-all text-left group"
            >
              <Trash2 size={15} className="text-red-400 group-hover:scale-110 transition-transform flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-red-300">Delete Permanently</span>
                <span className="text-[10px] text-red-400/70 font-normal truncate">Purge from Recycle Bin</span>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <div
        className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 transition-colors"
        style={{
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(15, 15, 24, 0.6)',
          borderColor: theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
        }}
      >
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2.5">
            <Trash2 size={22} className="text-red-400" />
            <span>Recycle Bin & Trash</span>
            {items.length > 0 && (
              <Badge color="#ef4444">{items.length} items</Badge>
            )}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Right-click any deleted item to restore or permanently delete it.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadItems}
            icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
            title="Refresh Trash items"
          >
            Refresh
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.electronAPI?.trash.openFolder()}
            icon={<ExternalLink size={14} />}
            title="Open Windows Explorer Recycle Bin"
          >
            Windows Explorer
          </Button>

          {items.length > 0 && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmEmptyOpen(true)}
              icon={<Trash2 size={14} />}
              title="Permanently empty all items"
            >
              Empty Recycle Bin
            </Button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-6 py-3 bg-white/[0.02] border-b border-white/5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Total Deleted Items:</span>
            <span className="font-bold text-white">{items.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">Recoverable Storage:</span>
            <span className="font-bold text-orange-400">{formatBytes(totalTrashedBytes)}</span>
          </div>
        </div>

        {/* Instant Search Bar */}
        {items.length > 0 && (
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search deleted files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-red-500/80 transition-all"
            />
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <RefreshCw size={26} className="animate-spin text-red-400" />
            <p className="text-sm font-medium">Scanning Windows Recycle Bin...</p>
          </div>
        ) : items.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-80 text-center max-w-md mx-auto space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Recycle Bin is Empty</h3>
              <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                No deleted files found. Your system trash is completely clear and your local storage is fully optimized!
              </p>
            </div>
            <div className="pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.electronAPI?.trash.openFolder()}
                icon={<ExternalLink size={13} />}
              >
                Inspect Windows Recycle Bin
              </Button>
            </div>
          </div>
        ) : (
          /* Trashed Files Table */
          <div className="glass-card overflow-hidden">
            <div className="grid grid-cols-12 px-4 py-2.5 text-xs font-semibold text-gray-500 border-b border-white/5 uppercase tracking-wider">
              <span className="col-span-5">Name</span>
              <span className="col-span-3">Original Location</span>
              <span className="col-span-2">Date Deleted</span>
              <span className="col-span-1 text-right">Size</span>
              <span className="col-span-1 text-center">Action</span>
            </div>

            <div className="divide-y divide-white/[0.04]">
              {filteredItems.map((item, idx) => (
                <div
                  key={`${item.name}-${idx}`}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setContextMenu({
                      x: Math.min(e.clientX, window.innerWidth - 235),
                      y: Math.min(e.clientY, window.innerHeight - 150),
                      item,
                    })
                  }}
                  className="grid grid-cols-12 items-center px-4 py-2.5 text-xs hover:bg-white/[0.04] transition-colors group cursor-context-menu"
                >
                  {/* Name */}
                  <div className="col-span-5 flex items-center gap-2.5 min-w-0 pr-4">
                    <div className="w-7 h-7 rounded-lg bg-black/40 border border-white/10 flex items-center justify-center flex-shrink-0">
                      {getItemIcon(item.name, item.type)}
                    </div>
                    <span className="font-semibold text-gray-200 truncate group-hover:text-white" title={item.name}>
                      {item.name}
                    </span>
                  </div>

                  {/* Original Location */}
                  <div className="col-span-3 text-gray-400 truncate pr-4 text-[11px]" title={item.originalLocation}>
                    {item.originalLocation || 'Unknown'}
                  </div>

                  {/* Date Deleted */}
                  <div className="col-span-2 text-gray-400 text-[11px] truncate">
                    {item.dateDeleted || 'Recently'}
                  </div>

                  {/* Size */}
                  <div className="col-span-1 text-right text-gray-300 font-medium">
                    {formatBytes(item.size)}
                  </div>

                  {/* Actions */}
                  <div className="col-span-1 flex items-center justify-center gap-1">
                    <button
                      disabled={restoringName === item.name}
                      onClick={() => handleRestore(item.name)}
                      title="Restore file to original location"
                      className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-300 hover:text-white border border-blue-500/30 transition-all flex items-center gap-1 font-semibold text-[11px] disabled:opacity-50"
                    >
                      <RotateCcw size={12} className={restoringName === item.name ? 'animate-spin' : ''} />
                      <span className="hidden sm:inline">Restore</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Empty Modal */}
      <Modal
        open={confirmEmptyOpen}
        onClose={() => setConfirmEmptyOpen(false)}
        title="Empty Recycle Bin?"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            <AlertTriangle size={20} className="flex-shrink-0" />
            <p>
              Are you sure you want to permanently delete all <strong>{items.length} items</strong> ({formatBytes(totalTrashedBytes)}) from the Recycle Bin? This action cannot be undone.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmEmptyOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleEmpty} icon={<Trash2 size={14} />}>
              Permanently Empty
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
