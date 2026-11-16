import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net, screen } from 'electron'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import fs from 'fs'
import os from 'os'
import { exec, execSync } from 'child_process'
import { promisify } from 'util'
import { storageScanner } from './ipc/storageScanner.js'
import { transferServer } from '../server/transferServer.js'

const execAsync = promisify(exec)

// Register privileged scheme for high-speed local thumbnail rendering
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
])

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

process.env.APP_ROOT = path.join(__dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 820,
    minWidth: 900,
    minHeight: 540,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: true,
    },
    show: false,
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // Hook transfer server events to notify window
  transferServer.setCallbacks({
    onProgress: (data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('transfer:progress', data)
      }
    },
    onDeviceConnected: (device) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('transfer:deviceConnected', device)
      }
    },
    onDeviceDisconnected: (deviceId) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('transfer:deviceDisconnected', deviceId)
      }
    }
  })
}

app.on('window-all-closed', () => {
  transferServer.stop()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  // Handle local media streaming with zero-copy Chromium C++ hardware decoding
  protocol.handle('media', (request) => {
    try {
      const raw = request.url.replace(/^media:\/\/local\/?/, '')
      const decoded = decodeURIComponent(raw)
      const normalized = path.normalize(decoded)
      if (!fs.existsSync(normalized)) {
        return new Response('File not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(normalized).toString())
    } catch (err: any) {
      return new Response(err.message, { status: 404 })
    }
  })

  createWindow()
})

// Window controls
ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-maximize', () => {
  if (win?.isMaximized()) win.unmaximize()
  else win?.maximize()
})
ipcMain.on('window-close', () => win?.close())
ipcMain.on('open-external', (_, url: string) => shell.openExternal(url))

// Universal User Known Folders Resolver (handles Windows OneDrive redirection, custom libraries, etc.)
function resolveUserPath(specialName: 'desktop' | 'documents' | 'downloads' | 'pictures' | 'music' | 'videos'): string {
  try {
    const p = app.getPath(specialName)
    if (p && fs.existsSync(p)) return p
  } catch {}

  const home = os.homedir()
  const capitalized = specialName.charAt(0).toUpperCase() + specialName.slice(1)

  // Check OneDrive redirect (e.g. C:\Users\user\OneDrive\Desktop)
  const oneDrivePath = path.join(home, 'OneDrive', capitalized)
  if (fs.existsSync(oneDrivePath)) return oneDrivePath

  // Check direct user directory (e.g. C:\Users\user\Desktop)
  const directPath = path.join(home, capitalized)
  if (fs.existsSync(directPath)) return directPath

  return directPath
}

// Universal Connected Portable Devices (Smartphones, Tablets, MTP, CrossDevice)
let cachedConnectedDevices: { timestamp: number; data: any[] } | null = null

