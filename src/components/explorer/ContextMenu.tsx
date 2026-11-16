import React, { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors,
  Copy,
  Edit2,
  Share2,
  Trash2,
  Play,
  FolderOpen,
  Smartphone,
  Star,
  Archive,
  Terminal,
  Info,
  ExternalLink,
  ChevronRight,
  FileText,
  Video,
  Music,
  Image as ImageIcon,
  Check,
  RefreshCw,
  FolderPlus,
  Clipboard,
  Layers,
  Sparkles,
  ArrowUpDown,
  Grid,
  List as ListIcon,
  FolderTree,
} from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'
import type { FileItem } from '../../types'

export interface ContextMenuProps {
  x: number
  y: number
  targetItem: FileItem | null
  currentPath: string
  hasClipboard: boolean
  isFavorite: boolean
  onClose: () => void
  onOpen: (item: FileItem) => void
  onCut: (item: FileItem) => void
  onCopy: (item: FileItem) => void
  onRename: (item: FileItem) => void
  onDelete: (item: FileItem) => void
  onShareToPhone: (item: FileItem) => void
  onToggleFavorite: (item: FileItem) => void
  onCompress: (item: FileItem) => void
  onCopyPath: (item: FileItem) => void
  onProperties: (item: FileItem) => void
  onOpenWith: (item: FileItem, app: string) => void
  onOpenInExplorer: (item: FileItem) => void
  onOpenTerminal: (path: string) => void
  // Background specific
  onRefresh?: () => void
  onNewFolder?: () => void
  onPaste?: () => void
  onViewChange?: (mode: 'grid' | 'list' | 'tree') => void
  onSortChange?: (field: 'name' | 'size' | 'modified' | 'type') => void
}

