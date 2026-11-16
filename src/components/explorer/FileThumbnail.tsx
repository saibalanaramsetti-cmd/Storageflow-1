import React, { useState, useEffect, useRef } from 'react'
import {
  Folder,
  File,
  Image as ImageIcon,
  Video,
  Music,
  Code,
  Archive,
  FileText,
} from 'lucide-react'
import { getFileTypeCategory, getFileTypeColor } from '../../utils/formatters'
import type { FileItem, ViewMode } from '../../types'

// Global cache of successfully decoded/loaded image paths to eliminate repeat renders on scroll
const loadedImagePaths = new Set<string>()

interface FileThumbnailProps {
  item: FileItem
  viewMode: ViewMode
  className?: string
}

export function FileThumbnail({ item, viewMode, className = '' }: FileThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDirectory = item.type === 'directory'
  const category = getFileTypeCategory(item.extension)
  const isImage = category === 'Images' && !isDirectory

  const isAlreadyLoaded = isImage && loadedImagePaths.has(item.path)
  const [isVisible, setIsVisible] = useState<boolean>(isAlreadyLoaded)
  const [loaded, setLoaded] = useState<boolean>(isAlreadyLoaded)
  const [hasError, setHasError] = useState<boolean>(false)

  // IntersectionObserver: Only mount/decode the image when within 350px of the visible viewport
  useEffect(() => {
    if (!isImage || isAlreadyLoaded) {
      if (isAlreadyLoaded) {
        setIsVisible(true)
        setLoaded(true)
      }
      return
    }

    const el = containerRef.current
    if (!el) return

    // Pre-load 350px ahead of scroll so user never sees lag or empty boxes
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '350px 0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [item.path, isImage, isAlreadyLoaded])

  const handleImageError = () => {
    // If media:// failed, try IPC getThumbnail as fallback
    if (window.electronAPI?.fs.getThumbnail) {
      window.electronAPI.fs
        .getThumbnail(item.path)
        .then((res) => {
          if (res?.success && res.data) {
            // Fallback succeeded
          } else {
            setHasError(true)
          }
        })
        .catch(() => {
          setHasError(true)
        })
    } else {
      setHasError(true)
    }
  }

  // Standard category icon
  const renderIcon = () => {
    if (isDirectory) {
      return (
        <Folder
          size={viewMode === 'grid' ? 36 : 18}
          className="text-amber-400 drop-shadow-sm"
        />
      )
    }

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

  // If it's an image and hasn't errored
  if (isImage && !hasError) {
    const mediaSrc = `media://local/${encodeURIComponent(item.path)}`

    if (viewMode === 'grid') {
      return (
        <div
          ref={containerRef}
          className={`relative w-full h-24 sm:h-28 rounded-xl overflow-hidden bg-black/40 border border-white/10 flex items-center justify-center group-hover:border-blue-500/40 transition-all ${className}`}
        >
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/5">
              <ImageIcon size={22} className="text-gray-500 opacity-60" />
            </div>
          )}
          {isVisible && (
            <img
              src={mediaSrc}
              alt={item.name}
              decoding="async"
              loading="lazy"
              onLoad={() => {
                loadedImagePaths.add(item.path)
                setLoaded(true)
              }}
              onError={handleImageError}
              className={`w-full h-full object-cover transition-opacity duration-200 group-hover:scale-105 ${
                loaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}
        </div>
      )
    }

    // List view thumbnail
    return (
      <div
        ref={containerRef}
        className={`w-7 h-7 rounded-lg overflow-hidden bg-black/40 border border-white/10 flex-shrink-0 flex items-center justify-center ${className}`}
      >
        {isVisible ? (
          <img
            src={mediaSrc}
            alt={item.name}
            decoding="async"
            loading="lazy"
            onLoad={() => {
              loadedImagePaths.add(item.path)
              setLoaded(true)
            }}
            onError={handleImageError}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={14} className="text-gray-500" />
        )}
      </div>
    )
  }

  // Fallback icon container
  if (viewMode === 'grid') {
    return (
      <div className={`w-full h-20 sm:h-24 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${className}`}>
        {renderIcon()}
      </div>
    )
  }

  return (
    <div className={`flex-shrink-0 flex items-center justify-center ${className}`}>
      {renderIcon()}
    </div>
  )
}