async function getConnectedDevicesList(): Promise<any[]> {
  if (process.platform !== 'win32') return []
  const now = Date.now()
  if (cachedConnectedDevices && now - cachedConnectedDevices.timestamp < 10000) {
    return cachedConnectedDevices.data
  }
  try {
    const ps = `
$sh = New-Object -ComObject Shell.Application
$devices = @()

# 1. This PC (Namespace 17) for Portable Devices (USB Phones/Tablets)
try {
    $thisPC = $sh.Namespace(17)
    if ($thisPC) {
        foreach ($item in $thisPC.Items()) {
            $type = $item.Type
            $name = $item.Name
            $path = $item.Path
            if ($type -eq "Portable Device" -or $type -like "*Phone*" -or $type -like "*Mobile*" -or $type -like "*Tablet*" -or $path -like "*usb#vid_*") {
                $folder = $item.GetFolder
                $count = 0
                if ($folder) {
                    try { $count = $folder.Items().Count } catch {}
                }
                $devType = if ($name -like "*Tab*" -or $type -like "*Tablet*") { "tablet" } else { "phone" }
                $devices += [PSCustomObject]@{
                    id = $name
                    name = $name
                    path = $path
                    type = $devType
                    source = "usb"
                    itemCount = $count
                    status = if ($count -gt 0) { "Ready" } else { "USB Connected" }
                }
            }
        }
    }
} catch {}

# 2. Desktop (Namespace 0) for CrossDevice / Phone Link mobile devices
try {
    $desktop = $sh.Namespace(0)
    if ($desktop) {
        foreach ($item in $desktop.Items()) {
            if ($item.Path -like "*CrossDevice*" -or ($item.Name -match "^[A-Z][0-9]{4}" -and $item.Type -eq "System Folder")) {
                $folder = $item.GetFolder
                $count = 0
                if ($folder) {
                    try { $count = $folder.Items().Count } catch {}
                }
                $devices += [PSCustomObject]@{
                    id = $item.Name
                    name = $item.Name
                    path = $item.Path
                    type = "phone"
                    source = "phone_link"
                    itemCount = $count
                    status = "Phone Link"
                }
            }
        }
    }
} catch {}

$json = $devices | ConvertTo-Json -Depth 2 -Compress
if ($json) { $json } else { '[]' }
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 6000 })
    const match = stdout.match(/(\[.*\]|\{.*\})/s)
    if (match) {
      const parsed = JSON.parse(match[0])
      const list = Array.isArray(parsed) ? parsed : [parsed]
      cachedConnectedDevices = { timestamp: now, data: list }
      return list
    }
    cachedConnectedDevices = { timestamp: now, data: [] }
    return []
  } catch {
    return cachedConnectedDevices?.data || []
  }
}

async function readPortableDeviceHelper(deviceName: string, subPath = '') {
  if (process.platform !== 'win32') {
    return { success: true, data: [], isPortableDevice: true, deviceName, isEmptyOrLocked: true }
  }
  try {
    const devNameB64 = Buffer.from(deviceName, 'utf8').toString('base64')
    const subPathB64 = Buffer.from(subPath || '', 'utf8').toString('base64')
    const ps = `
$devName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${devNameB64}'))
$subPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${subPathB64}'))

$sh = New-Object -ComObject Shell.Application
$targetDevName = $devName.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
$thisPC = $sh.Namespace(17)
$dev = $null

if ($thisPC) {
    foreach ($it in $thisPC.Items()) {
        $cleanName = $it.Name.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
        if ($cleanName -eq $targetDevName -or $cleanName.Contains($targetDevName) -or $targetDevName.Contains($cleanName)) {
            $dev = $it
            break
        }
    }
}

if (-not $dev) {
    $desktop = $sh.Namespace(0)
    if ($desktop) {
        foreach ($it in $desktop.Items()) {
            $cleanName = $it.Name.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
            if ($cleanName -eq $targetDevName -or $cleanName.Contains($targetDevName) -or $targetDevName.Contains($cleanName)) {
                $dev = $it
                break
            }
        }
    }
}

if (-not $dev) {
    Write-Output '{"error": "Device not found"}'
    exit
}

$cur = $dev.GetFolder
if ($subPath -ne '') {
    $cleanSub = $subPath.Replace('/', [char]92)
    $parts = $cleanSub.Split([char[]]@([char]92), [System.StringSplitOptions]::RemoveEmptyEntries)
    foreach ($part in $parts) {
        $next = $null
        if ($cur) {
            $cleanPart = $part.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
            foreach ($it in $cur.Items()) {
                $cleanIt = $it.Name.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
                if ($cleanIt -eq $cleanPart -or $it.Name -eq $part) {
                    $next = $it.GetFolder
                    break
                }
            }
        }
        if ($next) { $cur = $next } else { break }
    }
}

$items = @()
if ($cur) {
    $prefix = "portable://" + $devName + "/" + $(if ($subPath) { $subPath + "/" } else { "" })
    foreach ($it in $cur.Items()) {
        $isDir = $it.IsFolder
        $ext = [System.IO.Path]::GetExtension($it.Name)
        if (-not $ext -and -not $isDir) {
            $type = $it.Type
            if ($type -match 'JPEG|JPG') { $ext = '.jpg' }
            elseif ($type -match 'PNG') { $ext = '.png' }
            elseif ($type -match 'MP4|Video') { $ext = '.mp4' }
            elseif ($type -match 'PDF') { $ext = '.pdf' }
            elseif ($type -match 'Word|DOC') { $ext = '.docx' }
            elseif ($type -match 'Excel|XLS') { $ext = '.xlsx' }
            elseif ($type -match 'Audio|MP3') { $ext = '.mp3' }
            elseif ($type -match 'Text') { $ext = '.txt' }
            else { $ext = '' }
        }
        $nameWithExt = if ($ext -and -not $it.Name.EndsWith($ext)) { $it.Name + $ext } else { $it.Name }
        $items += [PSCustomObject]@{
            name = $nameWithExt
            path = $prefix + $it.Name
            type = if ($isDir) { "directory" } else { "file" }
            size = [int64]$it.Size
            extension = $ext
            modified = $cur.GetDetailsOf($it, 3)
            created = ""
            isHidden = $false
        }
    }
}

$json = $items | ConvertTo-Json -Depth 2 -Compress
if ($json) { $json } else { '[]' }
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 8000 })
    const match = stdout.match(/(\[.*\]|\{.*\})/s)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (parsed.error) {
        return { success: false, error: parsed.error, isPortableDevice: true, deviceName }
      }
      const list = Array.isArray(parsed) ? parsed : [parsed]
      return {
        success: true,
        data: list,
        isPortableDevice: true,
        deviceName,
        isEmptyOrLocked: list.length === 0,
      }
    }
    return {
      success: true,
      data: [],
      isPortableDevice: true,
      deviceName,
      isEmptyOrLocked: true,
    }
  } catch (err: any) {
    return {
      success: true,
      data: [],
      isPortableDevice: true,
      deviceName,
      isEmptyOrLocked: true,
      error: err.message,
    }
  }
}

// File system operations
ipcMain.handle('fs:readDir', async (_, dirPath: string) => {
  try {
    // Handle portable devices (e.g. portable://Naramsetti's Tab A7 Lite or portable://I2305)
    if (dirPath.startsWith('portable://') || dirPath.startsWith('device://')) {
      const raw = dirPath.replace(/^(?:portable|device):\/\//, '')
      const firstSlash = raw.indexOf('/')
      const deviceName = firstSlash === -1 ? raw : raw.slice(0, firstSlash)
      const subPath = firstSlash === -1 ? '' : raw.slice(firstSlash + 1)
      return await readPortableDeviceHelper(deviceName, subPath)
    }

    let resolvedPath = dirPath
    if (!fs.existsSync(resolvedPath)) {
      const home = os.homedir()
      const normalized = path.resolve(resolvedPath).toLowerCase()
      if (normalized === path.resolve(path.join(home, 'Desktop')).toLowerCase()) {
        const alt = resolveUserPath('desktop')
        if (fs.existsSync(alt)) resolvedPath = alt
      } else if (normalized === path.resolve(path.join(home, 'Documents')).toLowerCase()) {
        const alt = resolveUserPath('documents')
        if (fs.existsSync(alt)) resolvedPath = alt
      } else if (normalized === path.resolve(path.join(home, 'Pictures')).toLowerCase()) {
        const alt = resolveUserPath('pictures')
        if (fs.existsSync(alt)) resolvedPath = alt
      }
    }
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: 'Path does not exist' }
    }
    const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true })
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(resolvedPath, entry.name)
        try {
          const stats = await fs.promises.stat(fullPath)
          return {
            name: entry.name,
            path: fullPath,
            size: stats.size,
            type: entry.isDirectory() ? 'directory' : 'file',
            extension: entry.isFile() ? path.extname(entry.name).toLowerCase() : '',
            modified: stats.mtime,
            created: stats.birthtime,
            isHidden: entry.name.startsWith('.'),
          }
        } catch {
          return {
            name: entry.name,
            path: fullPath,
            size: 0,
            type: entry.isDirectory() ? 'directory' : 'file',
            extension: '',
            modified: new Date(),
            created: new Date(),
            isHidden: entry.name.startsWith('.'),
          }
        }
      })
    )
    return { success: true, data: items.filter(Boolean) }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// Universal Category Media & Document Aggregator