export function ContextMenu({
  x,
  y,
  targetItem,
  currentPath,
  hasClipboard,
  isFavorite,
  onClose,
  onOpen,
  onCut,
  onCopy,
  onRename,
  onDelete,
  onShareToPhone,
  onToggleFavorite,
  onCompress,
  onCopyPath,
  onProperties,
  onOpenWith,
  onOpenInExplorer,
  onOpenTerminal,
  onRefresh,
  onNewFolder,
  onPaste,
  onViewChange,
  onSortChange,
}: ContextMenuProps) {
  const { theme } = useTheme()
  const menuRef = useRef<HTMLDivElement>(null)
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [coords, setCoords] = useState({ top: y, left: x })

  // Adjust coordinates if menu would overflow viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const winW = window.innerWidth
      const winH = window.innerHeight

      let adjustedLeft = x
      let adjustedTop = y

      if (x + rect.width > winW - 10) {
        adjustedLeft = Math.max(10, x - rect.width)
      }
      if (y + rect.height > winH - 10) {
        adjustedTop = Math.max(10, y - rect.height)
      }

      setCoords({ top: adjustedTop, left: adjustedLeft })
    }
  }, [x, y])

  // Close when clicking outside or pressing Escape or scrolling
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleScroll = () => onClose()

    window.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [onClose])

  const isDark = theme === 'dark'

  // Common open-with apps
  const openWithApps = [
    { id: 'notepad', name: 'Notepad', icon: <FileText size={15} className="text-cyan-400" /> },
    { id: 'vlc', name: 'VLC media player', icon: <Video size={15} className="text-orange-400" /> },
    { id: 'mediaplayer', name: 'Media Player', icon: <Music size={15} className="text-purple-400" /> },
    { id: 'photos', name: 'Photos', icon: <ImageIcon size={15} className="text-blue-400" /> },
    { id: 'code', name: 'VS Code', icon: <Terminal size={15} className="text-blue-500" /> },
    { id: 'choose', name: 'Choose another app', icon: <ExternalLink size={15} className="text-gray-400" /> },
  ]

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        background: isDark ? 'rgba(24, 25, 34, 0.94)' : 'rgba(255, 255, 255, 0.96)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
      }}
      className="fixed z-50 min-w-[260px] max-w-[320px] rounded-2xl shadow-2xl backdrop-blur-2xl border p-1.5 select-none text-xs text-gray-200 shadow-black/60 font-sans"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. ITEM CONTEXT MENU (When right-clicking a file or folder) */}
      {targetItem ? (
        <>
          {/* Top Quick Action Bar: Cut | Copy | Rename | Share | Delete */}
          <div
            className="flex items-center justify-between px-2 py-1.5 mb-1.5 rounded-xl border"
            style={{
              background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
            }}
          >
            <button
              onClick={() => { onCut(targetItem); onClose() }}
              title="Cut (Ctrl+X)"
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-blue-500/15 text-gray-300 hover:text-blue-400 transition-colors flex-1"
            >
              <Scissors size={15} className="text-blue-400" />
              <span className="text-[10px] font-medium">Cut</span>
            </button>

            <button
              onClick={() => { onCopy(targetItem); onClose() }}
              title="Copy (Ctrl+C)"
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-blue-500/15 text-gray-300 hover:text-blue-400 transition-colors flex-1"
            >
              <Copy size={15} className="text-cyan-400" />
              <span className="text-[10px] font-medium">Copy</span>
            </button>

            <button
              onClick={() => { onRename(targetItem); onClose() }}
              title="Rename (F2)"
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-amber-500/15 text-gray-300 hover:text-amber-400 transition-colors flex-1"
            >
              <Edit2 size={15} className="text-amber-400" />
              <span className="text-[10px] font-medium">Rename</span>
            </button>

            <button
              onClick={() => { onShareToPhone(targetItem); onClose() }}
              title="Send to Phone wirelessly"
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-emerald-500/15 text-gray-300 hover:text-emerald-400 transition-colors flex-1"
            >
              <Share2 size={15} className="text-emerald-400" />
              <span className="text-[10px] font-medium">Share</span>
            </button>

            <button
              onClick={() => { onDelete(targetItem); onClose() }}
              title="Delete (Delete)"
              className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-red-500/15 text-gray-300 hover:text-red-400 transition-colors flex-1"
            >
              <Trash2 size={15} className="text-red-400" />
              <span className="text-[10px] font-medium">Delete</span>
            </button>
          </div>

          {/* Primary Operations List */}
          <div className="space-y-0.5">
            {/* Open */}
            <button
              onClick={() => { onOpen(targetItem); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {targetItem.type === 'directory' ? (
                  <FolderOpen size={16} className="text-amber-400" />
                ) : (
                  <Play size={15} className="text-blue-400 fill-blue-400/20" />
                )}
                <span>Open</span>
              </div>
              <span className="text-[11px] text-gray-500">Enter</span>
            </button>

            {/* Open With Submenu (Files only) */}
            {targetItem.type === 'file' && (
              <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu('openWith')}
                onMouseLeave={() => setActiveSubmenu(null)}
              >
                <button
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                    isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Layers size={16} className="text-indigo-400" />
                    <span>Open with</span>
                  </div>
                  <ChevronRight size={14} className="text-gray-500" />
                </button>

                {/* Flyout Submenu */}
                <AnimatePresence>
                  {activeSubmenu === 'openWith' && (
                    <motion.div
                      initial={{ opacity: 0, x: -6, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0, scale: 1 }}
                      exit={{ opacity: 0, x: -6 }}
                      transition={{ duration: 0.1 }}
                      style={{
                        background: isDark ? 'rgba(24, 25, 34, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                      }}
                      className="absolute left-full top-0 ml-1.5 min-w-[200px] rounded-2xl shadow-2xl backdrop-blur-2xl border p-1.5 space-y-0.5"
                    >
                      {openWithApps.map((app) => (
                        <button
                          key={app.id}
                          onClick={() => { onOpenWith(targetItem, app.id); onClose() }}
                          className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl transition-colors ${
                            isDark ? 'hover:bg-white/10 text-gray-200' : 'hover:bg-black/5 text-gray-800'
                          }`}
                        >
                          {app.icon}
                          <span className="truncate">{app.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Send to My Phone (Wireless Transfer) */}
            <button
              onClick={() => { onShareToPhone(targetItem); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium group ${
                isDark ? 'hover:bg-emerald-500/15 text-emerald-400' : 'hover:bg-emerald-50 text-emerald-600'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Smartphone size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                <span>Send to My Phone</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                WiFi
              </span>
            </button>

            {/* Add / Remove Favorite */}
            <button
              onClick={() => { onToggleFavorite(targetItem); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Star
                  size={16}
                  className={isFavorite ? 'text-amber-400 fill-amber-400' : 'text-amber-400'}
                />
                <span>{isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
              </div>
            </button>

            {/* Compress to ZIP */}
            <button
              onClick={() => { onCompress(targetItem); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Archive size={16} className="text-purple-400" />
                <span>Compress to ZIP...</span>
              </div>
              <span className="text-[11px] text-gray-500">.zip</span>
            </button>

            {/* Copy as Path */}
            <button
              onClick={() => {
                onCopyPath(targetItem)
                setCopyFeedback(true)
                setTimeout(() => onClose(), 600)
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {copyFeedback ? (
                  <Check size={16} className="text-emerald-400" />
                ) : (
                  <Copy size={16} className="text-cyan-400" />
                )}
                <span>{copyFeedback ? 'Copied to Clipboard!' : 'Copy as path'}</span>
              </div>
              <span className="text-[11px] text-gray-500">Ctrl+Shift+C</span>
            </button>

            {/* Properties */}
            <button
              onClick={() => { onProperties(targetItem); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Info size={16} className="text-blue-400" />
                <span>Properties</span>
              </div>
              <span className="text-[11px] text-gray-500">Alt+Enter</span>
            </button>

            {/* Divider */}
            <div className="my-1 border-t border-white/5 dark:border-white/10" />

            {/* Reveal in Explorer */}
            <button
              onClick={() => { onOpenInExplorer(targetItem); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium text-gray-400 hover:text-white ${
                isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ExternalLink size={15} />
                <span>Show in Windows Explorer</span>
              </div>
              <span className="text-[11px] text-gray-500">Shift+F10</span>
            </button>
          </div>
        </>
      ) : (
        /* 2. BACKGROUND CONTEXT MENU (When right-clicking empty space in folder) */
        <div className="space-y-0.5">
          {/* View Mode Submenu */}
          {onViewChange && (
            <div
              className="relative"
              onMouseEnter={() => setActiveSubmenu('view')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                  isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Grid size={16} className="text-blue-400" />
                  <span>View</span>
                </div>
                <ChevronRight size={14} className="text-gray-500" />
              </button>

              <AnimatePresence>
                {activeSubmenu === 'view' && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    style={{
                      background: isDark ? 'rgba(24, 25, 34, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    }}
                    className="absolute left-full top-0 ml-1.5 min-w-[170px] rounded-2xl shadow-2xl backdrop-blur-2xl border p-1.5 space-y-0.5"
                  >
                    <button
                      onClick={() => { onViewChange('grid'); onClose() }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <Grid size={15} className="text-blue-400" />
                      <span>Grid View</span>
                    </button>
                    <button
                      onClick={() => { onViewChange('list'); onClose() }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <ListIcon size={15} className="text-cyan-400" />
                      <span>List View</span>
                    </button>
                    <button
                      onClick={() => { onViewChange('tree'); onClose() }}
                      className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <FolderTree size={15} className="text-amber-400" />
                      <span>Tree Breakdown</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Sort By Submenu */}
          {onSortChange && (
            <div
              className="relative"
              onMouseEnter={() => setActiveSubmenu('sort')}
              onMouseLeave={() => setActiveSubmenu(null)}
            >
              <button
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                  isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ArrowUpDown size={16} className="text-indigo-400" />
                  <span>Sort by</span>
                </div>
                <ChevronRight size={14} className="text-gray-500" />
              </button>

              <AnimatePresence>
                {activeSubmenu === 'sort' && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    style={{
                      background: isDark ? 'rgba(24, 25, 34, 0.98)' : 'rgba(255, 255, 255, 0.98)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                    }}
                    className="absolute left-full top-0 ml-1.5 min-w-[170px] rounded-2xl shadow-2xl backdrop-blur-2xl border p-1.5 space-y-0.5"
                  >
                    <button
                      onClick={() => { onSortChange('name'); onClose() }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <span>Name</span>
                    </button>
                    <button
                      onClick={() => { onSortChange('size'); onClose() }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <span>Size</span>
                    </button>
                    <button
                      onClick={() => { onSortChange('modified'); onClose() }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <span>Date Modified</span>
                    </button>
                    <button
                      onClick={() => { onSortChange('type'); onClose() }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      <span>File Type</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Refresh */}
          {onRefresh && (
            <button
              onClick={() => { onRefresh(); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <RefreshCw size={16} className="text-emerald-400" />
                <span>Refresh</span>
              </div>
              <span className="text-[11px] text-gray-500">F5</span>
            </button>
          )}

          <div className="my-1 border-t border-white/5 dark:border-white/10" />

          {/* Paste */}
          {onPaste && (
            <button
              disabled={!hasClipboard}
              onClick={() => { onPaste(); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                hasClipboard
                  ? isDark
                    ? 'hover:bg-white/10 text-gray-100'
                    : 'hover:bg-black/5 text-gray-800'
                  : 'opacity-40 cursor-not-allowed text-gray-500'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clipboard size={16} className="text-blue-400" />
                <span>Paste</span>
              </div>
              <span className="text-[11px] text-gray-500">Ctrl+V</span>
            </button>
          )}

          {/* New Folder */}
          {onNewFolder && (
            <button
              onClick={() => { onNewFolder(); onClose() }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
                isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FolderPlus size={16} className="text-amber-400" />
                <span>New folder</span>
              </div>
              <span className="text-[11px] text-gray-500">Ctrl+Shift+N</span>
            </button>
          )}

          <div className="my-1 border-t border-white/5 dark:border-white/10" />

          {/* Open in Terminal */}
          <button
            onClick={() => { onOpenTerminal(currentPath); onClose() }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-colors font-medium ${
              isDark ? 'hover:bg-white/10 text-gray-100' : 'hover:bg-black/5 text-gray-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Terminal size={16} className="text-cyan-400" />
              <span>Open in Terminal / CMD</span>
            </div>
            <span className="text-[11px] text-gray-500">cmd</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}

