import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

export interface ScanProgress {
  currentPath: string
  scannedFiles: number
  scannedSize: number
  scannedFolders: number
}

interface ScanContextType {
  isScanning: boolean
  selectedPath: string
  setSelectedPath: (path: string) => void
  progress: ScanProgress
  scanResult: any | null
  setScanResult: React.Dispatch<React.SetStateAction<any | null>>
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>
  startScan: (pathOverride?: string) => Promise<void>
  cancelScan: () => Promise<void>
}

const ScanContext = createContext<ScanContextType | null>(null)

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [selectedPath, setSelectedPath] = useState<string>('C:\\')
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [progress, setProgress] = useState<ScanProgress>({
    currentPath: '',
    scannedFiles: 0,
    scannedSize: 0,
    scannedFolders: 0,
  })
  const [scanResult, setScanResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isScanningRef = useRef<boolean>(false)

  // Keep ref in sync for event callbacks
  useEffect(() => {
    isScanningRef.current = isScanning
  }, [isScanning])

  // Sync with Electron scanner status on app launch and keep alive across all tab switches
  useEffect(() => {
    // 1. Initial status query from Electron
    window.electronAPI?.analyzer.getStatus().then((status) => {
      if (status) {
        if (status.isScanning) {
          setIsScanning(true)
          if (status.targetPath) setSelectedPath(status.targetPath)
          if (status.progress) setProgress(status.progress)
        } else if (status.lastResult) {
          setScanResult(status.lastResult)
          if (status.targetPath) setSelectedPath(status.targetPath)
        }
        if (status.error) setError(status.error)
      }
    })

    // 2. Global IPC Listeners (Persist across routes and tab navigation)
    const unsubProgress = window.electronAPI?.analyzer.onProgress((data) => {
      setProgress(data)
      setIsScanning(true)
    })

    const unsubCompleted = window.electronAPI?.analyzer.onCompleted?.((data) => {
      setIsScanning(false)
      if (data?.data) {
        setScanResult(data.data)
      }
    })

    const unsubCancelled = window.electronAPI?.analyzer.onCancelled?.(() => {
      setIsScanning(false)
    })

    const unsubError = window.electronAPI?.analyzer.onError?.((data) => {
      setIsScanning(false)
      setError(data?.error || 'Scan encountered an error')
    })

    return () => {
      if (unsubProgress) unsubProgress()
      if (unsubCompleted) unsubCompleted()
      if (unsubCancelled) unsubCancelled()
      if (unsubError) unsubError()
    }
  }, [])

  const startScan = useCallback(async (pathOverride?: string) => {
    const target = pathOverride || selectedPath
    if (!target) return
    setIsScanning(true)
    setError(null)
    setScanResult(null)
    setProgress({ currentPath: 'Initializing deep scan...', scannedFiles: 0, scannedSize: 0, scannedFolders: 0 })

    try {
      const res = await window.electronAPI?.analyzer.startScan(target)
      if (res?.success && res.data) {
        setScanResult(res.data)
      } else if (res?.cancelled) {
        setError('Scan was cancelled.')
      } else if (res?.error && res.error !== 'A scan is already in progress') {
        setError(res.error)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      // Re-verify scanner state from backend
      const status = await window.electronAPI?.analyzer.getStatus()
      if (status) {
        setIsScanning(status.isScanning)
        if (status.lastResult) {
          setScanResult(status.lastResult)
        }
      }
    }
  }, [selectedPath])

  const cancelScan = useCallback(async () => {
    await window.electronAPI?.analyzer.cancelScan()
    setIsScanning(false)
  }, [])

  return (
    <ScanContext.Provider
      value={{
        isScanning,
        selectedPath,
        setSelectedPath,
        progress,
        scanResult,
        setScanResult,
        error,
        setError,
        startScan,
        cancelScan,
      }}
    >
      {children}
    </ScanContext.Provider>
  )
}

export function useScan() {
  const context = useContext(ScanContext)
  if (!context) {
    throw new Error('useScan must be used within a ScanProvider')
  }
  return context
}

