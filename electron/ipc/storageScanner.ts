import fs from 'fs'
import path from 'path'
import { BrowserWindow } from 'electron'

export interface FolderFileItem {
  name: string
  path: string
  size: number
  extension: string
}

export interface FolderTreeNode {
  name: string
  path: string
  size: number
  fileCount: number
  filesTotalSize: number
  subfolders: FolderTreeNode[]
  files: FolderFileItem[]
}

export interface ScanResult {
  totalSize: number
  totalFiles: number
  totalFolders: number
  largestFolders: Array<{ path: string; name: string; size: number; fileCount: number }>
  largestFiles: Array<{ path: string; name: string; size: number; extension: string }>
  typeDistribution: Record<string, { size: number; count: number }>
  rootTree: FolderTreeNode
}

export class StorageScanner {
  private isCancelled = false
  private isScanning = false
  private targetPath = ''
  private currentProgress = {
    currentPath: '',
    scannedFiles: 0,
    scannedSize: 0,
    scannedFolders: 0,
  }
  private lastResult: ScanResult | null = null
  private lastError: string | null = null
  private scanCache = new Map<string, { timestamp: number; result: ScanResult }>()
  private CACHE_TTL = 10 * 60 * 1000 // 10 minutes cache

  public getStatus() {
    return {
      isScanning: this.isScanning,
      targetPath: this.targetPath,
      progress: this.currentProgress,
      lastResult: this.lastResult,
      error: this.lastError,
    }
  }

  public cancel(window?: BrowserWindow | null) {
    this.isCancelled = true
    this.isScanning = false
    if (window && !window.isDestroyed()) {
      window.webContents.send('analyzer:cancelled', { targetPath: this.targetPath })
    }
  }

