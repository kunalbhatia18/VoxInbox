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
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null)
  const audioBufferRef = useRef<Float32Array[]>([])
  const isProcessingRef = useRef(false)
  
  // Check browser support
  const checkSupport = useCallback(() => {
    const supported = !!(
      navigator.mediaDevices?.getUserMedia && 
      (window.AudioContext || (window as any).webkitAudioContext)
    )
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
      onError?.('Microphone permission denied')
      return false
    }
  }, [checkSupport, onError])
  
  // Start recording
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
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      
      sourceNodeRef.current = source
      processorNodeRef.current = processor
      
      // Clear previous buffer
      audioBufferRef.current = []
      
      // Set up audio processing
      processor.onaudioprocess = (e) => {
        if (!isProcessingRef.current) return
        
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
      
      setIsRecording(true)
      console.log('🎤 Recording started')
      
    } catch (error) {
      console.error('Error starting recording:', error)
      onError?.(`Failed to start recording: ${error}`)
      onStatusChange?.('idle')
      isProcessingRef.current = false
      cleanup()
    }
  }, [isRecording, permissionStatus, requestPermission, onError, onStatusChange])
  
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
      // Disconnect nodes
      if (sourceNodeRef.current && processorNodeRef.current) {
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
        
        // Resample to 24kHz if needed
        const resampled = resampleAudio(combined, sampleRate, 24000)
        
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
