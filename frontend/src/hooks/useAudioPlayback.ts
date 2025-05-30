import { useState, useRef, useCallback, useEffect } from 'react'

interface UseAudioPlaybackProps {
  onPlaybackStart?: () => void
  onPlaybackEnd?: () => void
  onError?: (error: string) => void
}

export const useAudioPlayback = ({
  onPlaybackStart,
  onPlaybackEnd,
  onError
}: UseAudioPlaybackProps = {}) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioBufferQueueRef = useRef<AudioBuffer[]>([])
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const nextPlayTimeRef = useRef<number>(0)
  const isPlayingRef = useRef<boolean>(false)
  const hasStartedRef = useRef<boolean>(false)
  const pendingBuffersRef = useRef<number>(0)
  const streamEndedRef = useRef<boolean>(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentSessionRef = useRef<string | null>(null)
  // Issue 7 Fix: Enhanced error recovery
  const errorCountRef = useRef<number>(0)
  const lastErrorTimeRef = useRef<number>(0)
  const maxErrors = 3
  const errorResetTimeMs = 30000 // Reset error count after 30 seconds
  
  // Issue 7 Fix: Enhanced audio context initialization with recovery
  const initAudioContext = useCallback(async (isRetry: boolean = false) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported')
      }
      
      // Close existing context if reinitializing
      if (isRetry && audioContextRef.current) {
        console.log('🔄 Reinitializing audio context after error')
        try {
          await audioContextRef.current.close()
        } catch (e) {
          console.warn('Error closing old audio context:', e)
        }
        audioContextRef.current = null
      }
      
      if (!audioContextRef.current) {
        // CRITICAL FIX: Try to match OpenAI's 24kHz output first to avoid resampling
        try {
          audioContextRef.current = new AudioContextClass({
            sampleRate: 24000,  // Try to match OpenAI's output exactly
            latencyHint: 'interactive'
          })
          console.log('🎵 Audio context created at 24kHz (matches OpenAI) - NO RESAMPLING NEEDED!')
        } catch (e) {
          console.log('⚠️ 24kHz not supported, falling back to default rate')
          // Fallback to default sample rate
          audioContextRef.current = new AudioContextClass({
            latencyHint: 'interactive'
          })
          console.log('🎵 Audio context created at default rate:', audioContextRef.current.sampleRate)
        }
      }
      
      // CRITICAL: Resume context if suspended (browser autoplay policy)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log('🌵 Audio context resumed - state:', audioContextRef.current.state)
      }
      
      // Verify context is running
      if (audioContextRef.current.state !== 'running') {
        console.warn('⚠️ Audio context not running:', audioContextRef.current.state)
        // Try to resume again
        await audioContextRef.current.resume()
      }
      
      console.log('🔊 Audio context ready - state:', audioContextRef.current.state, 'sample rate:', audioContextRef.current.sampleRate)
      
      // Reset error count on successful initialization
      if (isRetry) {
        errorCountRef.current = 0
        console.log('✅ Audio context recovered successfully')
      }
      
      setIsSupported(true)
      return true
    } catch (error) {
      console.error('Failed to initialize audio context:', error)
      
      // Issue 7 Fix: Implement error recovery for audio context
      const now = Date.now()
      if (now - lastErrorTimeRef.current > errorResetTimeMs) {
        errorCountRef.current = 0 // Reset error count after timeout
      }
      
      errorCountRef.current++
      lastErrorTimeRef.current = now
      
      if (errorCountRef.current <= maxErrors && !isRetry) {
        console.log(`🔄 Attempting audio context recovery (${errorCountRef.current}/${maxErrors})`)
        // Try again after a short delay
        setTimeout(() => initAudioContext(true), 1000)
        return false
      }
      
      onError?.(`Audio not supported: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setIsSupported(false)
      return false
    }
  }, [onError])
  
  // Convert base64 PCM16 audio to AudioBuffer
  const convertPCM16ToAudioBuffer = useCallback(async (base64Audio: string): Promise<AudioBuffer | null> => {
    if (!audioContextRef.current) {
      console.error('No audio context available for conversion')
      return null
    }
    
    try {
      // Decode base64 to binary
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      
      // Convert to 16-bit samples
      const samples = new Int16Array(bytes.buffer)
      
      // OpenAI sends 24kHz, check if we need resampling
      const openAISampleRate = 24000
      const contextSampleRate = audioContextRef.current.sampleRate
      const needsResampling = openAISampleRate !== contextSampleRate
      
      let finalSamples: Float32Array
      let finalLength: number
      
      if (!needsResampling) {
        // PERFECT MATCH: No resampling needed - direct conversion for best quality!
        finalLength = samples.length
        finalSamples = new Float32Array(finalLength)
        for (let i = 0; i < samples.length; i++) {
          finalSamples[i] = samples[i] / 0x7FFF  // Convert PCM16 to float
        }
        console.log(`🎵 Perfect match! No resampling: ${samples.length} samples at ${openAISampleRate}Hz`)
      } else if (needsResampling) {
        // HIGH-QUALITY resampling: 24kHz → 48kHz
        if (contextSampleRate === 48000 && openAISampleRate === 24000) {
          // Linear interpolation for 2x upsampling (much better quality)
          finalLength = samples.length * 2
          finalSamples = new Float32Array(finalLength)
          
          for (let i = 0; i < samples.length - 1; i++) {
            const currentSample = samples[i] / 0x7FFF
            const nextSample = samples[i + 1] / 0x7FFF
            
            // Original sample
            finalSamples[i * 2] = currentSample
            
            // Interpolated sample (average between current and next)
            finalSamples[i * 2 + 1] = (currentSample + nextSample) * 0.5
          }
          
          // Handle last sample
          if (samples.length > 0) {
            const lastSample = samples[samples.length - 1] / 0x7FFF
            finalSamples[finalLength - 2] = lastSample
            finalSamples[finalLength - 1] = lastSample
          }
        } else {
          // Generic high-quality resampling for other rates
          const ratio = contextSampleRate / openAISampleRate
          finalLength = Math.floor(samples.length * ratio)
          finalSamples = new Float32Array(finalLength)
          
          for (let i = 0; i < finalLength; i++) {
            const sourceIndex = i / ratio
            const sourceIndexFloor = Math.floor(sourceIndex)
            const sourceIndexCeil = Math.min(sourceIndexFloor + 1, samples.length - 1)
            const fraction = sourceIndex - sourceIndexFloor
            
            const sample1 = samples[sourceIndexFloor] / 0x7FFF
            const sample2 = samples[sourceIndexCeil] / 0x7FFF
            
            // Linear interpolation for smoother audio
            finalSamples[i] = sample1 + (sample2 - sample1) * fraction
          }
        }
        
        console.log(`🎵 High-quality resampled ${samples.length} samples (${openAISampleRate}Hz) → ${finalLength} samples (${contextSampleRate}Hz)`)
      } else {
        // No resampling needed - this case should be handled above
        finalLength = samples.length
        finalSamples = new Float32Array(finalLength)
        for (let i = 0; i < samples.length; i++) {
          finalSamples[i] = samples[i] / 0x7FFF
        }
      }
      
      // Create AudioBuffer with ACTUAL context sample rate (not forced 48kHz)
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // Mono (1 channel)
        finalLength,
        contextSampleRate  // Use actual context sample rate
      )
      
      // Copy converted samples to AudioBuffer
      const channelData = audioBuffer.getChannelData(0)
      channelData.set(finalSamples)
      
      // Debug: Check audio data
      const maxAmplitude = Math.max(...Array.from(finalSamples).map(Math.abs))
      console.log(`🔊 Audio buffer created: ${samples.length} samples, max amplitude: ${maxAmplitude.toFixed(3)}, duration: ${audioBuffer.duration.toFixed(2)}s`)
      
      if (maxAmplitude < 0.001) {
        console.warn('⚠️ Audio data seems very quiet or empty!')
      }
      
      return audioBuffer
    } catch (error) {
      console.error('Error converting PCM16 to AudioBuffer:', error)
      onError?.('Error processing audio data')
      return null
    }
  }, [onError])
  
  // Play next audio buffer in queue
  const playNextBuffer = useCallback(() => {
    console.log(`🎵 playNextBuffer called - Queue: ${audioBufferQueueRef.current.length}, Context: ${audioContextRef.current ? 'ready' : 'null'}`)
    
    if (!audioContextRef.current || audioBufferQueueRef.current.length === 0) {
      // Check if stream is done and queue is empty
      if (streamEndedRef.current && hasStartedRef.current && audioBufferQueueRef.current.length === 0 && pendingBuffersRef.current === 0) {
        if (import.meta.env.DEV) {
          console.log('🎵 All audio buffers played, ending playback session')
        }
        // Clear timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        setIsPlaying(false)
        isPlayingRef.current = false
        hasStartedRef.current = false
        streamEndedRef.current = false
        onPlaybackEnd?.()
      }
      return
    }
    
    const buffer = audioBufferQueueRef.current.shift()
    if (!buffer) return
    
    pendingBuffersRef.current++
    
    try {
      const source = audioContextRef.current.createBufferSource()
      source.buffer = buffer
      source.connect(audioContextRef.current.destination)
      
      // Debug: Log connection and playback details
      console.log(`🎵 Playing buffer: duration=${buffer.duration.toFixed(2)}s, channels=${buffer.numberOfChannels}, sampleRate=${buffer.sampleRate}`)
      console.log(`🎵 AudioContext state: ${audioContextRef.current.state}, destination channels: ${audioContextRef.current.destination.maxChannelCount}`)
      
      // Calculate when to start playing
      const now = audioContextRef.current.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      
      // Update next play time for seamless playback
      nextPlayTimeRef.current = startTime + buffer.duration
      
      // Handle playback end
      source.onended = () => {
        console.log(`✅ Buffer finished playing (${buffer.duration.toFixed(2)}s)`)
        currentSourceRef.current = null
        pendingBuffersRef.current--
        // CRITICAL: Continue playing next buffer immediately
        setTimeout(() => playNextBuffer(), 10) // Small delay to prevent audio glitches
      }
      
      currentSourceRef.current = source
      source.start(startTime)
      
      // Only trigger start callback once for the entire session
      if (!hasStartedRef.current) {
        if (import.meta.env.DEV) {
          console.log('🎵 Starting audio playback session')
        }
        setIsPlaying(true)
        isPlayingRef.current = true
        hasStartedRef.current = true
        onPlaybackStart?.()
        
        // SIMPLE FIX: Remove timeout entirely - it was causing stale audio playback
        console.log('✨ Audio started - no timeout recovery needed')
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        // TIMEOUT COMPLETELY DISABLED - was causing 30s delayed playback of wrong audio
      }
      
    } catch (error) {
      console.error('Error playing audio buffer:', error)
      pendingBuffersRef.current--
      onError?.('Error playing audio')
    }
  }, [onPlaybackStart, onPlaybackEnd, onError])
  
  // Add audio chunk to playback queue with session safety
  const addAudioChunk = useCallback(async (base64Audio: string, sessionId?: string) => {
    // Session safety check to prevent cross-contamination
    if (sessionId && sessionId !== currentSessionRef.current) {
      console.warn(`⚠️ Ignoring audio chunk from different session: ${sessionId} vs ${currentSessionRef.current}`)
      return
    }
    // Initialize and resume audio context on first use
    if (!audioContextRef.current) {
      const initialized = await initAudioContext()
      if (!initialized) {
        console.warn('Failed to initialize audio playback')
        return
      }
    }
    
    // Resume if suspended
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
        if (import.meta.env.DEV) {
          console.log('🎵 Audio context resumed')
        }
      } catch (e) {
        console.warn('Failed to resume audio context:', e)
      }
    }
    
    // Convert and queue audio
    const audioBuffer = await convertPCM16ToAudioBuffer(base64Audio)
    if (audioBuffer) {
      audioBufferQueueRef.current.push(audioBuffer)
      // Don't log every chunk - too noisy for streaming audio
      
      // Start playing if not already playing
      if (!isPlayingRef.current) {
        playNextBuffer()
      }
    }
  }, [initAudioContext, convertPCM16ToAudioBuffer, playNextBuffer])
  
  // Mark the audio stream as complete
  const markStreamDone = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🎵 Audio stream marked as complete')
      console.log(`🔍 Audio state check: pending=${pendingBuffersRef.current}, queue=${audioBufferQueueRef.current.length}, started=${hasStartedRef.current}, ended=${streamEndedRef.current}`)
    }
    
    // ALWAYS set stream as ended - this is the signal that OpenAI is done sending
    streamEndedRef.current = true
    
    // If there are still queued audio chunks OR pending buffers, let them play naturally
    // The playNextBuffer function will handle completion when everything is truly done
    if (audioBufferQueueRef.current.length > 0 || pendingBuffersRef.current > 0) {
      if (import.meta.env.DEV) {
        console.log(`🎵 Stream ended, but ${audioBufferQueueRef.current.length} chunks queued + ${pendingBuffersRef.current} pending. Letting playback finish naturally.`)
      }
      return // Let playNextBuffer handle completion when everything is empty
    }
    
    // Only complete immediately if truly nothing is playing and we had started
    if (hasStartedRef.current) {
      if (import.meta.env.DEV) {
        console.log('🎵 No audio buffers, ending playback immediately')
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setIsPlaying(false)
      isPlayingRef.current = false
      hasStartedRef.current = false
      streamEndedRef.current = false
      onPlaybackEnd?.()
    } else {
      // Stream ended but never started playing - this means OpenAI sent no audio
      if (import.meta.env.DEV) {
        console.log('🎵 Stream ended but no audio was played (OpenAI sent no audio)')
      }
      streamEndedRef.current = false // Reset for next response
    }
  }, [onPlaybackEnd])
  
  // Set current session (call this when session changes)
  const setCurrentSession = useCallback((sessionId: string) => {
    if (currentSessionRef.current && currentSessionRef.current !== sessionId) {
      console.log(`🔄 Session changed: ${currentSessionRef.current} → ${sessionId}. Clearing audio queue.`)
      // Clear audio queue to prevent cross-session contamination
      audioBufferQueueRef.current = []
      // Don't call stopPlayback here to avoid circular dependency
      if (currentSourceRef.current) {
        try {
          currentSourceRef.current.stop()
          currentSourceRef.current = null
        } catch (error) {
          console.warn('Error stopping audio source during session change:', error)
        }
      }
      setIsPlaying(false)
      isPlayingRef.current = false
    }
    currentSessionRef.current = sessionId
  }, [])
  
  // Stop current playback
  const stopPlayback = useCallback(() => {
    if (import.meta.env.DEV && isPlayingRef.current) {
      console.log('🎵 Stopping audio playback')
    }
    
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop()
        currentSourceRef.current = null
      } catch (error) {
        console.warn('Error stopping audio source:', error)
      }
    }
    
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    
    // Clear queue and reset state
    audioBufferQueueRef.current = []
    nextPlayTimeRef.current = 0
    pendingBuffersRef.current = 0
    hasStartedRef.current = false
    streamEndedRef.current = false
    
    if (isPlayingRef.current) {
      setIsPlaying(false)
      isPlayingRef.current = false
      onPlaybackEnd?.()
    }
  }, [onPlaybackEnd])
  
  // Clear playback queue
  const clearQueue = useCallback(() => {
    if (import.meta.env.DEV && audioBufferQueueRef.current.length > 0) {
      console.log('🎵 Clearing audio queue')
    }
    audioBufferQueueRef.current = []
    streamEndedRef.current = false
  }, [])
  
  // Cleanup function
  const cleanup = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('🎵 Cleaning up audio playback')
    }
    stopPlayback()
    
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
  }, [stopPlayback])
  
  // Initialize audio support check on mount - but don't create AudioContext yet
  useEffect(() => {
    // Only check support, don't initialize AudioContext until user gesture
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    const supported = !!AudioContextClass
    setIsSupported(supported)
    
    // Only cleanup on actual unmount, not on every render
    return () => {
      if (audioContextRef.current) {
        console.log('🎵 Final cleanup on unmount')
        cleanup()
      }
    }
  }, []) // Empty deps - only run once
  
  return {
    isPlaying,
    isSupported,
    addAudioChunk,
    markStreamDone,
    stopPlayback,
    clearQueue,
    cleanup,
    setCurrentSession  // Add session management
  }
}

export default useAudioPlayback