import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Config ──────────────────────────────────────────────────────────────
const MIN_BUFFER_BEFORE_PLAY = 0.4      // seconds to buffer before the first play
const SILENCE_TIMEOUT        = 500      // ms to wait when queue runs dry

interface UseAudioPlaybackProps {
  onPlaybackStart?: () => void
  onPlaybackEnd?: () => void
  onError?: (msg: string) => void
}

export const useAudioPlayback = ({
  onPlaybackStart,
  onPlaybackEnd,
  onError
}: UseAudioPlaybackProps = {}) => {
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [isSupported, setIsSupported] = useState(false)

  // —— refs (never trigger re-render) ————————————
  const audioContextRef        = useRef<AudioContext | null>(null)
  const audioBufferQueueRef    = useRef<AudioBuffer[]>([])
  const currentSourceRef       = useRef<AudioBufferSourceNode | null>(null)
  const nextPlayTimeRef        = useRef(0)
  const totalQueuedDurRef      = useRef(0)
  const silenceTimerRef        = useRef<number | null>(null)
  const streamDoneRef          = useRef(false)
  const isPlayingRef           = useRef(false)

  // ─── helpers ───────────────────────────────────────────────────────────
  const createCtx = () =>
    new ((window as any).AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 24_000
    }) as AudioContext

  /** Ensure we have a _live_ AudioContext (re-create if it was closed). */
  const ensureCtx = useCallback(async (): Promise<AudioContext | null> => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed')
        audioContextRef.current = createCtx()
      return audioContextRef.current
    } catch (err) {
      console.error('AudioContext init failed', err)
      onError?.('Web-Audio init failed')
      return null
    }
  }, [onError])

  /** base-64 PCM-16-LE 24 kHz → AudioBuffer */
  const b64pcmToBuffer = useCallback(
    async (b64: string): Promise<AudioBuffer | null> => {
      const ctx = audioContextRef.current
      if (!ctx) return null
      try {
        const bin   = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const samples = new Int16Array(bytes.buffer)
        const buf     = ctx.createBuffer(1, samples.length, 24_000)
        const ch0     = buf.getChannelData(0)
        for (let i = 0; i < samples.length; i++) ch0[i] = samples[i] / 32768
        return buf
      } catch (e) {
        console.error('PCM decode failed', e)
        onError?.('Audio decode error')
        return null
      }
    },
    [onError]
  )

  // ─── core scheduler (keeps chain warm) ─────────────────────────────────
  const playNext = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return

    // empty queue
    if (audioBufferQueueRef.current.length === 0) {
      if (!streamDoneRef.current) {
        // expect more chunks → poll later
        if (silenceTimerRef.current === null) {
          silenceTimerRef.current = window.setTimeout(() => {
            silenceTimerRef.current = null
            playNext()
          }, SILENCE_TIMEOUT)
        }
        return
      }
      // stream finished → fire end callback
      if (isPlayingRef.current) {
        isPlayingRef.current = false
        setIsPlaying(false)
        onPlaybackEnd?.()
      }
      return
    }

    // have a buffer — clear any “silence” timer
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    const buf    = audioBufferQueueRef.current.shift()!
    const source = ctx.createBufferSource()
    source.buffer = buf
    source.connect(ctx.destination)

    const t0 = Math.max(ctx.currentTime, nextPlayTimeRef.current)
    nextPlayTimeRef.current = t0 + buf.duration

    source.onended = () => {
      currentSourceRef.current = null
      playNext()
    }

    currentSourceRef.current = source
    source.start(t0)

    if (!isPlayingRef.current) {
      isPlayingRef.current = true
      setIsPlaying(true)
      onPlaybackStart?.()
    }
  }, [onPlaybackEnd, onPlaybackStart])

  // ─── public API ────────────────────────────────────────────────────────
  const addAudioChunk = useCallback(
    async (b64: string) => {
      const ctx = await ensureCtx()
      if (!ctx) return

      if (ctx.state === 'suspended')
        try { await ctx.resume() } catch {}

      const buf = await b64pcmToBuffer(b64)
      if (!buf) return

      audioBufferQueueRef.current.push(buf)
      totalQueuedDurRef.current += buf.duration

      if (
        !isPlayingRef.current &&
        totalQueuedDurRef.current >= MIN_BUFFER_BEFORE_PLAY
      )
        playNext()
    },
    [ensureCtx, b64pcmToBuffer, playNext]
  )

  const markStreamDone = useCallback(() => {
    streamDoneRef.current = true
    playNext()
  }, [playNext])

  const stopPlayback = useCallback(() => {
    currentSourceRef.current?.stop()
    currentSourceRef.current = null
    audioBufferQueueRef.current = []
    totalQueuedDurRef.current   = 0
    if (isPlayingRef.current) {
      isPlayingRef.current = false
      setIsPlaying(false)
      onPlaybackEnd?.()
    }
  }, [onPlaybackEnd])

  const clearQueue = useCallback(() => {
    audioBufferQueueRef.current = []
    totalQueuedDurRef.current   = 0
  }, [])

  /** tidy up on component unmount / hot-reload */
  const cleanup = useCallback(() => {
    if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current)
    stopPlayback()

    const ctx = audioContextRef.current
    // Guard: only close if still open – avoids “Cannot close a closed AudioContext”
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {})
  }, [stopPlayback])

  // one-time feature-detect
  useEffect(() => {
    const ok =
      !!(window as any).AudioContext || !!(window as any).webkitAudioContext
    setIsSupported(ok)
    return cleanup
  }, [cleanup])

  // ─── return value ──────────────────────────────────────────────────────
  return {
    isPlaying,
    isSupported,
    addAudioChunk,
    markStreamDone,
    stopPlayback,
    clearQueue,
    cleanup
  }
}

export default useAudioPlayback
