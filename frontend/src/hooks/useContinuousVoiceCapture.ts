import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'react-hot-toast'

// Convert Float32Array to Int16Array for PCM16 format
const floatTo16BitPCM = (float32Array: Float32Array): Int16Array => {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return int16Array
}

// Convert Int16Array to base64 string
const int16ArrayToBase64 = (int16Array: Int16Array): string => {
  const uint8Array = new Uint8Array(int16Array.buffer)
  let binary = ''
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i])
  }
  return btoa(binary)
}

// Resample audio from source rate to target rate
const resampleAudio = (audioData: Float32Array, sourceRate: number, targetRate: number): Float32Array => {
  if (sourceRate === targetRate) return audioData
  
  const ratio = sourceRate / targetRate
  const outputLength = Math.floor(audioData.length / ratio)
  const output = new Float32Array(outputLength)
  
  for (let i = 0; i < outputLength; i++) {
    const sourceIndex = i * ratio
    const sourceIndexFloor = Math.floor(sourceIndex)
    const sourceIndexCeil = Math.min(sourceIndexFloor + 1, audioData.length - 1)
    const fraction = sourceIndex - sourceIndexFloor
    
    output[i] = audioData[sourceIndexFloor] * (1 - fraction) + 
                audioData[sourceIndexCeil] * fraction
  }
  
  return output
}

interface UseContinuousVoiceCaptureProps {
  onError?: (error: string) => void
  onStatusChange?: (status: 'idle' | 'listening' | 'processing' | 'active') => void
  wsRef: React.MutableRefObject<WebSocket | null>
  enableWakeWord?: boolean
  wakePhrase?: string
  chunkDurationMs?: number
  isAISpeaking?: boolean
}

