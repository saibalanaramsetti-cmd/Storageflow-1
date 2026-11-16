import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type PerformanceProfileMode = 'auto' | 'low-end' | 'balanced' | 'high-performance'
export type ActivePerformanceTier = 'low-end' | 'balanced' | 'high-performance'

interface PerformanceContextType {
  mode: PerformanceProfileMode
  activeTier: ActivePerformanceTier
  hardwareProfile: HardwareProfile | null
  setMode: (mode: PerformanceProfileMode) => void
  isLowEnd: boolean
  isBalanced: boolean
  isHighPerf: boolean
}

const defaultContext: PerformanceContextType = {
  mode: 'auto',
  activeTier: 'balanced',
  hardwareProfile: null,
  setMode: () => {},
  isLowEnd: false,
  isBalanced: true,
  isHighPerf: false,
}

const PerformanceContext = createContext<PerformanceContextType>(defaultContext)

export function PerformanceProfileProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PerformanceProfileMode>(() => {
    return (localStorage.getItem('sf-perf-mode') as PerformanceProfileMode) || 'auto'
  })

  const [hardwareProfile, setHardwareProfile] = useState<HardwareProfile | null>(null)

  useEffect(() => {
    window.electronAPI?.system.getHardwareProfile().then((res) => {
      if (res?.success && res.data) {
        setHardwareProfile(res.data)
      }
    }).catch(() => {})
  }, [])

  const recommended = hardwareProfile?.recommendedProfile || 'balanced'
  const activeTier: ActivePerformanceTier = mode === 'auto' ? recommended : mode

  useEffect(() => {
    localStorage.setItem('sf-perf-mode', mode)

    const root = document.documentElement
    root.classList.remove('profile-low-end', 'profile-balanced', 'profile-high-performance')
    root.classList.add(`profile-${activeTier}`)
  }, [mode, activeTier])

  const setMode = (newMode: PerformanceProfileMode) => {
    setModeState(newMode)
  }

  return (
    <PerformanceContext.Provider
      value={{
        mode,
        activeTier,
        hardwareProfile,
        setMode,
        isLowEnd: activeTier === 'low-end',
        isBalanced: activeTier === 'balanced',
        isHighPerf: activeTier === 'high-performance',
      }}
    >
      {children}
    </PerformanceContext.Provider>
  )
}

export function usePerformanceProfile() {
  return useContext(PerformanceContext)
}
