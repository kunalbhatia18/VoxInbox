import { useState, useRef, useCallback, useEffect } from 'react'

// Audio conversion utilities
const convertToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Convert audio to PCM16 format for OpenAI Realtime API
const convertToPCM16 = async (audioBuffer: ArrayBuffer): Promise<string> => {
  // Create audio context with fallback sample rates
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
  
  let audioContext: AudioContext
  try {
    // Try 24kHz first (OpenAI preference)
    audioContext = new AudioContextClass({ sampleRate: 24000 })
  } catch {
    try {
      // Fallback to 44.1kHz
      audioContext = new AudioContextClass({ sampleRate: 44100 })
    } catch {
      // Use default sample rate
      audioContext = new AudioContextClass()
    }
  }
  
  try {
    // Decode the audio data
    const decodedData = await audioContext.decodeAudioData(audioBuffer.slice(0))
    
    // Get the first channel (mono)
    const channelData = decodedData.getChannelData(0)
    
    // Resample to 24kHz if necessary
    let resampledData = channelData
    if (audioContext.sampleRate !== 24000) {
      resampledData = resampleAudio(channelData, audioContext.sampleRate, 24000)
    }
    
    // Convert to 16-bit PCM
    const pcm16 = new Int16Array(resampledData.length)
    for (let i = 0; i < resampledData.length; i++) {
      // Convert from [-1, 1] float to 16-bit integer
      const sample = Math.max(-1, Math.min(1, resampledData[i]))
      pcm16[i] = sample * 0x7FFF
    }
    
    // Convert to base64
    return convertToBase64(pcm16.buffer)
  } catch (error) {
    console.error('Error converting audio to PCM16:', error)
    throw new Error(`Audio conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    audioContext.close()
  }
}

// Simple resampling function
const resampleAudio = (inputData: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array => {
  if (inputSampleRate === outputSampleRate) {
    return inputData
  }
  
  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.floor(inputData.length / ratio)
  const outputData = new Float32Array(outputLength)
  
  for (let i = 0; i < outputLength; i++) {
    const inputIndex = i * ratio
    const inputIndexFloor = Math.floor(inputIndex)
    const inputIndexCeil = Math.ceil(inputIndex)
    
    if (inputIndexCeil >= inputData.length) {
      outputData[i] = inputData[inputData.length - 1]
    } else {
      const fraction = inputIndex - inputIndexFloor
      outputData[i] = inputData[inputIndexFloor] * (1 - fraction) + inputData[inputIndexCeil] * fraction
    }
  }
  
  return outputData
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
  const [isSupported, setIsSupported] = useState(false) // Initialize as false, check on mount
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt'>('prompt')
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  
  // Check if browser supports required APIs
  const checkSupport = useCallback(() => {
    try {
      const supported = !!(navigator.mediaDevices && 
                          typeof navigator.mediaDevices.getUserMedia === 'function' && 
                          window.MediaRecorder &&
                          (window.AudioContext || (window as any).webkitAudioContext))
      setIsSupported(supported)
      return supported
    } catch (error) {
      console.warn('Browser API check failed:', error)
      setIsSupported(false)
      return false
    }
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
          sampleRate: 24000, // Preferred sample rate for OpenAI
          channelCount: 1,   // Mono audio
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      // Stop the stream immediately - we just wanted to check permission
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
    if (isRecording) return
    
    if (permissionStatus !== 'granted') {
      const granted = await requestPermission()
      if (!granted) return
    }
    
    try {
      onStatusChange?.('recording')
      
      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })
      
      streamRef.current = stream
      
      // Create MediaRecorder with fallback mimeTypes
      let mediaRecorder: MediaRecorder
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ]
      
      let supportedMimeType = ''
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          supportedMimeType = mimeType
          break
        }
      }
      
      if (supportedMimeType) {
        mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType })
      } else {
        // Fallback to default
        mediaRecorder = new MediaRecorder(stream)
      }
      
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      
      // Handle audio data
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      // Handle recording stop
      mediaRecorder.onstop = async () => {
        onStatusChange?.('processing')
        
        try {
          // Combine all audio chunks
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          
          // Convert to ArrayBuffer
          const arrayBuffer = await audioBlob.arrayBuffer()
          
          // Convert to PCM16 format for OpenAI
          const pcm16Base64 = await convertToPCM16(arrayBuffer)
          
          // Send to callback
          onAudioData?.(pcm16Base64)
          
        } catch (error) {
          console.error('Error processing audio:', error)
          onError?.('Error processing audio')
        } finally {
          onStatusChange?.('idle')
        }
      }
      
      // Start recording
      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)
      
      console.log('🎤 Voice recording started')
      
    } catch (error) {
      console.error('Error starting recording:', error)
      onError?.('Error starting recording')
      onStatusChange?.('idle')
    }
  }, [isRecording, permissionStatus, requestPermission, onAudioData, onError, onStatusChange])
  
  // Stop recording
  const stopRecording = useCallback(() => {
    if (!isRecording) return
    
    try {
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      
      // Stop media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      
      setIsRecording(false)
      console.log('🎤 Voice recording stopped')
      
    } catch (error) {
      console.error('Error stopping recording:', error)
      onError?.('Error stopping recording')
    }
  }, [isRecording, onError])
  
  // Cleanup function
  const cleanup = useCallback(() => {
    stopRecording()
    mediaRecorderRef.current = null
    audioChunksRef.current = []
  }, [stopRecording])
  
  // Initialize support check on mount
  useEffect(() => {
    checkSupport()
  }, [checkSupport])
  
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
