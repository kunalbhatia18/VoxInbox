import { useEffect, useRef, useState } from 'react'

export function useVoiceRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Check if browser supports voice recording
    setIsSupported(!!navigator.mediaDevices?.getUserMedia)
  }, [])

  const startRecording = async (websocket: WebSocket) => {
    if (!isSupported || isRecording) return false

    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      })
      
      streamRef.current = stream
      wsRef.current = websocket

      // Create MediaRecorder for PCM16 audio
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })
      
      mediaRecorderRef.current = mediaRecorder

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && websocket.readyState === WebSocket.OPEN) {
          // Convert to base64 and send to backend
          const reader = new FileReader()
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1]
            websocket.send(JSON.stringify({
              type: 'audio',
              audio: base64
            }))
          }
          reader.readAsDataURL(event.data)
        }
      }

      mediaRecorder.start(100) // Send audio chunks every 100ms
      setIsRecording(true)
      console.log('🎤 Voice recording started')
      return true

    } catch (error) {
      console.error('❌ Failed to start recording:', error)
      return false
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('⏹️ Voice recording stopped')
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }

  return {
    isRecording,
    isSupported,
    startRecording,
    stopRecording
  }
}