  public getCached(scanPath: string): ScanResult | null {
    const cached = this.scanCache.get(scanPath)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.result
    }
    return null
  }

  private async quickCalc(startPath: string): Promise<{ size: number; fileCount: number; folderCount: number }> {
    let size = 0
    let fileCount = 0
    let folderCount = 0
    const queue: string[] = [startPath]
    let yields = 0

    while (queue.length > 0 && !this.isCancelled) {
      const current = queue.shift()!
      yields++
      if (yields % 100 === 0) {
        await new Promise((r) => setImmediate(r))
      }

      try {
        const entries = await fs.promises.readdir(current, { withFileTypes: true })
        for (const item of entries) {
          if (item.isSymbolicLink()) continue
          const full = path.join(current, item.name)
          try {
            if (item.isDirectory()) {
              if (item.name === '$RECYCLE.BIN' || item.name === 'System Volume Information') continue
              folderCount++
              queue.push(full)
            } else if (item.isFile()) {
              fileCount++
              const st = await fs.promises.stat(full)
              size += st.size
            }
          } catch {}
        }
      } catch {}
    }

    return { size, fileCount, folderCount }
  }

  public async scan(
    rootPath: string,
    window: BrowserWindow | null,
    maxDepth = 15
  ): Promise<{ success: boolean; data?: ScanResult; error?: string; cancelled?: boolean }> {
    if (this.isScanning) {
      return { success: false, error: 'A scan is already in progress' }
    }

    this.isScanning = true
    this.isCancelled = false
    this.targetPath = rootPath
    this.lastError = null
    this.currentProgress = {
      currentPath: 'Initializing scan...',
      scannedFiles: 0,
      scannedSize: 0,
      scannedFolders: 0,
    }

    const cached = this.getCached(rootPath)
    if (cached) {
      this.isScanning = false
      this.lastResult = cached
      if (window && !window.isDestroyed()) {
        window.webContents.send('analyzer:completed', { success: true, data: cached, targetPath: rootPath })
      }
      return { success: true, data: cached }
    }

    try {
      const typeDistribution: Record<string, { size: number; count: number }> = {}
      const largestFiles: FolderFileItem[] = []
      const largestFolders: Array<{ path: string; name: string; size: number; fileCount: number }> = []
      const visitedPaths = new Set<string>()

      let totalSize = 0
      let totalFiles = 0
      let totalFolders = 0
      let lastProgressReport = Date.now()

      const getFileTypeCategory = (ext: string): string => {
        const clean = ext.toLowerCase().replace('.', '')
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(clean)) return 'Images'
        if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(clean)) return 'Videos'
        if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(clean)) return 'Audio'
        if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'].includes(clean)) return 'Documents'
        if (['zip', 'rar', 'gz', 'tar', '7z', 'bz2', 'iso'].includes(clean)) return 'Archives'
        if (['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'java', 'cpp', 'c', 'h', 'css', 'html', 'json'].includes(clean)) return 'Code'
        return 'Other'
      }

      // Memory-bounded insertion helpers (avoids keeping hundreds of thousands of objects in RAM)
      const trackLargestFile = (item: FolderFileItem) => {
        if (largestFiles.length < 30) {
          largestFiles.push(item)
          largestFiles.sort((a, b) => b.size - a.size)
        } else if (item.size > largestFiles[largestFiles.length - 1].size) {
          largestFiles[largestFiles.length - 1] = item
          largestFiles.sort((a, b) => b.size - a.size)
        }
      }

      const trackLargestFolder = (item: { path: string; name: string; size: number; fileCount: number }) => {
        if (largestFolders.length < 20) {
          largestFolders.push(item)
          largestFolders.sort((a, b) => b.size - a.size)
        } else if (item.size > largestFolders[largestFolders.length - 1].size) {
          largestFolders[largestFolders.length - 1] = item
          largestFolders.sort((a, b) => b.size - a.size)
        }
      }

      // Non-blocking recursive scan with setImmediate yields and junction cycle protection
      const scanDir = async (
        dirPath: string,
        depth: number
      ): Promise<FolderTreeNode> => {
        let dirTotalSize = 0
        let dirTotalFiles = 0
        let filesTotalSize = 0
        const subfolders: FolderTreeNode[] = []
        const directFiles: FolderFileItem[] = []

        if (this.isCancelled) {
          return {
            name: path.basename(dirPath) || dirPath,
            path: dirPath,
            size: 0,
            fileCount: 0,
            filesTotalSize: 0,
            subfolders: [],
            files: []
          }
        }

        const normalizedDir = path.resolve(dirPath).toLowerCase()
        if (visitedPaths.has(normalizedDir)) {
          return {
            name: path.basename(dirPath) || dirPath,
            path: dirPath,
            size: 0,
            fileCount: 0,
            filesTotalSize: 0,
            subfolders: [],
            files: []
          }
        }
        visitedPaths.add(normalizedDir)

        // Yield to Node event loop every 35 files to prevent main thread starvation
        if (totalFiles % 35 === 0) {
          await new Promise((r) => setImmediate(r))
        }

        try {
          const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })

          for (const entry of entries) {
            if (this.isCancelled) break
            const fullPath = path.join(dirPath, entry.name)

            try {
              if (entry.isSymbolicLink()) {
                continue
              }

              if (entry.isDirectory()) {
                // Avoid scanning system junctions, cycles, and protected volumes
                const lowerName = entry.name.toLowerCase()
                if (
                  lowerName === '$recycle.bin' ||
                  lowerName === 'system volume information' ||
                  lowerName === 'application data' ||
                  lowerName === 'appdata'
                ) {
                  continue
                }

                totalFolders++
                if (depth < maxDepth) {
                  const subNode = await scanDir(fullPath, depth + 1)
                  dirTotalSize += subNode.size
                  dirTotalFiles += subNode.fileCount
                  subfolders.push(subNode)
                  trackLargestFolder({
                    name: entry.name,
                    path: fullPath,
                    size: subNode.size,
                    fileCount: subNode.fileCount
                  })
                } else {
                  // If beyond display depth, compute full recursive size
                  const deep = await this.quickCalc(fullPath)
                  dirTotalSize += deep.size
                  dirTotalFiles += deep.fileCount
                  totalSize += deep.size
                  totalFiles += deep.fileCount
                  totalFolders += deep.folderCount
                }
              } else if (entry.isFile()) {
                const stats = await fs.promises.stat(fullPath)
                const fileSize = stats.size
                const ext = path.extname(entry.name).toLowerCase()
                const category = getFileTypeCategory(ext)

                filesTotalSize += fileSize
                dirTotalSize += fileSize
                dirTotalFiles++
                totalSize += fileSize
                totalFiles++

                if (!typeDistribution[category]) {
                  typeDistribution[category] = { size: 0, count: 0 }
                }
                typeDistribution[category].size += fileSize
                typeDistribution[category].count++

                const fileItem: FolderFileItem = {
                  path: fullPath,
                  name: entry.name,
                  size: fileSize,
                  extension: ext
                }

                directFiles.push(fileItem)
                trackLargestFile(fileItem)
              }
            } catch {
              // Permission error or file disappeared
            }

            // Update internal state and report progress every 150ms
            this.currentProgress = {
              currentPath: fullPath,
              scannedFiles: totalFiles,
              scannedSize: totalSize,
              scannedFolders: totalFolders,
            }
            if (Date.now() - lastProgressReport > 150 && window && !window.isDestroyed()) {
              lastProgressReport = Date.now()
              window.webContents.send('analyzer:progress', this.currentProgress)
            }
          }
        } catch {
          // Directory permission error
        }

        // Sort descending by size and bound retained direct files to top 30 to prevent heap bloat
        subfolders.sort((a, b) => b.size - a.size)
        directFiles.sort((a, b) => b.size - a.size)

        return {
          name: path.basename(dirPath) || dirPath,
          path: dirPath,
          size: dirTotalSize,
          fileCount: dirTotalFiles,
          filesTotalSize,
          subfolders,
          files: directFiles.slice(0, 30)
        }
      }

      const rootTree = await scanDir(rootPath, 0)

      if (this.isCancelled) {
        this.isScanning = false
        if (window && !window.isDestroyed()) {
          window.webContents.send('analyzer:cancelled', { targetPath: rootPath })
        }
        return { success: false, cancelled: true }
      }

      const result: ScanResult = {
        totalSize,
        totalFiles,
        totalFolders,
        largestFolders,
        largestFiles,
        typeDistribution,
        rootTree
      }

      this.scanCache.set(rootPath, { timestamp: Date.now(), result })
      this.lastResult = result
      this.isScanning = false
      if (window && !window.isDestroyed()) {
        window.webContents.send('analyzer:completed', { success: true, data: result, targetPath: rootPath })
      }
      return { success: true, data: result }
    } catch (err: any) {
      this.isScanning = false
      this.lastError = err.message
      if (window && !window.isDestroyed()) {
        window.webContents.send('analyzer:error', { error: err.message, targetPath: rootPath })
      }
      return { success: false, error: err.message }
    }
  }
}

export const storageScanner = new StorageScanner()
