import { useState, useRef, useCallback, useEffect } from 'react'

// Convert Float32Array to Int16Array for PCM16 format
const floatTo16BitPCM = (float32Array: Float32Array): Int16Array => {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    // Convert float (-1 to 1) to 16-bit int (-32768 to 32767)
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

interface UseVoiceCaptureProps {
  onAudioData?: (audioBase64: string) => void
  onError?: (error: string) => void
  onStatusChange?: (status: 'idle' | 'recording' | 'processing') => void
}

export const useVoiceCapture = ({
  onAudioData,
  onError,
  onStatusChange
}: UseVoiceCaptureProps = {}) => {
  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null) // Fallback
  const audioBufferRef = useRef<Float32Array[]>([])
  const isProcessingRef = useRef(false)
  const workletLoadedRef = useRef(false)
  const useWorkletRef = useRef(false)
  // Fix: Track AudioContext instance to prevent scope issues
  const audioContextInstanceRef = useRef<number>(0)
  
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
    
    if (hasAudioWorklet) {
      console.log('🎧 AudioWorklet supported - using modern audio processing')
    } else {
      console.warn('⚠️ AudioWorklet not supported - falling back to deprecated ScriptProcessor')
    }
    
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
          sampleRate: 48000,  // FIXED: Match everything else at 48kHz
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

  // Fallback recording using deprecated ScriptProcessor
  const startRecordingFallback = useCallback(async (stream: MediaStream, audioContext: AudioContext) => {
    console.log('🔄 Using fallback ScriptProcessor for audio recording')
    
    const source = audioContext.createMediaStreamSource(stream)
    // @ts-ignore - ScriptProcessorNode is deprecated but still works
    const processor = audioContext.createScriptProcessor(4096, 1, 1)
    
    sourceNodeRef.current = source
    processorNodeRef.current = processor
    
    // Clear previous buffer
    audioBufferRef.current = []
    
    // Set up audio processing
    // @ts-ignore - onaudioprocess is deprecated but still works
    processor.onaudioprocess = (e: AudioProcessingEvent) => {
      if (!isProcessingRef.current) return
      
      // @ts-ignore - inputBuffer is deprecated but still works
      const inputData = e.inputBuffer.getChannelData(0)
      const buffer = new Float32Array(inputData.length)
      buffer.set(inputData)
      audioBufferRef.current.push(buffer)
    }
    
    // Connect nodes
    source.connect(processor)
    processor.connect(audioContext.destination)
    
    useWorkletRef.current = false
  }, [])
  
  // Start recording with AudioWorklet (with fallback)
  const startRecording = useCallback(async () => {
    if (isRecording || isProcessingRef.current) {
      console.log('Already recording or processing')
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
      onStatusChange?.('recording')
      isProcessingRef.current = true
      
      // Get user media with fallback options
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 48000,  // FIXED: Match AudioContext sample rate
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
        console.log('🔄 Closing previous AudioContext to create fresh one')
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
        sampleRate: 48000,  // Force 48kHz to match audio playback
        latencyHint: 'interactive'
      })
      audioContextInstanceRef.current++
      const currentInstance = audioContextInstanceRef.current
      
      // IMPORTANT: Ensure audio context is ready before processing
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
        console.log('🎧 Audio context resumed before recording')
      }
      
      // Try to use AudioWorklet first - always reload module for fresh context
      const hasAudioWorklet = 'audioWorklet' in audioContextRef.current
      if (hasAudioWorklet) {
        try {
          // Always reload the AudioWorklet module for fresh AudioContext
          await audioContextRef.current.audioWorklet.addModule('/worklets/voice-processor.js')
          workletLoadedRef.current = true
          console.log('📡 AudioWorklet loaded successfully for fresh context')
        } catch (error) {
          console.warn('⚠️ AudioWorklet failed to load:', error)
          workletLoadedRef.current = false
        }
      }
      
      if (hasAudioWorklet && workletLoadedRef.current) {
        // Use modern AudioWorklet
        const source = audioContextRef.current.createMediaStreamSource(stream)
        const workletNode = new AudioWorkletNode(audioContextRef.current, 'voice-processor')
        
        sourceNodeRef.current = source
        workletNodeRef.current = workletNode
        
        // Clear previous buffer
        audioBufferRef.current = []
        
        // Set up audio processing via worklet messages
        workletNode.port.onmessage = (event) => {
          if (event.data.type === 'audioData' && isProcessingRef.current) {
            // Check if this is still the current context instance
            if (audioContextInstanceRef.current === currentInstance) {
              audioBufferRef.current.push(new Float32Array(event.data.buffer))
            }
          }
        }
        
        // Activate the worklet
        workletNode.port.postMessage({ type: 'setActive', active: true })
        
        // Connect nodes (worklet doesn't need to connect to destination)
        source.connect(workletNode)
        
        useWorkletRef.current = true
        console.log('🎧 Recording started with AudioWorklet (fresh context)')
      } else {
        // Fallback to deprecated ScriptProcessor
        await startRecordingFallback(stream, audioContextRef.current)
        console.log('🎧 Recording started with ScriptProcessor (fallback)')
      }
      
      setIsRecording(true)
      
      // Small delay to ensure first buffer is captured
      await new Promise(resolve => setTimeout(resolve, 100))
      
    } catch (error) {
      console.error('Error starting recording:', error)
      onError?.(`Failed to start recording: ${error}`)
      onStatusChange?.('idle')
      isProcessingRef.current = false
      cleanup()
    }
  }, [isRecording, permissionStatus, requestPermission, onError, onStatusChange, startRecordingFallback])
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (!isRecording || !isProcessingRef.current) {
      console.log('Not recording')
      return
    }
    
    isProcessingRef.current = false
    setIsRecording(false)
    onStatusChange?.('processing')
    
    try {
      // Disconnect nodes based on what was used
      if (useWorkletRef.current && sourceNodeRef.current && workletNodeRef.current) {
        // Deactivate worklet first
        workletNodeRef.current.port.postMessage({ type: 'setActive', active: false })
        sourceNodeRef.current.disconnect()
        workletNodeRef.current.disconnect()
      } else if (sourceNodeRef.current && processorNodeRef.current) {
        // Fallback cleanup
        sourceNodeRef.current.disconnect()
        processorNodeRef.current.disconnect()
      }
      
      // Process audio
      if (audioBufferRef.current.length > 0) {
        const sampleRate = audioContextRef.current?.sampleRate || 48000
        
        // Combine all buffers
        const totalLength = audioBufferRef.current.reduce((acc, buf) => acc + buf.length, 0)
        const combined = new Float32Array(totalLength)
        let offset = 0
        
        for (const buffer of audioBufferRef.current) {
          combined.set(buffer, offset)
          offset += buffer.length
        }
        
        // Resample to 24kHz if needed (OpenAI expects 24kHz)
        const resampled = sampleRate === 24000 ? combined : resampleAudio(combined, sampleRate, 24000)
        console.log(`🎤 Voice resampled: ${sampleRate}Hz → 24kHz for OpenAI`)
        
        // Convert to PCM16
        const pcm16 = floatTo16BitPCM(resampled)
        
        // Convert to base64
        const base64 = int16ArrayToBase64(pcm16)
        
        console.log(`🎤 Processed ${resampled.length} samples → ${base64.length} base64 chars`)
        
        // Send the audio data
        onAudioData?.(base64)
      } else {
        console.warn('No audio data captured')
        onError?.('No audio data captured')
      }
      
    } catch (error) {
      console.error('Error processing audio:', error)
      onError?.(`Failed to process audio: ${error}`)
    } finally {
      cleanup()
      onStatusChange?.('idle')
      console.log('🎤 Recording stopped')
    }
  }, [isRecording, onAudioData, onError, onStatusChange])
  
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
    }
  }, [checkSupport, cleanup])
  
  return {
    isRecording,
    isSupported,
    permissionStatus,
    startRecording,
    stopRecording,
    requestPermission,
    cleanup
  }
}

export default useVoiceCapture