export const useContinuousVoiceCapture = ({
  onError,
  onStatusChange,
  wsRef,
  enableWakeWord = false,
  wakePhrase = "hey voiceinbox",
  chunkDurationMs = 100,
  isAISpeaking = false
}: UseContinuousVoiceCaptureProps) => {
  const [isListening, setIsListening] = useState(false)
  const [isActive, setIsActive] = useState(false) // Active conversation after wake word
  const [isMuted, setIsMuted] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null) // Fallback
  const audioBufferRef = useRef<Float32Array[]>([])
  const isProcessingRef = useRef(false)
  const sendIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const deactivateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const workletLoadedRef = useRef(false)
  const useWorkletRef = useRef(false)
  const lastSendTimeRef = useRef<number>(0)
  
  // Enhanced wake word detection (works better on HTTP)
  const wakeWordDetectionRef = useRef<{
    enabled: boolean
    confidence: number
    lastDetection: number
  }>({
    enabled: false,
    confidence: 0,
    lastDetection: 0
  })
  
  // Check browser support including AudioWorklet
  const checkSupport = useCallback(() => {
    const hasGetUserMedia =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'

    const hasAudioContext =
      typeof window !== 'undefined' &&
      (!!window.AudioContext || !!(window as any).webkitAudioContext)

    const hasAudioWorklet = hasAudioContext && 
      typeof AudioContext !== 'undefined' &&
      'audioWorklet' in AudioContext.prototype

    const supported = hasGetUserMedia && hasAudioContext
    setIsSupported(supported)
    
    // Issue 3 Fix: Better HTTP/HTTPS compatibility
    const isHTTPS = typeof window !== 'undefined' && window.location.protocol === 'https:'
    if (enableWakeWord && !isHTTPS) {
      console.warn('⚠️ Wake word detection works better on HTTPS. On HTTP, manual activation is recommended.')
    }
    
    if (hasAudioWorklet) {
      console.log('🎧 AudioWorklet supported - using modern audio processing')
    } else {
      console.warn('⚠️ AudioWorklet not supported - falling back to deprecated ScriptProcessor')
    }
    
    return supported
  }, [enableWakeWord])
  
  // Request microphone permission
  const requestPermission = useCallback(async () => {
    if (!checkSupport()) {
      onError?.('Browser does not support audio recording')
      return false
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      stream.getTracks().forEach(track => track.stop())
      setPermissionStatus('granted')
      return true
    } catch (error) {
      console.error('Microphone permission denied:', error)
      setPermissionStatus('denied')
      onError?.('Microphone permission denied')
      return false
    }
  }, [checkSupport, onError])
  
  // Issue 5 Fix: Send audio chunks ONLY when truly active - prevents credit waste
  const sendAudioChunk = useCallback(() => {
    if (!isProcessingRef.current || audioBufferRef.current.length === 0) return
    
    // CRITICAL: Only process and send audio when truly active
    const shouldSendAudio = !isMuted && 
                           (!enableWakeWord || isActive) && 
                           !isAISpeaking
    
    if (!shouldSendAudio) {
      // Clear buffer completely to prevent memory buildup and credit waste
      audioBufferRef.current = []
      return
    }
    
    // Check WebSocket is ready
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      audioBufferRef.current = [] // Clear buffer
      return
    }
    
    // Rate limiting: don't send too frequently
    const now = Date.now()
    if (now - lastSendTimeRef.current < chunkDurationMs - 10) {
      return // Too soon, skip this chunk
    }
    lastSendTimeRef.current = now
    
    // Combine buffers
    const totalLength = audioBufferRef.current.reduce((acc, buf) => acc + buf.length, 0)
    const combined = new Float32Array(totalLength)
    let offset = 0
    
    for (const buffer of audioBufferRef.current) {
      combined.set(buffer, offset)
      offset += buffer.length
    }
    
    // Clear buffer immediately after combining
    audioBufferRef.current = []
    
    // Skip if too small (saves bandwidth and credits)
    if (combined.length < 1000) return
    
    // Resample to 24kHz if needed
    const sampleRate = audioContextRef.current?.sampleRate || 48000
    const resampled = sampleRate === 24000 ? combined : resampleAudio(combined, sampleRate, 24000)
    
    // Convert to PCM16 and base64
    const pcm16 = floatTo16BitPCM(resampled)
    const base64 = int16ArrayToBase64(pcm16)
    
    // Send via WebSocket ONLY when active
    wsRef.current.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: base64
    }))
  }, [isMuted, enableWakeWord, isActive, wsRef, isAISpeaking, chunkDurationMs])

  // Fallback recording using deprecated ScriptProcessor
  const startListeningFallback = useCallback(async (stream: MediaStream, audioContext: AudioContext) => {
    console.log('🔄 Using fallback ScriptProcessor for continuous recording')
    
    const source = audioContext.createMediaStreamSource(stream)
    // @ts-ignore - ScriptProcessorNode is deprecated but still works
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    
    sourceNodeRef.current = source
    processorNodeRef.current = processor
    
    // Clear buffer
    audioBufferRef.current = []
    
    // Set up audio processing - ONLY when conditions are met
    // @ts-ignore - onaudioprocess is deprecated but still works
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!isProcessingRef.current) return
      
      // Issue 5 Fix: Only process audio when truly active
      const shouldProcess = !isMuted && (!enableWakeWord || isActive) && !isAISpeaking
      
      if (shouldProcess) {
        // @ts-ignore - inputBuffer is deprecated but still works
        const inputData = e.inputBuffer.getChannelData(0)
        const buffer = new Float32Array(inputData.length)
        buffer.set(inputData)
        audioBufferRef.current.push(buffer)
      }
    }
    
    // Connect nodes
    source.connect(processor)
    processor.connect(audioContext.destination)
    
    useWorkletRef.current = false
  }, [enableWakeWord, isActive, isMuted, isAISpeaking])
  
  // Start continuous listening
  const startListening = useCallback(async () => {
    if (isListening || isProcessingRef.current) {
      console.log('Already listening')
      return
    }
    
    if (permissionStatus === 'denied') {
      onError?.('Microphone permission denied')
      return
    }
    
    if (permissionStatus === 'prompt') {
      const granted = await requestPermission()
      if (!granted) return
    }
    
    try {
      isProcessingRef.current = true
      
      // Get user media
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 48000,  // FIXED: Consistent 48kHz sample rate
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      } catch (e) {
        console.warn('Failed with ideal constraints, trying fallback')
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true
          }
        })
      }
      
      mediaStreamRef.current = stream
      
      // Create audio context - always create fresh context to avoid scope issues
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      
      // Always create a new AudioContext to avoid AudioWorklet scope issues
      if (audioContextRef.current) {
        console.log('🔄 Closing previous AudioContext for continuous capture')
        try {
          await audioContextRef.current.close()
        } catch (e) {
          console.warn('Error closing previous AudioContext:', e)
        }
        audioContextRef.current = null
        workletLoadedRef.current = false // Reset worklet loaded state
      }
      
      // CRITICAL FIX: Force 48kHz AudioContext for voice capture
      audioContextRef.current = new AudioContextClass({
        sampleRate: 48000  // Force 48kHz to match audio playback
      })
      
      // Resume context if needed
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log('🎧 Audio context resumed for continuous listening')
      }
      
      // Try to use AudioWorklet first - always reload module for fresh context
      const hasAudioWorklet = 'audioWorklet' in audioContextRef.current
      if (hasAudioWorklet) {
        try {
          // Always reload the AudioWorklet module for fresh AudioContext
          await audioContextRef.current.audioWorklet.addModule('/worklets/continuous-voice-processor.js')
          workletLoadedRef.current = true
          console.log('📡 Continuous AudioWorklet loaded successfully for fresh context')
        } catch (error) {
          console.warn('⚠️ AudioWorklet failed to load:', error)
          workletLoadedRef.current = false
        }
      }
      
      if (hasAudioWorklet && workletLoadedRef.current) {
        // Use modern AudioWorklet
        const source = audioContextRef.current.createMediaStreamSource(stream)
        const workletNode = new AudioWorkletNode(audioContextRef.current, 'continuous-voice-processor')
        
        sourceNodeRef.current = source
        workletNodeRef.current = workletNode
        
        // Clear buffer
        audioBufferRef.current = []
        
        // Set up audio processing via worklet messages
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audioData' && isProcessingRef.current) {
            audioBufferRef.current.push(new Float32Array(event.data.buffer))
          }
        }
        
        // Configure worklet state
        workletNode.port.postMessage({ 
          type: 'setActive', 
          active: !enableWakeWord // If no wake word, start active immediately
        })
        workletNode.port.postMessage({ type: 'setMuted', muted: isMuted })
        workletNode.port.postMessage({ type: 'setAISpeaking', aiSpeaking: isAISpeaking })
        
        // Connect nodes
        source.connect(workletNode)
        
        useWorkletRef.current = true
        console.log('🎧 Continuous listening started with AudioWorklet (fresh context)')
      } else {
        // Fallback to deprecated ScriptProcessor
        await startListeningFallback(stream, audioContextRef.current)
        console.log('🎧 Continuous listening started with ScriptProcessor (fallback)')
      }
      
      // Start sending audio chunks periodically
      sendIntervalRef.current = setInterval(sendAudioChunk, chunkDurationMs)
      
      setIsListening(true)
      
      // Issue 3 Fix: Better wake word handling for HTTP/HTTPS
      if (!enableWakeWord) {
        setIsActive(true)
        onStatusChange?.('active')
        console.log('🎤 Continuous listening active (no wake word)')
      } else {
        setIsActive(false)
        onStatusChange?.('listening')
        
        // Auto-activate on HTTP since wake word detection is limited
        const isHTTPS = window.location.protocol === 'https:'
        if (!isHTTPS) {
          console.log('💡 HTTP detected - auto-activating for better UX (wake word limited on HTTP)')
          setTimeout(() => {
            if (isListening && !isActive) {
              console.log('💡 Auto-activating voice capture on HTTP')
              setIsActive(true)
              onStatusChange?.('active')
              toast('🎤 Voice activated automatically (HTTP mode)', { icon: '💡', duration: 3000 })
            }
          }, 1000)
        } else {
          console.log('🎯 Wake word detection enabled on HTTPS')
        }
      }
      
    } catch (error) {
      console.error('Error starting listening:', error)
      onError?.(`Failed to start listening: ${error}`)
      onStatusChange?.('idle')
      isProcessingRef.current = false
      cleanup()
    }
  }, [isListening, permissionStatus, requestPermission, onError, onStatusChange, sendAudioChunk, chunkDurationMs, enableWakeWord, startListeningFallback, isMuted, isAISpeaking])
  
  // Stop listening
  const stopListening = useCallback(() => {
    if (!isListening || !isProcessingRef.current) {
      console.log('Not listening')
      return
    }
    
    isProcessingRef.current = false
    setIsListening(false)
    setIsActive(false)
    onStatusChange?.('idle')
    
    // Clear intervals and timeouts
    if (sendIntervalRef.current) {
      clearInterval(sendIntervalRef.current)
      sendIntervalRef.current = null
    }
    
    if (deactivateTimeoutRef.current) {
      clearTimeout(deactivateTimeoutRef.current)
      deactivateTimeoutRef.current = null
    }
    
    // Issue 5 Fix: Completely stop audio processing
    if (useWorkletRef.current && workletNodeRef.current) {
      // Deactivate worklet processing
      workletNodeRef.current.port.postMessage({ type: 'setActive', active: false })
    }
    
    cleanup()
    console.log('🎤 Continuous listening stopped completely')
  }, [isListening, onStatusChange])
  
  // Toggle mute with worklet communication
  const toggleMute = useCallback(() => {
    const newMutedState = !isMuted
    setIsMuted(newMutedState)
    
    // Update worklet state if using AudioWorklet
    if (useWorkletRef.current && workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'setMuted', muted: newMutedState })
    }
    
    console.log(`🔇 Microphone ${newMutedState ? 'muted' : 'unmuted'}`)
  }, [isMuted])
  
  // Manual activation (for use without wake word or when wake word fails)
  const activateManually = useCallback(() => {
    if (!isListening) {
      console.log('Not listening, cannot activate')
      return
    }
    
    setIsActive(true)
    onStatusChange?.('active')
    
    // Update worklet state if using AudioWorklet
    if (useWorkletRef.current && workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'setActive', active: true })
    }
    
    console.log('🎯 Manually activated voice capture')
    
    // Clear any existing timeout
    if (deactivateTimeoutRef.current) {
      clearTimeout(deactivateTimeoutRef.current)
    }
    
    // Auto-deactivate after 30 seconds if using wake word
    if (enableWakeWord) {
      deactivateTimeoutRef.current = setTimeout(() => {
        setIsActive(false)
        onStatusChange?.('listening')
        
        // Update worklet state
        if (useWorkletRef.current && workletNodeRef.current) {
          workletNodeRef.current.port.postMessage({ type: 'setActive', active: false })
        }
        
        console.log('🔄 Auto-deactivated after 30 seconds')
      }, 30000)
    }
  }, [isListening, onStatusChange, enableWakeWord])
  
  // Update AI speaking state
  useEffect(() => {
    if (useWorkletRef.current && workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'setAISpeaking', aiSpeaking: isAISpeaking })
    }
  }, [isAISpeaking])
  
  // Cleanup resources
  const cleanup = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    sourceNodeRef.current = null
    workletNodeRef.current = null
    processorNodeRef.current = null
    audioBufferRef.current = []
  }, [])
  
  // Check support on mount
  useEffect(() => {
    checkSupport()
    
    return () => {
      if (isProcessingRef.current) {
        isProcessingRef.current = false
        cleanup()
      }
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current)
      }
      if (deactivateTimeoutRef.current) {
        clearTimeout(deactivateTimeoutRef.current)
      }
    }
  }, [checkSupport, cleanup])
  
  return {
    isListening,
    isActive,
    isMuted,
    isSupported,
    permissionStatus,
    startListening,
    stopListening,
    toggleMute,
    requestPermission,
    cleanup,
    wakePhrase,
    activateManually
  }
}

export default useContinuousVoiceCapture
