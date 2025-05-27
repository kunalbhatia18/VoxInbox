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
  
  // Initialize audio context
  const initAudioContext = useCallback(async () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      
      if (!AudioContextClass) {
        throw new Error('Web Audio API not supported')
      }
      
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass({
          sampleRate: 24000 // Match OpenAI output sample rate
        })
      }
      
      // Resume context if suspended (browser autoplay policy)
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      
      setIsSupported(true)
      return true
    } catch (error) {
      console.error('Failed to initialize audio context:', error)
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
      
      // Create AudioBuffer
      const audioBuffer = audioContextRef.current.createBuffer(
        1, // Mono
        samples.length,
        24000 // Sample rate
      )
      
      // Convert to float and copy to AudioBuffer
      const channelData = audioBuffer.getChannelData(0)
      for (let i = 0; i < samples.length; i++) {
        channelData[i] = samples[i] / 0x7FFF // Convert from 16-bit int to float [-1, 1]
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
    if (!audioContextRef.current || audioBufferQueueRef.current.length === 0) {
      // Check if we're truly done (no pending buffers and stream ended)
      if (pendingBuffersRef.current === 0 && hasStartedRef.current && streamEndedRef.current) {
        if (import.meta.env.DEV) {
          console.log('🎵 All audio buffers played, ending playback session')
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
      
      // Calculate when to start playing
      const now = audioContextRef.current.currentTime
      const startTime = Math.max(now, nextPlayTimeRef.current)
      
      // Update next play time for seamless playback
      nextPlayTimeRef.current = startTime + buffer.duration
      
      // Handle playback end
      source.onended = () => {
        currentSourceRef.current = null
        pendingBuffersRef.current--
        // Continue playing next buffer
        playNextBuffer()
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
      }
      
    } catch (error) {
      console.error('Error playing audio buffer:', error)
      pendingBuffersRef.current--
      onError?.('Error playing audio')
    }
  }, [onPlaybackStart, onPlaybackEnd, onError])
  
  // Add audio chunk to playback queue
  const addAudioChunk = useCallback(async (base64Audio: string) => {
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
    }
    streamEndedRef.current = true
    
    // If no buffers are pending and queue is empty, end immediately
    if (pendingBuffersRef.current === 0 && audioBufferQueueRef.current.length === 0 && hasStartedRef.current) {
      if (import.meta.env.DEV) {
        console.log('🎵 No pending audio, ending playback immediately')
      }
      setIsPlaying(false)
      isPlayingRef.current = false
      hasStartedRef.current = false
      streamEndedRef.current = false
      onPlaybackEnd?.()
    }
  }, [onPlaybackEnd])
  
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
    cleanup
  }
}

export default useAudioPlayback