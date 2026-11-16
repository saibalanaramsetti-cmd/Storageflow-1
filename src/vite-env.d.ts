/// <reference types="vite/client" />

interface HardwareProfile {
  cpuModel: string
  cpuCores: number
  totalRamGB: number
  freeRamGB: number
  osName: string
  osRelease: string
  displayResolution: string
  scaleFactor: number
  recommendedProfile: 'low-end' | 'balanced' | 'high-performance'
}

interface Window {
  electronAPI?: {
    window: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
    fs: {
      readDir: (path: string) => Promise<{ success: boolean; data?: any[]; error?: string; isPortableDevice?: boolean; deviceName?: string; isEmptyOrLocked?: boolean }>
      getCategoryFiles: (category: string) => Promise<{ success: boolean; data?: any[]; error?: string }>
      createDir: (path: string) => Promise<{ success: boolean; error?: string }>
      rename: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
      delete: (path: string) => Promise<{ success: boolean; error?: string }>
      moveToTrash: (path: string) => Promise<{ success: boolean; error?: string }>
      copy: (src: string, dest: string) => Promise<{ success: boolean; error?: string }>
      move: (src: string, dest: string) => Promise<{ success: boolean; error?: string }>
      stat: (path: string) => Promise<{ success: boolean; data?: any; error?: string }>
      exists: (path: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>
      readFile: (path: string) => Promise<{ success: boolean; data?: string; isMedia?: boolean; error?: string }>
      getThumbnail: (path: string) => Promise<{ success: boolean; data?: string }>
      getFolderSize: (path: string) => Promise<{ success: boolean; size?: number; error?: string }>
      getDrives: () => Promise<{ success: boolean; data?: any[]; error?: string }>
      getConnectedDevices: () => Promise<{ success: boolean; data?: any[]; error?: string }>
      openDeviceInExplorer: (deviceName: string) => Promise<{ success: boolean; error?: string }>
      readPortableDevice: (deviceName: string, subPath?: string) => Promise<{ success: boolean; data?: any[]; error?: string; isPortableDevice?: boolean; deviceName?: string; isEmptyOrLocked?: boolean }>
      compressToZip: (path: string) => Promise<{ success: boolean; zipPath?: string; error?: string }>
    }
    analyzer: {
      startScan: (path: string) => Promise<{ success: boolean; data?: any; error?: string; cancelled?: boolean }>
      cancelScan: () => Promise<{ success: boolean }>
      getStatus: () => Promise<{ isScanning: boolean; targetPath: string; progress: any; lastResult: any; error: string | null }>
      onProgress: (callback: (data: any) => void) => () => void
      onCompleted: (callback: (data: any) => void) => () => void
      onCancelled: (callback: (data?: any) => void) => () => void
      onError: (callback: (data: any) => void) => () => void
    }
    system: {
      getInfo: () => Promise<{ success: boolean; data?: any }>
      getHardwareProfile: () => Promise<{ success: boolean; data?: HardwareProfile; error?: string }>
    }
    shell: {
      openFile: (path: string) => Promise<{ success: boolean; error?: string }>
      showInFolder: (path: string) => Promise<{ success: boolean }>
      openWith: (path: string, appCommand?: string) => Promise<{ success: boolean; error?: string }>
      openTerminal: (dirPath: string) => Promise<{ success: boolean; error?: string }>
      openExternal: (url: string) => void
    }
    dialog: {
      openDirectory: () => Promise<{ success: boolean; data?: any }>
      openFile: () => Promise<{ success: boolean; data?: any }>
    }
    trash: {
      getItems: () => Promise<{ success: boolean; data?: any[]; error?: string }>
      restoreItem: (itemName: string) => Promise<{ success: boolean; error?: string }>
      deleteItem: (itemPath: string, itemName: string) => Promise<{ success: boolean; error?: string }>
      empty: () => Promise<{ success: boolean; error?: string }>
      openFolder: () => Promise<{ success: boolean }>
    }
    transfer: {
      start: (port?: number, downloadDir?: string) => Promise<{
        success: boolean
        port: number
        url: string
        qrCodeDataUrl: string
        token: string
        ip: string
        error?: string
      }>
      stop: () => Promise<{ success: boolean }>
      getStatus: () => Promise<{ success: boolean; data?: any }>
      setDownloadDir: (dirPath: string) => Promise<{ success: boolean }>
      addSharedFile: (filePath: string) => Promise<{ success: boolean }>
      removeSharedFile: (fileId: string) => Promise<{ success: boolean }>
      getSharedFiles: () => Promise<{ success: boolean; data?: any[] }>
      onProgress: (callback: (data: any) => void) => () => void
      onDeviceConnected: (callback: (device: any) => void) => () => void
      onDeviceDisconnected: (callback: (deviceId: string) => void) => () => void
    }
  }
}

