import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder,
  File,
  HardDrive,
  ChevronRight,
  ArrowLeft,
  ArrowUp,
  RefreshCw,
  Search,
  Grid,
  List as ListIcon,
  Copy,
  Scissors,
  Clipboard,
  Trash2,
  FolderPlus,
  Eye,
  Info,
  Edit2,
  Share2,
  ArrowUpDown,
  CheckSquare,
  Square,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Code,
  Archive,
  ExternalLink,
  Smartphone,
  Tablet,
  FolderTree,
  Sparkles,
} from 'lucide-react'
import { ContextMenu } from '../components/explorer/ContextMenu'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { Badge } from '../components/ui/Badge'
import { FileThumbnail } from '../components/explorer/FileThumbnail'
import { FolderConsumptionTree } from '../components/analyzer/FolderConsumptionTree'
import {
  formatBytes,
  formatDate,
  formatRelativeDate,
  getFileTypeCategory,
  getFileTypeColor,
} from '../utils/formatters'
import { isValidFileName } from '../utils/validators'
import { useTheme } from '../hooks/useTheme'
import type { FileItem, DriveInfo, SortField, SortOrder, ViewMode } from '../types'

export function FileExplorer() {
  const { theme } = useTheme()
  const { encodedPath } = useParams<{ encodedPath?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isFromDashboard = Boolean(location.state?.fromDashboard)

  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>('')
  const [items, setItems] = useState<FileItem[]>([])
  const [drives, setDrives] = useState<DriveInfo[]>([])
  const [deviceInfo, setDeviceInfo] = useState<{ isPortable: boolean; deviceName: string; isEmptyOrLocked?: boolean } | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Selection & Clipboard State
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<{
    paths: string[]
    operation: 'copy' | 'cut'
  } | null>(null)

  // View & Filter State
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [debouncedQuery, setDebouncedQuery] = useState<string>('')
  const [renderLimit, setRenderLimit] = useState<number>(80)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')

  // Debounce search query by 150ms to keep 60fps input typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery)
    }, 150)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset pagination render limit when navigating or searching
  useEffect(() => {
    setRenderLimit(80)
  }, [currentPath, debouncedQuery])

  // Folder Sizes & Hierarchical Tree State
  const [folderSizes, setFolderSizes] = useState<Record<string, number>>({})
  const folderSizesRef = useRef<Record<string, number>>({})
  folderSizesRef.current = folderSizes
  const currentPathRef = useRef<string>(currentPath)
  currentPathRef.current = currentPath
  const [treeData, setTreeData] = useState<any>(null)
  const [treeLoading, setTreeLoading] = useState<boolean>(false)

  // Modals & Panels
  const [previewItem, setPreviewItem] = useState<FileItem | null>(null)
  const [previewContent, setPreviewContent] = useState<{ text?: string; mediaUrl?: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState<boolean>(false)

  const [propertiesItem, setPropertiesItem] = useState<FileItem | null>(null)

  // Ensure size is calculated when opening Properties on a folder
  useEffect(() => {
    if (propertiesItem && propertiesItem.type === 'directory' && folderSizes[propertiesItem.path] === undefined) {
      window.electronAPI?.fs.getFolderSize(propertiesItem.path).then((res) => {
        if (res?.success && res.size !== undefined) {
          setFolderSizes((prev) => ({ ...prev, [propertiesItem.path]: res.size! }))
        }
      })
    }
  }, [propertiesItem, folderSizes])
  const [isNewFolderOpen, setIsNewFolderOpen] = useState<boolean>(false)
  const [newFolderName, setNewFolderName] = useState<string>('')
  const [isRenameOpen, setIsRenameOpen] = useState<boolean>(false)
  const [renameTarget, setRenameTarget] = useState<FileItem | null>(null)
  const [renameValue, setRenameValue] = useState<string>('')
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false)
  const [deletePermanent, setDeletePermanent] = useState<boolean>(false)

  // Context Menu State (Windows 11 Glass style)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    item: FileItem | null
  } | null>(null)

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Favorites checking & toggling
  const isItemFavorite = (filePath: string) => {
    try {
      const raw = localStorage.getItem('sf-favorites')
      if (raw) {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) && parsed.some((f: any) => f.path === filePath)
      }
    } catch {}
    return false
  }

  const toggleFavorite = (item: FileItem) => {
    try {
      const raw = localStorage.getItem('sf-favorites')
      let list: Array<{ name: string; path: string; addedAt: string }> = raw ? JSON.parse(raw) : []
      if (!Array.isArray(list)) list = []
      if (list.some((f) => f.path === item.path)) {
        list = list.filter((f) => f.path !== item.path)
        showToast(`Removed "${item.name}" from Favorites`)
      } else {
        list.push({ name: item.name, path: item.path, addedAt: new Date().toISOString() })
        showToast(`Added "${item.name}" to Favorites ⭐`)
      }
      localStorage.setItem('sf-favorites', JSON.stringify(list))
    } catch {}
  }

  // Compress to ZIP
  const handleCompress = async (item: FileItem) => {
    showToast(`Compressing "${item.name}" to ZIP... ⏳`)
    try {
      const res = await window.electronAPI?.fs.compressToZip(item.path)
      if (res?.success) {
        showToast(`Created ${item.name}.zip successfully! 📦`)
        loadDirectory(currentPath)
      } else {
        showToast(`Compression failed: ${res?.error || 'Unknown error'}`)
      }
    } catch (e: any) {
      showToast(`Compression error: ${e.message}`)
    }
  }

  // Copy As Path
  const handleCopyPath = (item: FileItem) => {
    navigator.clipboard.writeText(`"${item.path}"`)
    showToast(`Path copied: "${item.path}"`)
  }

  // Share to phone
  const handleShareToPhone = async (item: FileItem) => {
    const res = await window.electronAPI?.transfer.addSharedFile(item.path)
    if (res?.success) {
      showToast(`Sent "${item.name}" to Phone! Scan QR to download 📱`)
    } else {
      showToast('Could not share file to phone')
    }
  }

  // Context menu trigger handlers
  const handleItemContextMenu = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedPaths.has(item.path)) {
      setSelectedPaths(new Set([item.path]))
    }
    setContextMenu({ x: e.clientX, y: e.clientY, item })
  }

  const handleBackgroundContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, item: null })
  }

  // Load drives
  useEffect(() => {
    window.electronAPI?.fs.getDrives().then((res) => {
      if (res?.success && res.data) {
        setDrives(res.data)
      }
    })
  }, [])

  // Resolve target directory path - Defaults dynamically to primary detected system drive (e.g. C:\ on Windows, / on Unix)
  useEffect(() => {
    if (encodedPath) {
      try {
        const decoded = decodeURIComponent(encodedPath)
        setCurrentPath(decoded)
      } catch {
        const fallback = drives[0]?.letter
          ? (drives[0].letter.endsWith('\\') || drives[0].letter.endsWith('/') ? drives[0].letter : `${drives[0].letter}\\`)
          : 'C:\\'
        setCurrentPath(fallback)
      }
    } else {
      const fallback = drives[0]?.letter
        ? (drives[0].letter.endsWith('\\') || drives[0].letter.endsWith('/') ? drives[0].letter : `${drives[0].letter}\\`)
        : 'C:\\'
      setCurrentPath(fallback)
    }
  }, [encodedPath, drives])

  // Load Directory Items
  const loadDirectory = useCallback(async (dirPath: string) => {
    if (!dirPath) return
    setLoading(true)
    setError(null)
    setSelectedPaths(new Set())

    try {
      if (dirPath.startsWith('category:')) {
        const cat = dirPath.split(':')[1] || 'videos'
        const result = await window.electronAPI?.fs.getCategoryFiles(cat)
        if (result?.success && result.data) {
          setItems(result.data)
        } else {
          setError(result?.error || `Failed to load ${cat} files`)
        }
      } else {
        const result = await window.electronAPI?.fs.readDir(dirPath)
        if (result?.success) {
          setItems(result.data || [])
          if (result.isPortableDevice) {
            setDeviceInfo({
              isPortable: true,
              deviceName: result.deviceName || 'Portable Device',
              isEmptyOrLocked: result.isEmptyOrLocked,
            })
          } else {
            setDeviceInfo(null)
          }
        } else {
          setError(result?.error || 'Failed to read directory')
          setDeviceInfo(null)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error reading directory')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentPath) {
      loadDirectory(currentPath)
    }
  }, [currentPath, loadDirectory])

  // Automatically load tree breakdown when Tree View is selected
  useEffect(() => {
    if (viewMode === 'tree' && currentPath) {
      setTreeLoading(true)
      window.electronAPI?.analyzer.startScan(currentPath).then((res) => {
        if (res?.success && res.data?.rootTree) {
          setTreeData(res.data)
        }
      }).finally(() => {
        setTreeLoading(false)
      })
    }
  }, [viewMode, currentPath])

  // Navigate to folder
  const navigateTo = (targetPath: string) => {
    navigate(`/explorer/${encodeURIComponent(targetPath)}`)
  }

  // Navigate Up
  const navigateUp = () => {
    if (!currentPath) return
    if (currentPath.startsWith('category:')) {
      navigate('/dashboard')
      return
    }
    if (currentPath.startsWith('portable://')) {
      const parts = currentPath.replace(/^portable:\/\//, '').split('/').filter(Boolean)
      if (parts.length <= 1) {
        navigate('/dashboard')
        return
      }
      parts.pop()
      navigateTo(`portable://${parts.join('/')}`)
      return
    }
    const isDriveRoot = /^[A-Z]:\\?$/i.test(currentPath)
    if (isDriveRoot) {
      if (isFromDashboard) {
        navigate('/dashboard')
      }
      return
    }
    const parts = currentPath.replace(/\\$/, '').split('\\')
    parts.pop()
    const parentPath = parts.join('\\') + (parts.length === 1 ? '\\' : '')
    // If user opened a shortcut (like Desktop or Downloads) from Dashboard, navigating up from it returns to Dashboard
    if (isFromDashboard && location.state?.initialPath && currentPath.toLowerCase() === (location.state.initialPath as string).toLowerCase()) {
      navigate('/dashboard')
      return
    }
    navigateTo(parentPath)
  }

  // Breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return []
    if (currentPath.startsWith('category:')) {
      const cat = currentPath.split(':')[1].toLowerCase()
      const title =
        cat === 'videos' || cat === 'video'
          ? 'All Videos'
          : cat === 'music' || cat === 'audio'
          ? 'All Music'
          : cat === 'images' || cat === 'pictures'
          ? 'All Pictures'
          : cat === 'documents' || cat === 'docs'
          ? 'All Documents'
          : `All ${cat}`
      return [
        { label: 'Dashboard', path: 'route:/dashboard' },
        { label: `${title} (${items.length} files)`, path: currentPath },
      ]
    }
    if (currentPath.startsWith('portable://')) {
      const rest = currentPath.replace(/^portable:\/\//, '')
      const parts = rest.split('/').filter(Boolean)
      const crumbs: Array<{ label: string; path: string }> = [
        { label: 'Dashboard', path: 'route:/dashboard' }
      ]
      let accumulated = 'portable:/'
      parts.forEach((part) => {
        accumulated += `/${part}`
        crumbs.push({ label: part, path: accumulated })
      })
      return crumbs
    }
    const normalized = currentPath.replace(/\//g, '\\')
    const parts = normalized.split('\\').filter(Boolean)
    const crumbs: Array<{ label: string; path: string }> = []

    if (isFromDashboard) {
      crumbs.push({ label: 'Dashboard', path: 'route:/dashboard' })
    }

    let accumulated = ''
    parts.forEach((part, idx) => {
      if (idx === 0) {
        accumulated = part.includes(':') ? `${part}\\` : part
        crumbs.push({ label: part, path: accumulated })
      } else {
        accumulated = `${accumulated.replace(/\\$/, '')}\\${part}`
        crumbs.push({ label: part, path: accumulated })
      }
    })
    return crumbs
  }, [currentPath, items.length, isFromDashboard])

  // Filtered and Sorted items (debounced for optimal responsiveness)
  const processedItems = useMemo(() => {
    let result = [...items]

    if (debouncedQuery.trim()) {
      const q = debouncedQuery.toLowerCase()
      result = result.filter((i) => i.name.toLowerCase().includes(q))
    }

    result.sort((a, b) => {
      // Directories always come first
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }

      let comparison = 0
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      } else if (sortField === 'size') {
        const sizeA = a.type === 'directory' ? (folderSizes[a.path] || 0) : (a.size || 0)
        const sizeB = b.type === 'directory' ? (folderSizes[b.path] || 0) : (b.size || 0)
        comparison = sizeA - sizeB
      } else if (sortField === 'modified') {
        comparison = new Date(a.modified).getTime() - new Date(b.modified).getTime()
      } else if (sortField === 'type') {
        comparison = (a.extension || '').localeCompare(b.extension || '')
      }

      return sortOrder === 'asc' ? comparison : -comparison
    })

    return result
  }, [items, debouncedQuery, sortField, sortOrder, sortField === 'size' ? folderSizes : null])

  // Windowed / Chunked visible slice for instantaneous rendering of large folders
  const visibleItems = useMemo(() => {
    return processedItems.slice(0, renderLimit)
  }, [processedItems, renderLimit])

  // Automatically calculate real folder consumption sizes asynchronously in high-speed batches
  useEffect(() => {
    const pathAtStart = currentPath
    const dirItems = items.filter((i) => i.type === 'directory' && !i.path.startsWith('portable://'))
    if (dirItems.length === 0) return

    // Priority: compute sizes for currently visible directories first to make UI feel instant
    const visiblePathSet = new Set(items.slice(0, renderLimit).map((v) => v.path))
    const currentSizes = folderSizesRef.current
    const uncachedDirs = [
      ...dirItems.filter((d) => visiblePathSet.has(d.path) && currentSizes[d.path] === undefined),
      ...dirItems.filter((d) => !visiblePathSet.has(d.path) && currentSizes[d.path] === undefined),
    ]

    if (uncachedDirs.length === 0) return
    const uncachedPaths = uncachedDirs.map((d) => d.path)

    // Ultra-fast parallel batch calculation
    const electronFs = (window as any).electronAPI?.fs
    if (electronFs?.getFolderSizesBatch) {
      electronFs
        .getFolderSizesBatch(uncachedPaths)
        .then((res: any) => {
          if (currentPathRef.current === pathAtStart && res?.success && res.data) {
            setFolderSizes((prev: Record<string, number>) => ({ ...prev, ...res.data }))
          }
        })
        .catch(() => {})
    } else {
      let pendingUpdates: Record<string, number> = {}
      let timer: any = null

      const flush = () => {
        if (currentPathRef.current !== pathAtStart || Object.keys(pendingUpdates).length === 0) return
        setFolderSizes((prev) => ({ ...prev, ...pendingUpdates }))
        pendingUpdates = {}
      }

      uncachedDirs.forEach(async (dir) => {
        try {
          const res = await window.electronAPI?.fs.getFolderSize(dir.path)
          if (currentPathRef.current === pathAtStart) {
            const sz = res && typeof res.size === 'number' ? res.size : 0
            pendingUpdates[dir.path] = sz
            if (!timer) {
              timer = setTimeout(() => {
                flush()
                timer = null
              }, 40)
            }
          }
        } catch {
          if (currentPathRef.current === pathAtStart) {
            pendingUpdates[dir.path] = 0
            if (!timer) {
              timer = setTimeout(() => {
                flush()
                timer = null
              }, 40)
            }
          }
        }
      })
    }
  }, [currentPath, items, renderLimit])

  // Selection handlers
  const toggleSelect = (itemPath: string, multi = false) => {
    const next = new Set(multi ? selectedPaths : [])
    if (next.has(itemPath)) {
      next.delete(itemPath)
    } else {
      next.add(itemPath)
    }
    setSelectedPaths(next)
  }

  const selectAll = () => {
    if (selectedPaths.size === processedItems.length) {
      setSelectedPaths(new Set())
    } else {
      setSelectedPaths(new Set(processedItems.map((i) => i.path)))
    }
  }

  // Create Folder
  const handleCreateFolder = async () => {
    if (currentPath.startsWith('category:')) {
      showToast('Cannot create folders in category view. Open a directory first.')
      return
    }
    if (!newFolderName.trim() || !isValidFileName(newFolderName)) {
      alert('Please enter a valid folder name.')
      return
    }
    const newPath = `${currentPath.replace(/\\$/, '')}\\${newFolderName.trim()}`
    const res = await window.electronAPI?.fs.createDir(newPath)
    if (res?.success) {
      setIsNewFolderOpen(false)
      setNewFolderName('')
      loadDirectory(currentPath)
    } else {
      alert(`Error creating folder: ${res?.error}`)
    }
  }

  // Rename File / Folder
  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim() || !isValidFileName(renameValue)) {
      alert('Please enter a valid file/folder name.')
      return
    }
    const parentDir = renameTarget.path.substring(0, renameTarget.path.lastIndexOf('\\'))
    const newPath = `${parentDir}\\${renameValue.trim()}`
    const res = await window.electronAPI?.fs.rename(renameTarget.path, newPath)
    if (res?.success) {
      setIsRenameOpen(false)
      setRenameTarget(null)
      loadDirectory(currentPath)
    } else {
      alert(`Rename error: ${res?.error}`)
    }
  }

  // Delete Action
  const handleDelete = async () => {
    const targets = Array.from(selectedPaths)
    if (targets.length === 0) return

    for (const p of targets) {
      if (deletePermanent) {
        await window.electronAPI?.fs.delete(p)
      } else {
        await window.electronAPI?.fs.moveToTrash(p)
      }
    }
    setIsDeleteOpen(false)
    setSelectedPaths(new Set())
    loadDirectory(currentPath)
  }

  // Copy / Cut / Paste
  const handleCopy = () => {
    if (selectedPaths.size === 0) return
    setClipboard({ paths: Array.from(selectedPaths), operation: 'copy' })
    showToast(`Copied ${selectedPaths.size} item(s) to clipboard (Ctrl+C)`)
  }

  const handleCut = () => {
    if (selectedPaths.size === 0) return
    setClipboard({ paths: Array.from(selectedPaths), operation: 'cut' })
    showToast(`Cut ${selectedPaths.size} item(s) to clipboard (Ctrl+X)`)
  }

  const handlePaste = async () => {
    if (currentPath.startsWith('category:')) {
      showToast('Cannot paste into unified media view. Open a target folder first.')
      return
    }
    if (!clipboard || clipboard.paths.length === 0) {
      showToast('Clipboard is empty')
      return
    }
    showToast(`Pasting ${clipboard.paths.length} item(s)... ⏳`)
    let count = 0
    for (const src of clipboard.paths) {
      const fileName = src.split('\\').pop() || 'item'
      const dest = `${currentPath.replace(/\\$/, '')}\\${fileName}`
      if (clipboard.operation === 'copy') {
        await window.electronAPI?.fs.copy(src, dest)
      } else {
        await window.electronAPI?.fs.move(src, dest)
      }
      count++
    }
    showToast(`Pasted ${count} item(s) successfully! 📋`)
    if (clipboard.operation === 'cut') {
      setClipboard(null)
    }
    loadDirectory(currentPath)
  }

  // Global Keyboard Shortcuts (Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Delete, F2, F5, Enter, Ctrl+Shift+N)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input field or textarea
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }

      const isCtrl = e.ctrlKey || e.metaKey

      // Ctrl + C (Copy)
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'c') {
        if (selectedPaths.size > 0) {
          e.preventDefault()
          handleCopy()
        }
        return
      }

      // Ctrl + X (Cut)
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'x') {
        if (selectedPaths.size > 0) {
          e.preventDefault()
          handleCut()
        }
        return
      }

      // Ctrl + V (Paste)
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        handlePaste()
        return
      }

      // Ctrl + A (Select All)
      if (isCtrl && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectAll()
        return
      }

      // Ctrl + Shift + N (New Folder)
      if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setIsNewFolderOpen(true)
        return
      }

      // Delete (Delete to Trash) / Shift + Delete (Permanent)
      if (e.key === 'Delete') {
        if (selectedPaths.size > 0) {
          e.preventDefault()
          setDeletePermanent(e.shiftKey)
          setIsDeleteOpen(true)
        }
        return
      }

      // F2 (Rename)
      if (e.key === 'F2') {
        if (selectedPaths.size === 1) {
          e.preventDefault()
          const p = Array.from(selectedPaths)[0]
          const target = items.find((i) => i.path === p)
          if (target) {
            setRenameTarget(target)
            setRenameValue(target.name)
            setIsRenameOpen(true)
          }
        }
        return
      }

      // F5 (Refresh)
      if (e.key === 'F5') {
        e.preventDefault()
        loadDirectory(currentPath)
        showToast('Refreshed directory (F5)')
        return
      }

      // Enter (Open selected item)
      if (e.key === 'Enter') {
        if (selectedPaths.size === 1) {
          e.preventDefault()
          const p = Array.from(selectedPaths)[0]
          const target = items.find((i) => i.path === p)
          if (target) {
            if (target.type === 'directory') navigateTo(target.path)
            else {
              if (target.path.startsWith('portable://')) showToast(`Opening "${target.name}"... ⏳`)
              window.electronAPI?.shell.openFile(target.path)
            }
          }
        }
        return
      }

      // Escape (Deselect / Dismiss context menu)
      if (e.key === 'Escape') {
        setSelectedPaths(new Set())
        setContextMenu(null)
      }

      // Alt + Left Arrow or Backspace (Back to Dashboard)
      if ((e.altKey && e.key === 'ArrowLeft') || e.key === 'Backspace') {
        e.preventDefault()
        if (currentPath.startsWith('category:') || isFromDashboard) {
          navigate('/dashboard')
        } else {
          navigateUp()
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPaths, clipboard, currentPath, items, processedItems, loadDirectory])

  // Drag and Drop States
  const [draggedPaths, setDraggedPaths] = useState<string[]>([])
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [isExternalDragOver, setIsExternalDragOver] = useState<boolean>(false)

  // Start dragging item(s) from StorageFlow
  const handleDragStart = (e: React.DragEvent, item: FileItem) => {
    const pathsToDrag = selectedPaths.has(item.path)
      ? Array.from(selectedPaths)
      : [item.path]
    setDraggedPaths(pathsToDrag)
    e.dataTransfer.setData('text/plain', JSON.stringify(pathsToDrag))
    e.dataTransfer.effectAllowed = 'copyMove'
  }

  const handleDragEnd = () => {
    setDraggedPaths([])
    setDragOverFolder(null)
    setIsExternalDragOver(false)
  }

  // Handle Drag Over a target folder card/row
  const handleDragOverTargetFolder = (e: React.DragEvent, folder: FileItem) => {
    e.preventDefault()
    e.stopPropagation()
    if (folder.type !== 'directory') return
    if (draggedPaths.includes(folder.path)) return
    e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move'
    if (dragOverFolder !== folder.path) {
      setDragOverFolder(folder.path)
    }
  }

  const handleDragLeaveTargetFolder = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
  }

  // Drop on a folder card/row (Move or Copy into that folder)
  const handleDropOnTargetFolder = async (e: React.DragEvent, targetFolder: FileItem) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
    if (targetFolder.type !== 'directory') return

    let sources: string[] = draggedPaths
    if (sources.length === 0) {
      try {
        const text = e.dataTransfer.getData('text/plain')
        if (text) sources = JSON.parse(text)
      } catch {}
    }

    if ((!sources || sources.length === 0) && e.dataTransfer.files?.length > 0) {
      sources = Array.from(e.dataTransfer.files).map((f: any) => f.path).filter(Boolean)
    }

    if (!sources || sources.length === 0) return

    const isCopy = e.ctrlKey
    let successCount = 0

    for (const src of sources) {
      if (src === targetFolder.path) continue
      const name = src.split('\\').pop() || 'item'
      const dest = `${targetFolder.path.replace(/\\$/, '')}\\${name}`
      if (isCopy) {
        await window.electronAPI?.fs.copy(src, dest)
      } else {
        await window.electronAPI?.fs.move(src, dest)
      }
      successCount++
    }

    showToast(`${isCopy ? 'Copied' : 'Moved'} ${successCount} item(s) into "${targetFolder.name}" 📂`)
    setSelectedPaths(new Set())
    setDraggedPaths([])
    loadDirectory(currentPath)
  }

  // Handle Drag Over the main background (External file drag from Windows Explorer)
  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!isExternalDragOver) {
      setIsExternalDragOver(true)
    }
  }

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsExternalDragOver(false)
    }
  }

  // Drop onto empty space in the current folder (External file import from Windows Explorer)
  const handleContainerDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsExternalDragOver(false)
    if (currentPath.startsWith('category:')) {
      showToast('Please open a specific directory to import files.')
      return
    }

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      let count = 0
      showToast(`Importing ${files.length} item(s) from Windows Explorer... ⏳`)
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const srcPath = (file as any).path
        if (srcPath) {
          const dest = `${currentPath.replace(/\\$/, '')}\\${file.name}`
          await window.electronAPI?.fs.copy(srcPath, dest)
          count++
        }
      }
      if (count > 0) {
        showToast(`Copied ${count} item(s) into this folder! 🎉`)
        loadDirectory(currentPath)
      }
    }
  }

  // File Preview
  const handlePreview = async (item: FileItem) => {
    setPreviewItem(item)
    setPreviewLoading(true)
    setPreviewContent(null)

    if (item.type === 'directory') {
      setPreviewLoading(false)
      return
    }

    try {
      const res = await window.electronAPI?.fs.readFile(item.path)
      if (res?.success && res.data) {
        if (res.isMedia) {
          setPreviewContent({ mediaUrl: res.data })
        } else {
          setPreviewContent({ text: res.data })
        }
      } else {
        setPreviewContent({ text: res?.error || 'Unable to preview file contents.' })
      }
    } catch (e: any) {
      setPreviewContent({ text: e.message })
    } finally {
      setPreviewLoading(false)
    }
  }

  // Share via Wireless Transfer
  const handleShareWireless = async (item: FileItem) => {
    if (item.type === 'directory') {
      alert('Please select files for wireless transfer.')
      return
    }
    const res = await window.electronAPI?.transfer.addSharedFile(item.path)
    if (res?.success) {
      navigate('/transfer')
    } else {
      alert('Could not add file to wireless transfer queue.')
    }
  }

  const getFileIcon = (item: FileItem) => {
    if (item.type === 'directory') {
      return <Folder size={viewMode === 'grid' ? 36 : 18} className="text-amber-400" />
    }
    const category = getFileTypeCategory(item.extension)
    const color = getFileTypeColor(item.extension)
    const iconSize = viewMode === 'grid' ? 34 : 17

    switch (category) {
      case 'Images':
        return <ImageIcon size={iconSize} style={{ color }} />
      case 'Videos':
        return <Video size={iconSize} style={{ color }} />
      case 'Audio':
        return <Music size={iconSize} style={{ color }} />
      case 'Documents':
        return <FileText size={iconSize} style={{ color }} />
      case 'Code':
        return <Code size={iconSize} style={{ color }} />
      case 'Archives':
        return <Archive size={iconSize} style={{ color }} />
      default:
        return <File size={iconSize} style={{ color }} />
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Top Toolbar */}
      <div
        className="px-6 py-3 border-b flex flex-wrap items-center justify-between gap-3 transition-colors"
        style={{
          background: theme === 'light' ? 'rgba(255, 255, 255, 0.75)' : 'rgba(15, 15, 24, 0.6)',
          borderColor: theme === 'light' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Navigation & Breadcrumbs */}
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <button
            onClick={() => navigate('/dashboard')}
            title="Return to Dashboard"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 hover:text-white border border-blue-500/30 hover:border-blue-500/50 transition-all text-xs font-bold shadow-sm flex-shrink-0"
          >
            <ArrowLeft size={14} />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <button
            onClick={navigateUp}
            title={currentPath.startsWith('category:') || isFromDashboard ? 'Return to Dashboard' : 'Go to parent directory'}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowUp size={16} />
          </button>
          <button
            onClick={() => loadDirectory(currentPath)}
            title="Reload directory"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors flex-shrink-0"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          {/* Breadcrumb Path Bar */}
          <div className="flex-1 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 overflow-x-auto text-xs font-medium">
            {breadcrumbs.map((crumb, idx) => (
              <div key={crumb.path} className="flex items-center gap-1 flex-shrink-0">
                {idx > 0 && <ChevronRight size={12} className="text-gray-500" />}
                <button
                  onClick={() => {
                    if (crumb.path.startsWith('route:')) {
                      navigate(crumb.path.replace('route:', ''))
                    } else {
                      navigateTo(crumb.path)
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors ${
                    idx === breadcrumbs.length - 1
                      ? 'text-white font-semibold'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {crumb.label}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2">
          {/* Instant Search Bar */}
          <div className="relative w-48 lg:w-64">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search in folder..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none focus:border-blue-500/80 transition-all"
            />
          </div>

          {/* New Folder */}
          <Button
            variant="secondary"
            size="sm"
            disabled={currentPath.startsWith('category:')}
            onClick={() => setIsNewFolderOpen(true)}
            icon={<FolderPlus size={14} />}
            title={currentPath.startsWith('category:') ? 'Cannot create new folder in category view' : 'Create New Folder'}
          >
            New Folder
          </Button>

          {/* Grid / List / Tree Switch */}
          <div className="flex items-center bg-white/5 p-0.5 rounded-xl border border-white/10">
            <button
              onClick={() => setViewMode('grid')}
              title="Grid View"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="List View"
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              <ListIcon size={14} />
            </button>
            <button
              onClick={() => setViewMode('tree')}
              title="Tree Size Breakdown (Shows folder consumption tree)"
              className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'tree'
                  ? 'bg-amber-500 text-black font-bold shadow-md shadow-amber-500/30'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              <FolderTree size={14} className={viewMode === 'tree' ? 'text-black' : 'text-amber-400'} />
              <span className="text-[11px] font-semibold">Tree Size</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-toolbar: Selection & Clipboard Controls */}
      <div className="px-6 py-2 border-b border-white/5 bg-white/[0.02] flex items-center justify-between text-xs text-gray-400">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="flex items-center gap-1.5 hover:text-white transition-colors"
          >
            {selectedPaths.size > 0 && selectedPaths.size === processedItems.length ? (
              <CheckSquare size={13} className="text-blue-400" />
            ) : (
              <Square size={13} />
            )}
            <span>
              {selectedPaths.size > 0 ? `${selectedPaths.size} selected` : 'Select all'}
            </span>
          </button>

          {selectedPaths.size > 0 && (
            <div className="flex items-center gap-1 border-l border-white/10 pl-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 hover:text-white transition-colors"
              >
                <Copy size={12} /> Copy
              </button>
              <button
                onClick={handleCut}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 hover:text-white transition-colors"
              >
                <Scissors size={12} /> Cut
              </button>
              <button
                onClick={() => {
                  const firstPath = Array.from(selectedPaths)[0]
                  const target = items.find((i) => i.path === firstPath)
                  if (target) {
                    setRenameTarget(target)
                    setRenameValue(target.name)
                    setIsRenameOpen(true)
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 rounded hover:bg-white/10 hover:text-white transition-colors"
              >
                <Edit2 size={12} /> Rename
              </button>
              <button
                onClick={() => setIsDeleteOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}

          {clipboard && (
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <Badge color="#3b82f6">
                {clipboard.paths.length} ready to {clipboard.operation}
              </Badge>
              <button
                onClick={handlePaste}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 transition-colors font-medium"
              >
                <Clipboard size={12} /> Paste Here
              </button>
            </div>
          )}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Sort by:</span>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="bg-transparent text-gray-300 font-medium outline-none cursor-pointer"
            >
              <option value="name" className="bg-[#12121c]">Name</option>
              <option value="size" className="bg-[#12121c]">Size</option>
              <option value="modified" className="bg-[#12121c]">Date Modified</option>
              <option value="type" className="bg-[#12121c]">File Type</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-1 hover:text-white"
            >
              <ArrowUpDown size={12} />
            </button>
          </div>
          <span>{processedItems.length} items</span>
        </div>
      </div>

      {/* Main Files View Area */}
      <div
        className="flex-1 overflow-y-auto p-6 relative"
        onContextMenu={handleBackgroundContextMenu}
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleContainerDrop}
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
          if (scrollHeight - scrollTop <= clientHeight + 400) {
            setRenderLimit((prev) => Math.min(prev + 60, processedItems.length))
          }
        }}
      >
        {/* Full-container External Drag & Drop Overlay */}
        <AnimatePresence>
          {isExternalDragOver && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="absolute inset-4 z-40 rounded-3xl border-2 border-dashed border-blue-500/80 bg-blue-950/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-8 pointer-events-none shadow-2xl shadow-blue-500/20"
            >
              <div className="w-20 h-20 rounded-3xl bg-blue-500/20 flex items-center justify-center text-blue-400 mb-4 animate-bounce">
                <Clipboard size={36} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Drop Files Here to Copy</h2>
              <p className="text-xs text-blue-300 font-mono max-w-md truncate">
                Destination: {currentPath}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <RefreshCw size={24} className="animate-spin text-blue-400" />
            <p className="text-sm">Reading directory contents...</p>
          </div>
        ) : error ? (
          (deviceInfo?.isPortable || currentPath.startsWith('portable://')) ? (
            <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto my-12">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center text-purple-400 mb-4 animate-pulse">
                <Smartphone size={32} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">
                {deviceInfo?.deviceName || currentPath.replace(/^portable:\/\//, '').split('/')[0]}
              </h3>
              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Device storage is locked or waiting for connection. Please <span className="text-purple-300 font-medium">unlock your phone/tablet screen</span> and set USB mode to <span className="text-purple-300 font-medium">'File Transfer (MTP)'</span>.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    window.electronAPI?.fs.openDeviceInExplorer(
                      deviceInfo?.deviceName || currentPath.replace(/^portable:\/\//, '').split('/')[0]
                    )
                  }
                  icon={<ExternalLink size={14} />}
                >
                  Open in Windows Explorer
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadDirectory(currentPath)}
                  icon={<RefreshCw size={14} />}
                >
                  Refresh Files
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-400">
              <p className="text-sm font-semibold">{error}</p>
              <Button variant="secondary" size="sm" onClick={() => loadDirectory(currentPath)}>
                Retry
              </Button>
            </div>
          )
        ) : processedItems.length === 0 ? (
          deviceInfo?.isPortable ? (
            <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto my-12">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/15 flex items-center justify-center text-purple-400 mb-4 animate-pulse">
                <Smartphone size={32} />
              </div>
              <h3 className="text-base font-bold text-white mb-2">{deviceInfo.deviceName} Connected</h3>
              <p className="text-xs text-gray-400 mb-6 leading-relaxed">
                Device is recognized by Windows. If folders or files are not showing yet, please <span className="text-purple-300 font-medium">unlock your phone/tablet</span> and select <span className="text-purple-300 font-medium">'File Transfer (MTP)'</span> in the USB settings notification.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => window.electronAPI?.fs.openDeviceInExplorer(deviceInfo.deviceName)}
                  icon={<ExternalLink size={14} />}
                >
                  Open in Windows Explorer
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => loadDirectory(currentPath)}
                  icon={<RefreshCw size={14} />}
                >
                  Refresh Files
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 gap-2 text-gray-500">
              <Folder size={36} className="text-gray-600" />
              <p className="text-sm font-medium">
                {currentPath.startsWith('category:')
                  ? `No ${currentPath.split(':')[1]} files found on your PC`
                  : 'This folder is empty'}
              </p>
            </div>
          )
        ) : viewMode === 'grid' ? (
          /* Grid View Layout with Native Drag & Drop */
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {visibleItems.map((item) => {
                const isSelected = selectedPaths.has(item.path)
                const isTargetFolder = dragOverFolder === item.path

              return (
                <div
                  key={item.path}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDragEnd={handleDragEnd}
                  onDragOver={item.type === 'directory' ? (e) => handleDragOverTargetFolder(e, item) : undefined}
                  onDragLeave={item.type === 'directory' ? handleDragLeaveTargetFolder : undefined}
                  onDrop={item.type === 'directory' ? (e) => handleDropOnTargetFolder(e, item) : undefined}
                  onClick={(e) => toggleSelect(item.path, e.ctrlKey || e.metaKey)}
                  onContextMenu={(e) => handleItemContextMenu(e, item)}
                  onDoubleClick={async () => {
                    if (item.type === 'directory') {
                      navigateTo(item.path)
                    } else {
                      if (item.path.startsWith('portable://')) {
                        showToast(`Opening "${item.name}"... ⏳`)
                      }
                      const res = await window.electronAPI?.shell.openFile(item.path)
                      if (!res?.success && res?.error) {
                        showToast(`Could not open: ${res.error}`)
                      }
                    }
                  }}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '160px' }}
                  className={`group relative p-3 rounded-2xl flex flex-col items-center text-center cursor-pointer transition-all border ${
                    isTargetFolder
                      ? 'ring-2 ring-blue-500 bg-blue-500/25 border-blue-400 scale-[1.04] shadow-xl shadow-blue-500/20'
                      : isSelected
                      ? 'bg-blue-600/20 border-blue-500/60 shadow-lg shadow-blue-500/10'
                      : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.07] hover:border-white/15'
                  }`}
                >
                  {isTargetFolder && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold shadow-md z-10 whitespace-nowrap">
                      Move here 📥
                    </span>
                  )}

                  <div className="w-full mb-2 mt-1">
                    <FileThumbnail item={item} viewMode="grid" />
                  </div>

                  <p
                    className="text-xs font-semibold text-gray-200 line-clamp-2 w-full break-words group-hover:text-blue-400 transition-colors"
                    title={item.name}
                  >
                    {item.name}
                  </p>

                  <span className={`text-[10px] mt-1 font-medium ${item.type === 'directory' ? 'text-amber-400 font-semibold' : 'text-gray-400'}`}>
                    {item.type === 'directory'
                      ? folderSizes[item.path] !== undefined
                        ? formatBytes(folderSizes[item.path])
                        : 'Calculating...'
                      : formatBytes(item.size)}
                  </span>

                  {/* Hover Quick Actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-black/70 backdrop-blur-md rounded-lg p-1">
                    {item.type === 'file' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handlePreview(item)
                        }}
                        title="Preview"
                        className="p-1 hover:text-blue-400 transition-colors"
                      >
                        <Eye size={12} />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setPropertiesItem(item)
                      }}
                      title="Properties"
                      className="p-1 hover:text-white transition-colors"
                    >
                      <Info size={12} />
                    </button>
                    {item.type === 'file' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleShareWireless(item)
                        }}
                        title="Share wirelessly"
                        className="p-1 hover:text-emerald-400 transition-colors"
                      >
                        <Share2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {processedItems.length > renderLimit && (
            <div className="py-4 text-center text-xs text-gray-500 font-medium">
              Showing {renderLimit} of {processedItems.length} items • Scroll down to load more
            </div>
          )}
        </div>
      ) : viewMode === 'list' ? (
        /* List View Layout with Native Drag & Drop */
        <div className="space-y-1">
          <div className="grid grid-cols-12 px-3 py-2 text-xs font-semibold text-gray-500 border-b border-white/5 uppercase tracking-wider">
            <span className="col-span-6">Name</span>
            <span className="col-span-2">Date Modified</span>
            <span className="col-span-2">Type</span>
            <span className="col-span-2 text-right">Size</span>
          </div>

          {visibleItems.map((item) => {
            const isSelected = selectedPaths.has(item.path)
            const isTargetFolder = dragOverFolder === item.path

              return (
                <div
                  key={item.path}
                  draggable={true}
                  onDragStart={(e) => handleDragStart(e, item)}
                  onDragEnd={handleDragEnd}
                  onDragOver={item.type === 'directory' ? (e) => handleDragOverTargetFolder(e, item) : undefined}
                  onDragLeave={item.type === 'directory' ? handleDragLeaveTargetFolder : undefined}
                  onDrop={item.type === 'directory' ? (e) => handleDropOnTargetFolder(e, item) : undefined}
                  onClick={(e) => toggleSelect(item.path, e.ctrlKey || e.metaKey)}
                  onContextMenu={(e) => handleItemContextMenu(e, item)}
                  onDoubleClick={async () => {
                    if (item.type === 'directory') {
                      navigateTo(item.path)
                    } else {
                      if (item.path.startsWith('portable://')) {
                        showToast(`Opening "${item.name}"... ⏳`)
                      }
                      const res = await window.electronAPI?.shell.openFile(item.path)
                      if (!res?.success && res?.error) {
                        showToast(`Could not open: ${res.error}`)
                      }
                    }
                  }}
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '40px' }}
                  className={`grid grid-cols-12 items-center px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-all border ${
                    isTargetFolder
                      ? 'ring-2 ring-blue-500 bg-blue-500/25 border-blue-400 scale-[1.01] shadow-lg shadow-blue-500/20'
                      : isSelected
                      ? 'bg-blue-600/20 border-blue-500/50 text-white font-medium'
                      : 'border-transparent hover:bg-white/5 text-gray-300'
                  }`}
                >
                  <div className="col-span-6 flex items-center gap-3 min-w-0 pr-4">
                    <FileThumbnail item={item} viewMode="list" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate font-medium">{item.name}</span>
                      {currentPath.startsWith('category:') && (
                        <span className="text-[10px] text-gray-400 truncate opacity-70" title={item.path}>
                          {item.path}
                        </span>
                      )}
                    </div>
                    {isTargetFolder && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-500 text-white text-[10px] font-bold flex-shrink-0">
                        Drop to move
                      </span>
                    )}
                  </div>
                  <div className="col-span-2 text-gray-400 truncate">
                    {formatDate(item.modified)}
                  </div>
                  <div className="col-span-2 text-gray-400 truncate">
                    {item.type === 'directory'
                      ? 'File folder'
                      : `${getFileTypeCategory(item.extension)} (${item.extension || 'file'})`}
                  </div>
                  <div className={`col-span-2 text-right font-medium ${item.type === 'directory' ? 'text-amber-400 font-semibold' : 'text-gray-300'}`}>
                    {item.type === 'directory'
                      ? folderSizes[item.path] !== undefined
                        ? formatBytes(folderSizes[item.path])
                        : 'Calculating...'
                      : formatBytes(item.size)}
                  </div>
                </div>
              )
            })}
            {processedItems.length > renderLimit && (
              <div className="py-4 text-center text-xs text-gray-500 font-medium">
                Showing {renderLimit} of {processedItems.length} items • Scroll down to load more
              </div>
            )}
          </div>
        ) : (
          /* Tree Size Hierarchical View for Current Folder (Matches Reference Image) */
          <div className="space-y-4">
            {treeLoading ? (
              <div className="flex flex-col items-center justify-center py-24 text-gray-400 gap-3">
                <RefreshCw size={26} className="animate-spin text-amber-400" />
                <p className="text-sm font-semibold text-white">Scanning Folder Storage Consumption...</p>
                <p className="text-xs text-gray-500 font-mono">{currentPath}</p>
              </div>
            ) : treeData?.rootTree ? (
              <FolderConsumptionTree
                rootNode={treeData.rootTree}
                totalScanSize={treeData.totalSize}
              />
            ) : (
              <div className="text-center py-16 text-gray-500 text-sm">
                No tree data available. Click reload to scan folder consumption.
              </div>
            )}
          </div>
        )}
      </div>

      {/* File Preview Drawer / Modal */}
      <Modal
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
        title={previewItem?.name || 'File Preview'}
        width="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-gray-400 pb-2 border-b border-white/10">
            <span>Size: {formatBytes(previewItem?.size || 0)}</span>
            <span>Modified: {formatDate(previewItem?.modified || '')}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (!previewItem) return
                if (previewItem.path.startsWith('portable://')) showToast(`Opening "${previewItem.name}"... ⏳`)
                window.electronAPI?.shell.openFile(previewItem.path)
              }}
              icon={<ExternalLink size={12} />}
            >
              Open with Default App
            </Button>
          </div>

          <div
            className="rounded-xl bg-black/40 border border-white/5 p-4 max-h-[480px] overflow-auto text-xs"
            style={{ fontFamily: 'Consolas, Monaco, monospace' }}
          >
            {previewLoading ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <RefreshCw size={20} className="animate-spin mr-2" /> Loading preview...
              </div>
            ) : previewContent?.mediaUrl ? (
              <div className="flex items-center justify-center py-4">
                <img
                  src={previewContent.mediaUrl}
                  alt={previewItem?.name}
                  className="max-h-[400px] object-contain rounded-lg shadow-lg"
                />
              </div>
            ) : previewContent?.text ? (
              <pre className="text-gray-200 whitespace-pre-wrap break-all leading-relaxed">
                {previewContent.text}
              </pre>
            ) : (
              <p className="text-center py-12 text-gray-500">
                No preview available for this binary format.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* Properties Modal */}
      <Modal
        open={!!propertiesItem}
        onClose={() => setPropertiesItem(null)}
        title="File Properties"
      >
        {propertiesItem && (
          <div className="space-y-3 text-xs">
            <div className="flex items-center gap-3 pb-3 border-b border-white/10">
              <div className="p-3 rounded-xl bg-white/5">{getFileIcon(propertiesItem)}</div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-white text-sm truncate">{propertiesItem.name}</h4>
                <p className="text-gray-400">
                  {propertiesItem.type === 'directory'
                    ? 'File Folder'
                    : `${propertiesItem.extension.toUpperCase()} File`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-gray-500">Full Path:</span>
              <span className="col-span-2 text-gray-200 break-all select-all font-mono">
                {propertiesItem.path}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-gray-500">Size:</span>
              <span className="col-span-2 text-gray-200 font-semibold">
                {propertiesItem.type === 'directory'
                  ? folderSizes[propertiesItem.path] !== undefined
                    ? `${formatBytes(folderSizes[propertiesItem.path])} (${folderSizes[propertiesItem.path].toLocaleString()} bytes)`
                    : 'Calculating size...'
                  : `${formatBytes(propertiesItem.size)} (${propertiesItem.size.toLocaleString()} bytes)`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-gray-500">Modified:</span>
              <span className="col-span-2 text-gray-200">
                {formatDate(propertiesItem.modified)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 py-1">
              <span className="text-gray-500">Created:</span>
              <span className="col-span-2 text-gray-200">
                {formatDate(propertiesItem.created)}
              </span>
            </div>

            <div className="pt-4 flex justify-end gap-2 border-t border-white/10">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.electronAPI?.shell.showInFolder(propertiesItem.path)}
              >
                Reveal in Explorer
              </Button>
              <Button variant="primary" size="sm" onClick={() => setPropertiesItem(null)}>
                OK
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* New Folder Modal */}
      <Modal
        open={isNewFolderOpen}
        onClose={() => setIsNewFolderOpen(false)}
        title="Create New Folder"
      >
        <div className="space-y-4">
          <Input
            label="Folder Name"
            placeholder="New Folder"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsNewFolderOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateFolder}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rename Modal */}
      <Modal open={isRenameOpen} onClose={() => setIsRenameOpen(false)} title="Rename File">
        <div className="space-y-4">
          <Input
            label="New Name"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleRename}>
              Rename
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Delete Confirmation"
      >
        <div className="space-y-4 text-xs text-gray-300">
          <p>
            Are you sure you want to delete{' '}
            <strong className="text-white">{selectedPaths.size} item(s)</strong>?
          </p>

          <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10">
            <input
              type="checkbox"
              checked={deletePermanent}
              onChange={(e) => setDeletePermanent(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-200">
              Permanently delete (bypass Recycle Bin)
            </span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Delete Now
            </Button>
          </div>
        </div>
      </Modal>

      {/* Windows 11 Style Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            targetItem={contextMenu.item}
            currentPath={currentPath}
            hasClipboard={!!clipboard && clipboard.paths.length > 0}
            isFavorite={contextMenu.item ? isItemFavorite(contextMenu.item.path) : false}
            onClose={() => setContextMenu(null)}
            onOpen={(item) => {
              if (item.type === 'directory') navigateTo(item.path)
              else {
                if (item.path.startsWith('portable://')) showToast(`Opening "${item.name}"... ⏳`)
                window.electronAPI?.shell.openFile(item.path)
              }
            }}
            onCut={(item) => {
              setClipboard({ paths: [item.path], operation: 'cut' })
              showToast(`Cut "${item.name}" to clipboard`)
            }}
            onCopy={(item) => {
              setClipboard({ paths: [item.path], operation: 'copy' })
              showToast(`Copied "${item.name}" to clipboard`)
            }}
            onRename={(item) => {
              setRenameTarget(item)
              setRenameValue(item.name)
              setIsRenameOpen(true)
            }}
            onDelete={(item) => {
              setSelectedPaths(new Set([item.path]))
              setIsDeleteOpen(true)
            }}
            onShareToPhone={handleShareToPhone}
            onToggleFavorite={toggleFavorite}
            onCompress={handleCompress}
            onCopyPath={handleCopyPath}
            onProperties={(item) => setPropertiesItem(item)}
            onOpenWith={(item, app) => window.electronAPI?.shell.openWith(item.path, app)}
            onOpenInExplorer={(item) => window.electronAPI?.shell.showInFolder(item.path)}
            onOpenTerminal={(p) => window.electronAPI?.shell.openTerminal(p)}
            onRefresh={() => loadDirectory(currentPath)}
            onNewFolder={() => setIsNewFolderOpen(true)}
            onPaste={handlePaste}
            onViewChange={(mode) => setViewMode(mode)}
            onSortChange={(field) => setSortField(field)}
          />
        )}
      </AnimatePresence>

      {/* Floating Action Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/95 text-white border border-white/15 shadow-2xl backdrop-blur-xl text-xs font-semibold flex items-center gap-2 select-none shadow-black/80"
          >
            <Sparkles size={14} className="text-blue-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