const categoryCache = new Map<string, { timestamp: number; data: any[] }>()

ipcMain.handle('fs:getCategoryFiles', async (_, category: string) => {
  try {
    const targetCategory = (category || 'videos').toLowerCase().trim()
    
    // Check short-lived cache (10s) to make tab navigation/filtering instant
    const cached = categoryCache.get(targetCategory)
    if (cached && Date.now() - cached.timestamp < 10000) {
      return { success: true, data: cached.data }
    }

    const home = os.homedir()

    const videoExts = new Set([
      '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v',
      '.3gp', '.rmvb', '.vob', '.ogv', '.mts', '.m2ts', '.f4v', '.asf'
    ])
    const audioExts = new Set([
      '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.opus',
      '.alac', '.aiff', '.mid', '.midi', '.amr', '.mka'
    ])
    const imageExts = new Set([
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
      '.tiff', '.tif', '.avif', '.heic', '.raw', '.cr2', '.nef', '.psd',
      '.ai', '.eps', '.jfif'
    ])
    const docExts = new Set([
      '.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt',
      '.rtf', '.csv', '.odt', '.ods', '.odp', '.md', '.epub', '.tsv',
      '.tex', '.pages', '.numbers', '.key'
    ])

    let targetExts: Set<string>
    if (targetCategory === 'videos' || targetCategory === 'video') {
      targetExts = videoExts
    } else if (targetCategory === 'music' || targetCategory === 'audio') {
      targetExts = audioExts
    } else if (targetCategory === 'images' || targetCategory === 'pictures' || targetCategory === 'image') {
      targetExts = imageExts
    } else if (targetCategory === 'documents' || targetCategory === 'docs' || targetCategory === 'document') {
      targetExts = docExts
    } else {
      targetExts = videoExts
    }

    // Candidate root folders to search
    const rootsToScan = new Set<string>()
    const commonUserDirs = ['Downloads', 'Videos', 'Music', 'Pictures', 'Desktop', 'Documents'] as const
    for (const sub of commonUserDirs) {
      rootsToScan.add(path.join(home, sub))
      rootsToScan.add(path.join(home, 'OneDrive', sub))
      try {
        const resolved = resolveUserPath(sub.toLowerCase() as any)
        if (resolved) rootsToScan.add(resolved)
      } catch {}
    }

    // Also check other mounted drive roots for media folders (e.g. D:\Videos, D:\Downloads, etc.)
    if (process.platform === 'win32') {
      const letters = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('')
      for (const l of letters) {
        const dPath = `${l}:\\`
        try {
          if (fs.existsSync(dPath)) {
            for (const sub of ['Videos', 'Music', 'Pictures', 'Downloads', 'Movies', 'Media']) {
              const extraDir = path.join(dPath, sub)
              if (fs.existsSync(extraDir)) {
                rootsToScan.add(extraDir)
              }
            }
          }
        } catch {}
      }
    }

    const validRoots: string[] = []
    for (const r of rootsToScan) {
      try {
        if (fs.existsSync(r)) {
          validRoots.push(r)
        }
      } catch {}
    }

    const ignoredFolderNames = new Set([
      'node_modules', '.git', '.vscode', 'appdata', '$recycle.bin',
      'system volume information', '.gradle', '.cache', '.android',
      'windows', 'program files', 'program files (x86)', 'ansel',
      '.antigravity-ide', '.copilot', '.gemini', '.sbx-denybin'
    ])

    const foundFiles: any[] = []
    const seenPaths = new Set<string>()
    let yieldCounter = 0

    for (const root of validRoots) {
      const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]

      while (queue.length > 0) {
        const { dir, depth } = queue.shift()!
        yieldCounter++
        if (yieldCounter % 40 === 0) {
          await new Promise((r) => setImmediate(r))
        }

        try {
          const entries = await fs.promises.readdir(dir, { withFileTypes: true })
          for (const entry of entries) {
            if (entry.isSymbolicLink()) continue
            const lowerName = entry.name.toLowerCase()

            if (entry.isDirectory()) {
              if (depth < 4 && !ignoredFolderNames.has(lowerName) && !entry.name.startsWith('.')) {
                queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
              }
            } else if (entry.isFile()) {
              const ext = path.extname(entry.name).toLowerCase()
              if (targetExts.has(ext)) {
                const fullPath = path.join(dir, entry.name)
                if (!seenPaths.has(fullPath)) {
                  seenPaths.add(fullPath)
                  try {
                    const stats = await fs.promises.stat(fullPath)
                    foundFiles.push({
                      name: entry.name,
                      path: fullPath,
                      size: stats.size,
                      type: 'file',
                      extension: ext,
                      modified: stats.mtime,
                      created: stats.birthtime,
                      isHidden: entry.name.startsWith('.'),
                    })
                  } catch {}
                }
              }
            }
          }
        } catch {
          // Skip unreadable directories
        }
      }
    }

    // Sort newest modified first
    foundFiles.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())

    // Store in cache
    categoryCache.set(targetCategory, { timestamp: Date.now(), data: foundFiles })

    return { success: true, data: foundFiles }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

// High-speed accurate recursive directory size calculation with async I/O and memory caching
const folderSizeCache = new Map<string, { size: number; fileCount: number; folderCount: number; timestamp: number }>()
const inFlightCalculations = new Map<string, Promise<{ success: boolean; size: number; fileCount: number; folderCount: number }>>()

async function calculateRealFolderSize(dirPath: string): Promise<{ success: boolean; size: number; fileCount: number; folderCount: number }> {
  const cached = folderSizeCache.get(dirPath)
  if (cached && Date.now() - cached.timestamp < 600000) {
    return { success: true, size: cached.size, fileCount: cached.fileCount, folderCount: cached.folderCount }
  }

  if (inFlightCalculations.has(dirPath)) {
    return inFlightCalculations.get(dirPath)!
  }

  const promise = (async () => {
    // Immediate bypass for Windows OS protected system directories
    const baseName = path.basename(dirPath).toLowerCase()
    if (baseName === 'system volume information' || baseName === 'recovery' || baseName === 'oem') {
      return { success: true, size: 0, fileCount: 0, folderCount: 0 }
    }

    let totalSize = 0
    let fileCount = 0
    let folderCount = 0
    const visited = new Set<string>()

    async function walk(current: string) {
      const norm = current.toLowerCase()
      if (visited.has(norm)) return
      visited.add(norm)

      try {
        const entries = await fs.promises.readdir(current, { withFileTypes: true })
        const files: string[] = []
        const subdirs: string[] = []
        const base = current.endsWith('\\') || current.endsWith('/') ? current : current + path.sep

        for (let i = 0; i < entries.length; i++) {
          const item = entries[i]
          if (item.isSymbolicLink()) continue
          const full = base + item.name

          if (item.isDirectory()) {
            const l = item.name.toLowerCase()
            if (
              l === '$recycle.bin' ||
              l === 'system volume information' ||
              l === 'recovery' ||
              l === 'application data'
            ) {
              continue
            }
            folderCount++
            subdirs.push(full)
          } else if (item.isFile()) {
            files.push(full)
          }
        }

        // Parallel async stats for all files in this directory
        const stats = await Promise.all(
          files.map((f) => fs.promises.stat(f).catch(() => null))
        )
        for (let i = 0; i < stats.length; i++) {
          const st = stats[i]
          if (st) {
            totalSize += st.size
            fileCount++
          }
        }

        // Concurrently recurse subdirectories in chunks of 6
        for (let i = 0; i < subdirs.length; i += 6) {
          await Promise.all(subdirs.slice(i, i + 6).map((s) => walk(s)))
        }
      } catch {
        // Permission denied or locked directory
      }
    }

    try {
      await walk(dirPath)
      const res = {
        size: totalSize,
        fileCount,
        folderCount,
        timestamp: Date.now()
      }
      folderSizeCache.set(dirPath, res)
      return { success: true, size: totalSize, fileCount, folderCount }
    } catch (error: any) {
      return { success: true, size: totalSize, fileCount, folderCount }
    } finally {
      inFlightCalculations.delete(dirPath)
    }
  })()

  inFlightCalculations.set(dirPath, promise)
  return promise
}

ipcMain.handle('fs:getFolderSize', async (_, dirPath: string) => {
  return await calculateRealFolderSize(dirPath)
})

ipcMain.handle('fs:getFolderSizesBatch', async (_, dirPaths: string[]) => {
  if (!Array.isArray(dirPaths) || dirPaths.length === 0) return { success: true, data: {} }
  const results: Record<string, number> = {}

  // Run with concurrency pool of 6
  const concurrency = 6
  for (let i = 0; i < dirPaths.length; i += concurrency) {
    const chunk = dirPaths.slice(i, i + concurrency)
    const chunkResults = await Promise.all(chunk.map((p) => calculateRealFolderSize(p)))
    chunk.forEach((p, idx) => {
      results[p] = chunkResults[idx]?.size ?? 0
    })
  }

  return { success: true, data: results }
})

ipcMain.handle('fs:createDir', async (_, dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:rename', async (_, oldPath: string, newPath: string) => {
  try {
    await fs.promises.rename(oldPath, newPath)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:delete', async (_, filePath: string) => {
  try {
    const stats = await fs.promises.stat(filePath)
    if (stats.isDirectory()) {
      await fs.promises.rm(filePath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(filePath)
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:moveToTrash', async (_, filePath: string) => {
  try {
    await shell.trashItem(filePath)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:copy', async (_, src: string, dest: string) => {
  try {
    let finalDest = dest
    // Windows Explorer behavior: if destination exists or copying in same directory, append " - Copy"
    if (fs.existsSync(finalDest)) {
      const dir = path.dirname(dest)
      const ext = path.extname(dest)
      const base = path.basename(dest, ext)
      let counter = 1
      finalDest = path.join(dir, `${base} - Copy${ext}`)
      while (fs.existsSync(finalDest)) {
        counter++
        finalDest = path.join(dir, `${base} - Copy (${counter})${ext}`)
      }
    }
    const stats = await fs.promises.stat(src)
    if (stats.isDirectory()) {
      await fs.promises.cp(src, finalDest, { recursive: true })
    } else {
      await fs.promises.copyFile(src, finalDest)
    }
    return { success: true, dest: finalDest }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:move', async (_, src: string, dest: string) => {
  try {
    await fs.promises.rename(src, dest)
    return { success: true }
  } catch (error: any) {
    // If cross-device move, copy and delete
    try {
      const stats = await fs.promises.stat(src)
      if (stats.isDirectory()) {
        await fs.promises.cp(src, dest, { recursive: true })
        await fs.promises.rm(src, { recursive: true, force: true })
      } else {
        await fs.promises.copyFile(src, dest)
        await fs.promises.unlink(src)
      }
      return { success: true }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
})

ipcMain.handle('fs:stat', async (_, filePath: string) => {
  try {
    const stats = await fs.promises.stat(filePath)
    return {
      success: true,
      data: {
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:exists', async (_, filePath: string) => {
  try {
    await fs.promises.access(filePath)
    return { success: true, exists: true }
  } catch {
    return { success: true, exists: false }
  }
})

ipcMain.handle('fs:readFile', async (_, filePath: string) => {
  try {
    let actualPath = filePath
    if (filePath.startsWith('portable://') || filePath.startsWith('device://')) {
      const pRes = await openPortableFileHelper(filePath)
      if (!pRes.success || !pRes.localPath) {
        return { success: false, error: pRes.error || 'Could not copy file from portable device' }
      }
      actualPath = pRes.localPath
    }
    const stats = await fs.promises.stat(actualPath)
    if (stats.size > 15 * 1024 * 1024) {
      return { success: false, error: 'File too large for preview (over 15MB)' }
    }
    const ext = path.extname(actualPath).toLowerCase()
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)

    if (isImage) {
      const buffer = await fs.promises.readFile(actualPath)
      const base64 = buffer.toString('base64')
      const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg'
      return { success: true, data: `data:${mime};base64,${base64}`, isMedia: true }
    }

    const content = await fs.promises.readFile(actualPath, 'utf-8')
    return { success: true, data: content, isMedia: false }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:getThumbnail', async (_, filePath: string) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'].includes(ext)
    if (!isImage) return { success: false }
    const buf = await fs.promises.readFile(filePath)
    const base64 = buf.toString('base64')
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.png' ? 'image/png' : 'image/jpeg'
    return { success: true, data: `data:${mime};base64,${base64}` }
  } catch {
    return { success: false }
  }
})

// Universal Hardware Drives Detection - 100% dynamic and non-blocking with 10s TTL cache
let cachedDrives: { timestamp: number; data: any[] } | null = null

ipcMain.handle('fs:getDrives', async () => {
  const now = Date.now()
  if (cachedDrives && now - cachedDrives.timestamp < 10000) {
    return { success: true, data: cachedDrives.data }
  }

  // Non-Windows (macOS & Linux) dynamic detection
  if (process.platform !== 'win32') {
    try {
      const drives: any[] = []
      if (typeof (fs as any).statfsSync === 'function') {
        const rootStats = (fs as any).statfsSync('/')
        const total = Number(rootStats.blocks) * Number(rootStats.bsize)
        const free = Number(rootStats.bavail) * Number(rootStats.bsize)
        drives.push({
          letter: '/',
          label: process.platform === 'darwin' ? 'Macintosh HD' : 'Root File System',
          total,
          free,
          used: Math.max(0, total - free),
          fileSystem: process.platform === 'darwin' ? 'APFS' : 'ext4',
        })
      }
      const mountBases = process.platform === 'darwin' ? ['/Volumes'] : ['/media', '/mnt']
      for (const base of mountBases) {
        if (fs.existsSync(base)) {
          const entries = fs.readdirSync(base, { withFileTypes: true })
          for (const ent of entries) {
            if (ent.isDirectory()) {
              const mountPath = path.join(base, ent.name)
              try {
                const s = (fs as any).statfsSync(mountPath)
                const tot = Number(s.blocks) * Number(s.bsize)
                const fre = Number(s.bavail) * Number(s.bsize)
                if (tot > 0) {
                  drives.push({
                    letter: mountPath,
                    label: ent.name,
                    total: tot,
                    free: fre,
                    used: Math.max(0, tot - fre),
                    fileSystem: 'auto',
                  })
                }
              } catch {}
            }
          }
        }
      }
      const finalDrives = drives.length > 0 ? drives : [{ letter: '/', label: 'Root', free: 0, total: 0, used: 0, fileSystem: 'auto' }]
      cachedDrives = { timestamp: now, data: finalDrives }
      return { success: true, data: finalDrives }
    } catch {
      return { success: true, data: [{ letter: '/', label: 'Root', free: 0, total: 0, used: 0, fileSystem: 'auto' }] }
    }
  }

  // Windows Dynamic Hardware Detection (Non-blocking):
  const detectedDrives: any[] = []

  // 1. Asynchronously query .NET System.IO.DriveInfo (fast & universal)
  try {
    const psScript = '[System.IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady } | Select-Object Name, VolumeLabel, TotalSize, TotalFreeSpace, DriveFormat | ConvertTo-Json'
    const { stdout: psOut } = await execAsync(`powershell -NoProfile -Command "${psScript}"`, { timeout: 3500 })
    const parsed = JSON.parse(psOut)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of list) {
      if (item && item.Name) {
        const driveLetter = item.Name.replace('\\', '').toUpperCase()
        const label = item.VolumeLabel && item.VolumeLabel.trim() ? item.VolumeLabel.trim() : 'Local Disk'
        const total = item.TotalSize || 0
        const free = item.TotalFreeSpace || 0
        const used = Math.max(0, total - free)
        if (total > 0) {
          detectedDrives.push({
            letter: driveLetter,
            label,
            total,
            free,
            used,
            fileSystem: item.DriveFormat || 'NTFS',
          })
        }
      }
    }
  } catch {}

  // 2. Fallback to drive letters if needed
  if (detectedDrives.length === 0) {
    const letters = 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('')
    for (const letter of letters) {
      const rootPath = `${letter}:\\`
      try {
        if (fs.existsSync(rootPath)) {
          let total = 0
          let free = 0
          let used = 0
          try {
            if (typeof (fs as any).statfsSync === 'function') {
              const stats = (fs as any).statfsSync(rootPath)
              total = Number(stats.blocks) * Number(stats.bsize)
              free = Number(stats.bavail) * Number(stats.bsize)
              used = Math.max(0, total - free)
            }
          } catch {}

          if (total > 0) {
            detectedDrives.push({
              letter: `${letter}:`,
              label: 'Local Disk',
              total,
              free,
              used,
              fileSystem: 'NTFS',
            })
          }
        }
      } catch {}
    }
  }

  detectedDrives.sort((a, b) => a.letter.localeCompare(b.letter))
  cachedDrives = { timestamp: now, data: detectedDrives }
  return { success: true, data: detectedDrives }
})

// Connected Devices (Smartphones, Tablets, MTP, CrossDevice)
ipcMain.handle('fs:getConnectedDevices', async () => {
  try {
    const devices = await getConnectedDevicesList()
    return { success: true, data: devices }
  } catch (err: any) {
    return { success: false, data: [], error: err.message }
  }
})

ipcMain.handle('fs:openDeviceInExplorer', async (_, deviceName: string) => {
  if (process.platform !== 'win32') return { success: false }
  try {
    const devNameB64 = Buffer.from(deviceName || '', 'utf8').toString('base64')
    const ps = `
$devName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${devNameB64}'))
$sh = New-Object -ComObject Shell.Application
$thisPC = $sh.Namespace(17)
$found = $false
foreach ($it in $thisPC.Items()) {
    if ($it.Name -eq $devName) {
        $it.InvokeVerb("open")
        $found = $true
        break
    }
}
if (-not $found) {
    $desktop = $sh.Namespace(0)
    foreach ($it in $desktop.Items()) {
        if ($it.Name -eq $devName) {
            $it.InvokeVerb("open")
            $found = $true
            break
        }
    }
}
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 6000 })
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('fs:readPortableDevice', async (_, deviceName: string, subPath?: string) => {
  return readPortableDeviceHelper(deviceName, subPath || '')
})

// Storage Analyzer - Persistent background scan across tab switching
ipcMain.handle('analyzer:startScan', async (_, scanPath: string) => {
  return await storageScanner.scan(scanPath, win)
})

ipcMain.handle('analyzer:cancelScan', () => {
  storageScanner.cancel(win)
  return { success: true }
})

ipcMain.handle('analyzer:getStatus', () => {
  return storageScanner.getStatus()
})

// Wireless Transfer Server
ipcMain.handle('transfer:start', async (_, port?: number, downloadDir?: string) => {
  return await transferServer.start(port || 52140, downloadDir)
})

ipcMain.handle('transfer:stop', async () => {
  const stopped = await transferServer.stop()
  return { success: stopped }
})

ipcMain.handle('transfer:getStatus', () => {
  return { success: true, data: transferServer.getStatus() }
})

ipcMain.handle('transfer:setDownloadDir', (_, dirPath: string) => {
  const success = transferServer.setDownloadDir(dirPath)
  return { success }
})

ipcMain.handle('transfer:addSharedFile', (_, filePath: string) => {
  const success = transferServer.addSharedFile(filePath)
  return { success }
})

ipcMain.handle('transfer:removeSharedFile', (_, fileId: string) => {
  const success = transferServer.removeSharedFile(fileId)
  return { success }
})

ipcMain.handle('transfer:getSharedFiles', () => {
  return { success: true, data: transferServer.getSharedFiles() }
})

// System info and Quick Access Paths
ipcMain.handle('system:getInfo', async () => {
  const home = os.homedir()
  return {
    success: true,
    data: {
      platform: process.platform,
      homeDir: home,
      tempDir: os.tmpdir(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      quickPaths: {
        desktop: resolveUserPath('desktop'),
        documents: resolveUserPath('documents'),
        downloads: resolveUserPath('downloads'),
        pictures: resolveUserPath('pictures'),
        music: resolveUserPath('music'),
        videos: resolveUserPath('videos'),
      }
    },
  }
})

// Intelligent Universal Hardware Detection & Performance Profiles
ipcMain.handle('system:getHardwareProfile', async () => {
  try {
    const cpus = os.cpus() || []
    const cpuModel = cpus[0]?.model?.trim() || 'Generic Multi-Core CPU'
    const cpuCores = cpus.length || 2
    const totalRamBytes = os.totalmem()
    const freeRamBytes = os.freemem()
    const totalRamGB = Math.round((totalRamBytes / (1024 * 1024 * 1024)) * 10) / 10
    const freeRamGB = Math.round((freeRamBytes / (1024 * 1024 * 1024)) * 10) / 10
    const osRelease = os.release()

    // Detect Windows 11 vs 10 accurately
    let osName = 'Windows'
    if (process.platform === 'win32') {
      const buildMatch = osRelease.match(/10\.0\.(\d+)/)
      const buildNumber = buildMatch ? parseInt(buildMatch[1], 10) : 0
      if (buildNumber >= 22000) {
        osName = `Windows 11 (Build ${buildNumber})`
      } else {
        osName = `Windows 10 (Build ${buildNumber || osRelease})`
      }
    } else {
      osName = `${process.platform} ${osRelease}`
    }

    // Display metrics
    let displayResolution = '1920x1080'
    let scaleFactor = 1
    try {
      const primary = screen.getPrimaryDisplay()
      if (primary) {
        scaleFactor = primary.scaleFactor || 1
        displayResolution = `${Math.round(primary.size.width * scaleFactor)}x${Math.round(primary.size.height * scaleFactor)} (${primary.size.width}x${primary.size.height} @ ${Math.round(scaleFactor * 100)}%)`
      }
    } catch {}

    // Adaptive profile recommendation based on physical resource envelope
    let recommendedProfile: 'low-end' | 'balanced' | 'high-performance' = 'balanced'
    if (totalRamGB <= 4.5 || cpuCores <= 2) {
      recommendedProfile = 'low-end'
    } else if (totalRamGB >= 12 && cpuCores >= 6) {
      recommendedProfile = 'high-performance'
    } else {
      recommendedProfile = 'balanced'
    }

    return {
      success: true,
      data: {
        cpuModel,
        cpuCores,
        totalRamGB,
        freeRamGB,
        osName,
        osRelease,
        displayResolution,
        scaleFactor,
        recommendedProfile,
      }
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message,
      data: {
        cpuModel: 'Standard CPU',
        cpuCores: 4,
        totalRamGB: 8,
        freeRamGB: 4,
        osName: 'Windows',
        osRelease: '',
        displayResolution: '1920x1080',
        scaleFactor: 1,
        recommendedProfile: 'balanced',
      }
    }
  }
})

async function openPortableFileHelper(portablePath: string): Promise<{ success: boolean; localPath?: string; error?: string }> {
  if (process.platform !== 'win32') return { success: false, error: 'Not supported' }
  try {
    const raw = portablePath.replace(/^(?:portable|device):\/\//, '')
    const firstSlash = raw.indexOf('/')
    const deviceName = firstSlash === -1 ? raw : raw.slice(0, firstSlash)
    const rest = firstSlash === -1 ? '' : raw.slice(firstSlash + 1)
    const lastSlash = rest.lastIndexOf('/')
    const subPath = lastSlash === -1 ? '' : rest.slice(0, lastSlash)
    const fileName = lastSlash === -1 ? rest : rest.slice(lastSlash + 1)

    const devNameB64 = Buffer.from(deviceName, 'utf8').toString('base64')
    const subPathB64 = Buffer.from(subPath, 'utf8').toString('base64')
    const fileNameB64 = Buffer.from(fileName, 'utf8').toString('base64')
    const cacheDir = path.join(os.tmpdir(), 'StorageFlow_Cache')
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true })
    }
    const cacheDirB64 = Buffer.from(cacheDir, 'utf8').toString('base64')

    const ps = `
$devName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${devNameB64}'))
$subPath = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${subPathB64}'))
$fileName = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${fileNameB64}'))
$cacheDir = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${cacheDirB64}'))

$sh = New-Object -ComObject Shell.Application
$targetDevName = $devName.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
$thisPC = $sh.Namespace(17)
$dev = $null

if ($thisPC) {
    foreach ($it in $thisPC.Items()) {
        $cleanName = $it.Name.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
        if ($cleanName -eq $targetDevName -or $cleanName.Contains($targetDevName) -or $targetDevName.Contains($cleanName)) {
            $dev = $it
            break
        }
    }
}

if (-not $dev) {
    $desktop = $sh.Namespace(0)
    if ($desktop) {
        foreach ($it in $desktop.Items()) {
            $cleanName = $it.Name.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
            if ($cleanName -eq $targetDevName -or $cleanName.Contains($targetDevName) -or $targetDevName.Contains($cleanName)) {
                $dev = $it
                break
            }
        }
    }
}

if (-not $dev) {
    Write-Output '{"error": "Device not found"}'
    exit
}

$cur = $dev.GetFolder
if ($subPath -ne '') {
    $cleanSub = $subPath.Replace('/', [char]92)
    $parts = $cleanSub.Split([char[]]@([char]92), [System.StringSplitOptions]::RemoveEmptyEntries)
    foreach ($part in $parts) {
        $next = $null
        if ($cur) {
            $cleanPart = $part.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
            foreach ($it in $cur.Items()) {
                $cleanIt = $it.Name.ToLower().Trim().Replace([char]8217, [char]39).Replace([char]8216, [char]39)
                if ($cleanIt -eq $cleanPart -or $it.Name -eq $part) {
                    $next = $it.GetFolder
                    break
                }
            }
        }
        if ($next) { $cur = $next } else { break }
    }
}

$target = $null
if ($cur) {
    $cleanTargetName = $fileName.ToLower().Trim()
    foreach ($it in $cur.Items()) {
        $itName = $it.Name.ToLower().Trim()
        $itBase = [System.IO.Path]::GetFileNameWithoutExtension($it.Name).ToLower().Trim()
        if ($itName -eq $cleanTargetName -or $itBase -eq $cleanTargetName) {
            $target = $it
            break
        }
    }
}

if (-not $target) {
    Write-Output '{"error": "File not found"}'
    exit
}

# Infer file extension from MTP metadata if omitted
$targetType = $target.Type
$inferredExt = ""
if ($targetType -match 'JPEG|JPG') { $inferredExt = '.jpg' }
elseif ($targetType -match 'PNG') { $inferredExt = '.png' }
elseif ($targetType -match 'MP4|Video') { $inferredExt = '.mp4' }
elseif ($targetType -match 'PDF') { $inferredExt = '.pdf' }
elseif ($targetType -match 'Word|DOC') { $inferredExt = '.docx' }
elseif ($targetType -match 'Excel|XLS') { $inferredExt = '.xlsx' }
elseif ($targetType -match 'Audio|MP3') { $inferredExt = '.mp3' }
elseif ($targetType -match 'Text') { $inferredExt = '.txt' }

# Copy item to local cache folder
$destFolder = $sh.NameSpace($cacheDir)
$destFolder.CopyHere($target, 16)

$foundFile = $null
# Poll for up to 3.5 seconds for the asynchronous Shell CopyHere to write the file into cacheDir
for ($attempt = 0; $attempt -lt 25; $attempt++) {
    $candidates = Get-ChildItem -Path $cacheDir | Where-Object { $_.BaseName -eq $fileName -or $_.Name -eq $fileName -or $_.Name -like "$fileName*" } | Sort-Object LastWriteTime -Descending
    if ($candidates -and $candidates.Count -gt 0) {
        $candidate = $candidates[0]
        if ($candidate.Length -gt 0 -or $attempt -ge 6) {
            $foundFile = $candidate.FullName
            $hasExt = [System.IO.Path]::GetExtension($foundFile)
            if ((-not $hasExt -or $hasExt -eq "") -and $inferredExt) {
                $renamed = $foundFile + $inferredExt
                Rename-Item -LiteralPath $foundFile -NewName ([System.IO.Path]::GetFileName($renamed)) -Force -ErrorAction SilentlyContinue
                if (Test-Path -LiteralPath $renamed) {
                    $foundFile = $renamed
                }
            }
            break
        }
    }
    Start-Sleep -Milliseconds 140
}

if ($foundFile) {
    Write-Output ([PSCustomObject]@{ localPath = $foundFile } | ConvertTo-Json -Compress)
} else {
    Write-Output '{"error": "Device is busy or could not extract file. Please unlock your phone/device and try again."}'
}
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 15000 })
    const match = stdout.match(/(\[.*\]|\{.*\})/s)
    if (match) {
      const parsed = JSON.parse(match[0])
      if (parsed.error) return { success: false, error: parsed.error }
      if (parsed.localPath && fs.existsSync(parsed.localPath)) {
        await shell.openPath(parsed.localPath)
        return { success: true, localPath: parsed.localPath }
      }
      return { success: true }
    }
    return { success: false, error: 'Could not open file' }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// Shell & Dialog
ipcMain.handle('shell:openFile', async (_, filePath: string) => {
  try {
    if (filePath.startsWith('portable://') || filePath.startsWith('device://')) {
      return await openPortableFileHelper(filePath)
    }
    await shell.openPath(filePath)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('shell:showInFolder', (_, filePath: string) => {
  if (filePath.startsWith('portable://') || filePath.startsWith('device://')) {
    return { success: true }
  }
  shell.showItemInFolder(filePath)
  return { success: true }
})

ipcMain.handle('shell:openWith', async (_, filePath: string, appCommand?: string) => {
  try {
    let targetPath = filePath
    if (filePath.startsWith('portable://') || filePath.startsWith('device://')) {
      const res = await openPortableFileHelper(filePath)
      if (res.success && res.localPath) {
        targetPath = res.localPath
      } else {
        return res
      }
    }
    if (!appCommand || appCommand === 'choose') {
      // Windows native "Open With" dialog
      exec(`rundll32.exe shell32.dll,OpenAs_RunDLL "${targetPath}"`)
    } else if (appCommand === 'notepad') {
      exec(`notepad.exe "${targetPath}"`)
    } else if (appCommand === 'vlc') {
      exec(`start "" vlc "${targetPath}" || start "" "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" "${targetPath}"`)
    } else if (appCommand === 'mediaplayer') {
      exec(`start "" wmplayer "${targetPath}" || start "" mswindowsmusic: "${targetPath}"`)
    } else if (appCommand === 'photos') {
      exec(`start "" ms-photos: "${targetPath}" || shell:openFile`)
    } else if (appCommand === 'code') {
      exec(`code "${targetPath}"`)
    } else {
      exec(`start "" ${appCommand} "${targetPath}"`)
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('shell:openTerminal', async (_, dirPath: string) => {
  try {
    exec(`start cmd.exe /K "cd /d ${dirPath}"`)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('fs:compressToZip', async (_, targetPath: string) => {
  try {
    const parentDir = path.dirname(targetPath)
    const baseName = path.basename(targetPath)
    const zipPath = path.join(parentDir, `${baseName}.zip`)
    
    // Windows PowerShell native compression
    const psCmd = `powershell -NoProfile -Command "Compress-Archive -LiteralPath '${targetPath.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force"`
    
    await new Promise<void>((resolve, reject) => {
      exec(psCmd, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    return { success: true, zipPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('dialog:openDirectory', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory'],
  })
  return { success: true, data: result }
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile', 'multiSelections'],
  })
  return { success: true, data: result }
})

// Native Windows Recycle Bin & Trash Management (Non-blocking)
ipcMain.handle('trash:getItems', async () => {
  if (process.platform !== 'win32') {
    return { success: true, data: [] }
  }
  try {
    const ps = `
$sh = New-Object -ComObject Shell.Application
$b = $sh.Namespace(10)
$list = @()
if ($b) {
  foreach ($item in $b.Items()) {
    $list += [PSCustomObject]@{
      name = $item.Name
      originalLocation = $b.GetDetailsOf($item, 1)
      dateDeleted = $b.GetDetailsOf($item, 2)
      size = [int64]$item.Size
      type = $item.Type
    }
  }
}
$json = $list | ConvertTo-Json -Depth 2 -Compress
if ($json) { $json } else { '[]' }
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 6000 })
    const jsonMatch = stdout.match(/(\[.*\]|\{.*\})/s)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      const items = Array.isArray(parsed) ? parsed : [parsed]
      return { success: true, data: items }
    }
    return { success: true, data: [] }
  } catch (error: any) {
    return { success: false, data: [], error: error.message }
  }
})

ipcMain.handle('trash:restoreItem', async (_, itemName: string) => {
  if (process.platform !== 'win32') return { success: false }
  try {
    const escapedName = itemName.replace(/'/g, "''")
    const ps = `
$sh = New-Object -ComObject Shell.Application
$b = $sh.Namespace(10)
if ($b) {
  foreach ($item in $b.Items()) {
    if ($item.Name -eq '${escapedName}') {
      foreach ($verb in $item.Verbs()) {
        if ($verb.Name -match 'restore|undelete') {
          $verb.DoIt()
          break
        }
      }
      break
    }
  }
}
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 6000 })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('trash:deleteItem', async (_, itemPath: string, itemName: string) => {
  if (process.platform !== 'win32') return { success: false }
  try {
    // If physical path exists in $Recycle.Bin, remove it directly
    if (itemPath && fs.existsSync(itemPath)) {
      const st = await fs.promises.stat(itemPath)
      if (st.isDirectory()) {
        await fs.promises.rm(itemPath, { recursive: true, force: true })
      } else {
        await fs.promises.unlink(itemPath)
      }
      return { success: true }
    }

    // Fallback via Shell COM
    const escapedName = (itemName || '').replace(/'/g, "''")
    const escapedPath = (itemPath || '').replace(/'/g, "''")
    const ps = `
$sh = New-Object -ComObject Shell.Application
$b = $sh.Namespace(10)
if ($b) {
  foreach ($item in $b.Items()) {
    if ($item.Name -eq '${escapedName}' -or $item.Path -eq '${escapedPath}') {
      foreach ($verb in $item.Verbs()) {
        if ($verb.Name -match 'delete|&delete') {
          $verb.DoIt()
          break
        }
      }
      break
    }
  }
}
`
    const encoded = Buffer.from(ps, 'utf16le').toString('base64')
    await execAsync(`powershell -NoProfile -EncodedCommand ${encoded}`, { timeout: 6000 })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('trash:empty', async () => {
  if (process.platform !== 'win32') return { success: false }
  try {
    await execAsync(`powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"`, { timeout: 6000 })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('trash:openFolder', () => {
  exec('explorer.exe shell:RecycleBinFolder')
  return { success: true }
})
