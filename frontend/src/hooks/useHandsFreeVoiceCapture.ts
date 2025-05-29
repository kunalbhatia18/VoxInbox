import { useState, useRef, useCallback, useEffect } from 'react'

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

interface UseHandsFreeVoiceCaptureProps {
  onAudioChunk?: (audioBase64: string) => void
  onError?: (error: string) => void
  onStatusChange?: (status: 'idle' | 'listening' | 'speech_detected' | 'processing') => void
  enabled?: boolean // Allow enabling/disabling hands-free mode
}

export const useHandsFreeVoiceCapture = ({
  onAudioChunk,
  onError,
  onStatusChange,
  enabled = true
}: UseHandsFreeVoiceCaptureProps = {}) => {
  const [isListening, setIsListening] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  const [speechDetected, setSpeechDetected] = useState(false)
  
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null)
  const isActiveRef = useRef(false)
  const chunkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioBufferRef = useRef<Float32Array[]>([])
  
  // Check browser support
  const checkSupport = useCallback(() => {
    const hasGetUserMedia =
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === 'function'

    const hasAudioContext =
      typeof window !== 'undefined' &&
      (!!window.AudioContext || !!(window as any).webkitAudioContext)

    const supported = hasGetUserMedia && hasAudioContext
    setIsSupported(supported)
    return supported
  }, [])
  
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
      onError?.('Microphone permission denied. Please allow microphone access for hands-free operation.')
      return false
    }
  }, [checkSupport, onError])
  
  // Process and send audio chunk
  const processAndSendChunk = useCallback(() => {
    if (!isActiveRef.current || audioBufferRef.current.length === 0) {
      return
    }
    
    try {
      const sampleRate = audioContextRef.current?.sampleRate || 48000
      
      // Combine all buffers
      const totalLength = audioBufferRef.current.reduce((acc, buf) => acc + buf.length, 0)
      const combined = new Float32Array(totalLength)
      let offset = 0
      
      for (const buffer of audioBufferRef.current) {
        combined.set(buffer, offset)
        offset += buffer.length
      }
      
      // Clear buffer for next chunk
      audioBufferRef.current = []
      
      if (combined.length === 0) return
      
      // Resample to 24kHz
      const resampled = resampleAudio(combined, sampleRate, 24000)
      
      // Convert to PCM16
      const pcm16 = floatTo16BitPCM(resampled)
      
      // Convert to base64
      const base64 = int16ArrayToBase64(pcm16)
      
      // Only send if we have meaningful audio data
      if (base64.length > 100) { // Smaller threshold for continuous streaming
        onAudioChunk?.(base64)
        
        if (import.meta.env.DEV && Math.random() < 0.1) { // Log occasionally
          console.log(`🎤 Sent audio chunk: ${resampled.length} samples → ${base64.length} chars`)
        }
      }
      
    } catch (error) {
      console.error('Error processing audio chunk:', error)
      onError?.(`Failed to process audio: ${error}`)
    }
  }, [onAudioChunk, onError])
  
  // Start continuous listening
  const startListening = useCallback(async () => {
    if (isListening || isActiveRef.current) {
      console.log('Already listening')
      return true
    }
    
    if (!enabled) {
      console.log('Hands-free mode disabled')
      return false
    }
    
    if (permissionStatus === 'denied') {
      onError?.('Microphone permission denied')
      return false
    }
    
    if (permissionStatus === 'prompt') {
      const granted = await requestPermission()
      if (!granted) return false
    }
    
    try {
      onStatusChange?.('listening')
      
      // Get user media
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      } catch (e) {
        console.warn('Failed with ideal constraints, trying fallback')
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      
      mediaStreamRef.current = stream
      
      // Create audio context  
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      const audioContext = new AudioContextClass()
      audioContextRef.current = audioContext
      
      // Create nodes
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(2048, 1, 1) // Smaller buffer for lower latency
      
      sourceNodeRef.current = source
      processorNodeRef.current = processor
      
      // Clear audio buffer
      audioBufferRef.current = []
      
      // Set up continuous audio processing
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!isActiveRef.current) return
        
        const inputData = e.inputBuffer.getChannelData(0)
        const buffer = new Float32Array(inputData.length)
        buffer.set(inputData)
        audioBufferRef.current.push(buffer)
      }
      
      // Connect nodes
      source.connect(processor)
      processor.connect(audioContext.destination)
      
      // Resume context if needed
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }
      
      isActiveRef.current = true
      setIsListening(true)
      
      // Start sending audio chunks continuously (every 100ms for responsive VAD)
      chunkIntervalRef.current = setInterval(processAndSendChunk, 100)
      
      console.log('🎤 Hands-free listening started')
      return true
      
    } catch (error) {
      console.error('Error starting hands-free listening:', error)
      onError?.(`Failed to start listening: ${error}`)
      onStatusChange?.('idle')
      stopListening()
      return false
    }
  }, [isListening, enabled, permissionStatus, requestPermission, onError, onStatusChange, processAndSendChunk])
  
  // Stop listening
  const stopListening = useCallback(() => {
    if (!isListening && !isActiveRef.current) {
      return
    }
    
    isActiveRef.current = false
    setIsListening(false)
    setSpeechDetected(false)
    
    // Clear interval
    if (chunkIntervalRef.current) {
      clearInterval(chunkIntervalRef.current)
      chunkIntervalRef.current = null
    }
    
    // Process any remaining audio
    processAndSendChunk()
    
    // Cleanup resources
    cleanup()
    
    onStatusChange?.('idle')
    console.log('🎤 Hands-free listening stopped')
  }, [isListening, processAndSendChunk, onStatusChange])
  
  // Cleanup resources
  const cleanup = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
      mediaStreamRef.current = null
    }
    
    if (sourceNodeRef.current && processorNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect()
        processorNodeRef.current.disconnect()
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    
    sourceNodeRef.current = null
    processorNodeRef.current = null
    audioBufferRef.current = []
  }, [])
  
  // Handle VAD events from OpenAI
  const handleVADEvent = useCallback((eventType: 'speech_started' | 'speech_stopped') => {
    if (eventType === 'speech_started') {
      setSpeechDetected(true)
      onStatusChange?.('speech_detected')
      console.log('🗣️ Speech detected by OpenAI VAD')
    } else if (eventType === 'speech_stopped') {
      setSpeechDetected(false)
      onStatusChange?.('processing')
      console.log('🤐 Speech ended, processing...')
    }
  }, [onStatusChange])
  
  // Auto-restart if stream fails
  const restartIfNeeded = useCallback(async () => {
    if (enabled && !isListening && permissionStatus === 'granted') {
      console.log('🔄 Auto-restarting hands-free listening...')
      await startListening()
    }
  }, [enabled, isListening, permissionStatus, startListening])
  
  // Check support on mount and auto-start if enabled
  useEffect(() => {
    checkSupport()
  }, [checkSupport])
  
  // Auto-start when enabled and permission granted
  useEffect(() => {
    if (enabled && permissionStatus === 'granted' && !isListening) {
      console.log('🎤 Auto-starting hands-free mode...')
      startListening()
    } else if (!enabled && isListening) {
      console.log('🛑 Stopping hands-free mode (disabled)...')
      stopListening()
    }
  }, [enabled, permissionStatus, isListening, startListening, stopListening])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chunkIntervalRef.current) {
        clearInterval(chunkIntervalRef.current)
      }
      isActiveRef.current = false
      cleanup()
    }
  }, [cleanup])
  
  return {
    isListening,
    speechDetected,
    isSupported,
    permissionStatus,
    startListening,
    stopListening,
    requestPermission,
    handleVADEvent,
    restartIfNeeded,
    cleanup
  }
}

export default useHandsFreeVoiceCapture