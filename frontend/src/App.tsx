import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { GmailTest } from './components/GmailTest'
import { ConnectionTest } from './components/ConnectionTest'
import { useVoiceCapture } from './hooks/useVoiceCapture'
import { useContinuousVoiceCapture } from './hooks/useContinuousVoiceCapture'
import { useAudioPlayback } from './hooks/useAudioPlayback'

// Extend Window interface for global WebSocket reference
declare global {
  interface Window {
    wsRef: WebSocket | null
  }
}

type VoiceMode = 'manual' | 'hands-free'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showTests, setShowTests] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [authCheckInProgress, setAuthCheckInProgress] = useState(false)
  const [isAISpeaking, setIsAISpeaking] = useState(false)
  const [isProcessingRequest, setIsProcessingRequest] = useState(false) // Prevent concurrent requests
  const lastRequestTimeRef = useRef<number>(0) // Debounce requests
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('hands-free')
  const [useWakeWord, setUseWakeWord] = useState(false) // Default to false since wake word doesn't work on HTTP
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing' | 'active'>('idle')
  const wsRef = useRef<WebSocket | null>(null)
  const connectionInitiated = useRef(false)
  const awaitingAudioRef = useRef(false)
  const responseTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sessionReadyRef = useRef(false)
  // Performance timing for latency measurement
  const requestStartTimeRef = useRef<number>(0)
  // Issue 4 Fix: Connection state management
  const connectionStateRef = useRef<'idle' | 'connecting' | 'connected' | 'failed'>('idle')
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const maxReconnectAttempts = useRef(3)
  const reconnectAttempts = useRef(0)

  // Manual voice capture hook (push-to-talk)
  const manualVoiceCapture = useVoiceCapture({
    onAudioData: (audioBase64: string) => {
      // CRITICAL FIX: Prevent empty audio buffers completely
      if (!audioBase64 || audioBase64.length < 2000) {  // Increased minimum size
        console.warn('⚠️ Audio buffer too small, skipping send:', audioBase64.length)
        toast.error('Please speak longer - audio too short')
        return
      }
      
      // ADDITIONAL SAFETY: Prevent concurrent requests AND empty buffers
      if (isProcessingRequest) {
        console.warn('⚠️ Request already in progress, ignoring new audio')
        toast.error('Still processing - please wait for response')
        return
      }
      
      // ADDITIONAL SAFETY: Debounce rapid requests (prevent <2s intervals)
      const now = Date.now()
      if (now - lastRequestTimeRef.current < 2000) {  // Increased to 2 seconds
        console.warn('⚠️ Request too soon after previous, ignoring (debounce)')
        toast.error('Please wait a moment between requests')
        return
      }
      lastRequestTimeRef.current = now
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setIsProcessingRequest(true) // Block new requests immediately
        toast('🔄 Processing your voice command...', { icon: '⚙️', duration: 2000 })
        
        const audioMessage = {
          type: "input_audio_buffer.append",
          audio: audioBase64
        }
        wsRef.current.send(JSON.stringify(audioMessage))
        console.log('🎤 Sent audio data to OpenAI', audioBase64.length, 'characters')
        
        const commitMessage = {
          type: "input_audio_buffer.commit"
        }
        wsRef.current.send(JSON.stringify(commitMessage))
        console.log('📱 Committed audio buffer to OpenAI')
        
        // Start performance timing for latency measurement
        requestStartTimeRef.current = performance.now()
        console.log('⏱️ Started latency timer - blocking new requests until complete')
        
        // CRITICAL FIX: Don't create response from frontend - let backend handle it
        // The backend will automatically create response after receiving committed audio
        console.log('✅ Audio committed - backend will handle response creation')
      } else {
        console.warn('WebSocket not connected, cannot send audio')
        toast.error('Connection lost - cannot send voice data')
      }
    },
    onError: (error: string) => {
      console.error('Voice capture error:', error)
      toast.error(`Voice error: ${error}`)
      setIsRecording(false)
    },
    onStatusChange: (status) => {
      console.log('Voice status:', status)
      if (status === 'recording') {
        setIsRecording(true)
        toast('🎤 Recording voice...', { icon: '🎤' })
      } else if (status === 'processing') {
        setIsRecording(false)
        toast('🔄 Processing audio...', { icon: '⚙️' })
      } else {
        setIsRecording(false)
      }
    }
  })

  // Continuous voice capture hook (hands-free)
  const continuousVoiceCapture = useContinuousVoiceCapture({
    wsRef,
    enableWakeWord: useWakeWord,
    wakePhrase: "hey voiceinbox",
    chunkDurationMs: 100,
    isAISpeaking, // Pass AI speaking state to prevent interruptions
    onError: (error: string) => {
      console.error('Voice capture error:', error)
      if (!error.includes('Wake word detection')) {
        toast.error(`Voice error: ${error}`)
      }
    },
    onStatusChange: (status) => {
      console.log('Voice status:', status)
      setVoiceStatus(status)
      
      if (status === 'active') {
        toast('🎤 Listening for your command...', { icon: '👂', duration: 2000 })
      } else if (status === 'listening' && useWakeWord) {
        toast('💡 Wake word not working? Use "Activate Now" button', { icon: '💡', duration: 3000 })
      }
    }
  })

  // Audio playback hook with stable callbacks
  const audioPlayback = useMemo(() => ({
    onPlaybackStart: () => {
      console.log('🔊 AI started speaking')
      setIsAISpeaking(true)
      // Don't show toast for every audio start - it might interrupt
    },
    onPlaybackEnd: () => {
      console.log('🔊 AI finished speaking')
      setIsAISpeaking(false)
      
      // CRITICAL FIX: Reset processing state when audio ends (full cycle complete)
      setIsProcessingRequest(false)
      console.log('✓ Full response cycle complete - ready for new requests')
      
      // Simple toast without dismissing all
      toast.success('Response complete', { icon: '✓', duration: 1500 })
    },
    onError: (error: string) => {
      console.error('Audio playback error:', error)
      toast.error(`Audio error: ${error}`)
      setIsAISpeaking(false)
    }
  }), [])

  const audioPlaybackHook = useAudioPlayback(audioPlayback)

  // Debug: Audio test function
  const testAudioOutput = useCallback(async () => {
    try {
      // Create a simple test tone
      const audioContext = new AudioContext()
      const duration = 0.3
      const frequency = 440 // A4 note
      
      const buffer = audioContext.createBuffer(1, audioContext.sampleRate * duration, audioContext.sampleRate)
      const data = buffer.getChannelData(0)
      
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.sin(2 * Math.PI * frequency * i / audioContext.sampleRate) * 0.1
      }
      
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(audioContext.destination)
      source.start()
      
      console.log('🎵 Test audio played - if you heard a beep, audio output is working')
      toast.success('Audio test played - did you hear a beep?', { duration: 3000 })
      
      // Clean up
      setTimeout(() => audioContext.close(), 1000)
    } catch (error) {
      console.error('Audio test failed:', error)
      toast.error('Audio test failed - check console')
    }
  }, [])

  // Update recording state when manual voice capture changes
  useEffect(() => {
    if (voiceMode === 'manual') {
      setIsRecording(manualVoiceCapture.isRecording)
    }
  }, [manualVoiceCapture.isRecording, voiceMode])

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔧 App useEffect running - initializing...')
    }
    
    window.wsRef = null
    checkAuth()

    return () => {
      if (import.meta.env.DEV) {
        console.log('🧹 App useEffect cleanup running...')
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        window.wsRef = null
      }
      
      if (responseTimeoutRef.current) {
        clearTimeout(responseTimeoutRef.current)
        responseTimeoutRef.current = null
      }
      
      // Issue 4 & 7 Fix: Cleanup reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      // Stop any active voice capture
      if (voiceMode === 'hands-free' && continuousVoiceCapture.isListening) {
        continuousVoiceCapture.stopListening()
      }
    }
  }, [])

  const checkAuth = async () => {
    if (authCheckInProgress) {
      console.log('Auth check already in progress, skipping...')
      return
    }
    
    setAuthCheckInProgress(true)
    
    try {
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
      const response = await fetch(`${apiBaseUrl}/api/auth/status`, {
        credentials: 'include',
      })
      const data = await response.json()
      setIsAuthenticated(data.authenticated)
      if (data.email) setUserEmail(data.email)

      if (data.authenticated && !connectionInitiated.current) {
        connectionInitiated.current = true
        const sessionId = document.cookie
          .split('; ')
          .find((row) => row.startsWith('session_id='))
          ?.split('=')[1]
        if (sessionId) {
          setTimeout(() => connectWebSocket(sessionId), 1000)
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      toast.error('Authentication check failed')
    } finally {
      setLoading(false)
      setAuthCheckInProgress(false)
    }
  }

  // Issue 4 Fix: Robust WebSocket connection with proper race condition handling
  const connectWebSocket = (sessionId: string, isRetry: boolean = false) => {
    // Prevent multiple simultaneous connections
    if (connectionStateRef.current === 'connecting') {
      console.log('⏳ Connection already in progress, ignoring duplicate request')
      return
    }

    if (connectionStateRef.current === 'connected' && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('✅ WebSocket already connected and healthy')
      setWsConnected(true)
      return
    }

    // Clean up any existing connection
    if (wsRef.current) {
      console.log('🧹 Cleaning up existing WebSocket connection')
      wsRef.current.close(1000, 'Creating new connection')
      wsRef.current = null
      window.wsRef = null
    }

    // Clear any pending reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    connectionStateRef.current = 'connecting'
    setIsConnecting(true)
    setWsConnected(false)
    sessionReadyRef.current = false
    
    if (import.meta.env.DEV) {
      console.log('Creating new WebSocket connection with session:', sessionId)
    }
    
    try {
      // Use environment variables for WebSocket URL
      const wsBaseUrl = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000'
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionId}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully')
        connectionStateRef.current = 'connected'
        reconnectAttempts.current = 0 // Reset reconnect attempts on successful connection
        setIsConnecting(false)
        setWsConnected(true)
        window.wsRef = ws
        
        // CRITICAL: Set session ID in audio playback to prevent cross-contamination
        audioPlaybackHook.setCurrentSession(sessionId)
        console.log(`🔒 Audio session locked to: ${sessionId}`)
        
        if (!isRetry) {
          toast.success('Connected to Gmail service')
        } else {
          toast.success('Reconnected to Gmail service')
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const messageType = message.type
          
          if (import.meta.env.DEV && ['response.created', 'response.done', 'response.audio.done', 'system', 'error'].includes(messageType)) {
            console.log('WebSocket message:', message)
          }
          
          // Mark session as ready when we get the confirmation
          if (messageType === 'system' && message.message?.includes('OpenAI session ready')) {
            sessionReadyRef.current = true
            console.log('✅ OpenAI session is ready')
            // Don't show toast for session ready message
            return
          }
          
          if (messageType === 'response.created') {
            if (import.meta.env.DEV) {
              console.log('🚀 OpenAI response started')
            }
            // Only clear queue if there's existing audio to prevent overlap
            if (isAISpeaking) {
              audioPlaybackHook.stopPlayback()
            }
            audioPlaybackHook.clearQueue()
            awaitingAudioRef.current = true
            
            if (responseTimeoutRef.current) {
              clearTimeout(responseTimeoutRef.current)
            }
            // REDUCED TIMEOUT: Faster recovery from stuck states
            responseTimeoutRef.current = setTimeout(() => {
              if (awaitingAudioRef.current && !isAISpeaking) {
                console.log('⚠️ No audio received from OpenAI within 3 seconds - resetting state')
                awaitingAudioRef.current = false
                requestStartTimeRef.current = 0 // Reset timing
                
                // CRITICAL FIX: Reset processing state on timeout
                setIsProcessingRequest(false)
                console.log('⏰ Timeout occurred - reset processing state for retry')
                
                toast('Request timed out. You can try speaking again.', { icon: '⏰', duration: 3000 })
              }
            }, 3000) // 3 second timeout for faster recovery
            
          } else if (messageType === 'response.audio.delta') {
            if (message.delta) {
              if (awaitingAudioRef.current) {
                awaitingAudioRef.current = false
                if (responseTimeoutRef.current) {
                  clearTimeout(responseTimeoutRef.current)
                  responseTimeoutRef.current = null
                }
                
                // Measure total latency from request to first audio
                if (requestStartTimeRef.current > 0) {
                  const totalLatency = performance.now() - requestStartTimeRef.current
                  console.log(`⚡ TOTAL RESPONSE LATENCY: ${Math.round(totalLatency)}ms (target: <250ms)`)
                  if (totalLatency > 250) {
                    console.warn(`⚠️ Latency above target! ${Math.round(totalLatency)}ms > 250ms`)
                  } else {
                    console.log(`✅ Excellent latency! ${Math.round(totalLatency)}ms < 250ms`)
                  }
                  requestStartTimeRef.current = 0 // Reset timer
                }
              }
              audioPlaybackHook.addAudioChunk(message.delta)
            }
            
          } else if (messageType === 'response.audio.done') {
            if (import.meta.env.DEV) {
              console.log('🎧 Audio response complete')
            }
            audioPlaybackHook.markStreamDone()
            
          } else if (messageType === 'response.done') {
            if (import.meta.env.DEV) {
              console.log('✅ OpenAI response complete')
            }
            
            if (responseTimeoutRef.current) {
              clearTimeout(responseTimeoutRef.current)
              responseTimeoutRef.current = null
            }
            awaitingAudioRef.current = false
            
            // CRITICAL FIX: Reset processing state to allow new requests
            setIsProcessingRequest(false)
            console.log('✅ Request processing complete - ready for new requests')
            
            // Log the full response for debugging
            if (message.response && import.meta.env.DEV) {
              console.log('Full response:', message.response)
            }
            
          } else if (messageType === 'system') {
            toast(message.message, { icon: 'ℹ️' })
            
          } else if (messageType === 'error' && !message.function) {
            console.error('❌ OpenAI Error:', message.error)
            toast.error(`OpenAI Error: ${message.error?.message || 'Unknown error'}`)
            
            // CRITICAL FIX: Reset processing state on errors
            setIsProcessingRequest(false)
            console.log('❌ Error occurred - reset processing state for retry')
            
            // EMERGENCY RESET: Handle timeout errors
            if (message.emergency_reset) {
              console.log('❗ Emergency timeout reset - clearing all states')
              setIsAISpeaking(false)
              awaitingAudioRef.current = false
              if (responseTimeoutRef.current) {
                clearTimeout(responseTimeoutRef.current)
                responseTimeoutRef.current = null
              }
              requestStartTimeRef.current = 0
              toast.error('Response timed out. Please try again.', { duration: 4000 })
            }
          }
          
          if (messageType === 'function_result') {
            console.log('Function result:', message.function, message.result)
          }
        } catch (e) {
          console.error('Invalid WebSocket message', e)
        }
      }

      // Issue 7 Fix: Enhanced onclose with automatic reconnection
      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason)
        
        if (wsRef.current === ws) {
          connectionStateRef.current = 'idle'
          setWsConnected(false)
          setIsConnecting(false)
          wsRef.current = null
          window.wsRef = null
          sessionReadyRef.current = false
          
          // Stop hands-free listening when disconnected
          if (voiceMode === 'hands-free' && continuousVoiceCapture.isListening) {
            continuousVoiceCapture.stopListening()
          }
        }
        
        // Handle different disconnection scenarios
        if (event.code === 4001) {
          toast.error('Invalid session - please login again')
          connectionStateRef.current = 'failed'
        } else if (event.code === 4002) {
          console.log('Another connection was already active')
        } else if (event.code !== 1000 && event.code !== 1001) {
          // Unexpected disconnection - attempt reconnection
          if (reconnectAttempts.current < maxReconnectAttempts.current) {
            reconnectAttempts.current++
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current - 1), 10000) // Exponential backoff
            
            console.log(`🔄 Attempting reconnection ${reconnectAttempts.current}/${maxReconnectAttempts.current} in ${delay}ms`)
            toast(`Connection lost. Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts.current})`, { icon: '🔄', duration: 3000 })
            
            reconnectTimeoutRef.current = setTimeout(() => {
              const sessionId = document.cookie
                .split('; ')
                .find((row) => row.startsWith('session_id='))
                ?.split('=')[1]
              
              if (sessionId) {
                connectWebSocket(sessionId, true)
              }
            }, delay)
          } else {
            toast.error('Connection failed after multiple attempts. Please reload the page.')
            connectionStateRef.current = 'failed'
          }
        }
      }

      // Issue 7 Fix: Enhanced onerror with recovery
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error)
        connectionStateRef.current = 'failed'
        setWsConnected(false)
        setIsConnecting(false)
        
        if (wsRef.current === ws) {
          wsRef.current = null
          window.wsRef = null
          sessionReadyRef.current = false
        }
        
        // Don't show error toast if we're going to try reconnecting
        if (reconnectAttempts.current >= maxReconnectAttempts.current) {
          toast.error('Failed to connect to Gmail service')
        }
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setIsConnecting(false)
      setWsConnected(false)
      toast.error('Failed to create WebSocket connection')
    }
  }

  const handleLogin = () => {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
    window.location.href = `${apiBaseUrl}/api/login`
  }

  const handleLogout = async () => {
    try {
      connectionInitiated.current = false
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        window.wsRef = null
      }
      setWsConnected(false)
      setIsConnecting(false)
      
      // Stop any active voice capture
      if (voiceMode === 'hands-free' && continuousVoiceCapture.isListening) {
        continuousVoiceCapture.stopListening()
      }
      
      const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || ''
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      })
      window.location.reload()
    } catch (error) {
      console.error('Logout failed:', error)
      toast.error('Logout failed')
    }
  }

  const forceReconnect = () => {
    if (isConnecting) {
      console.log('Already connecting, please wait...')
      toast('Connection attempt already in progress', { icon: '⏳' })
      return
    }

    console.log('Force reconnecting WebSocket...')
    connectionInitiated.current = false
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
      window.wsRef = null
    }
    setWsConnected(false)
    setIsConnecting(false)
    
    const sessionId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('session_id='))
      ?.split('=')[1]
    
    if (sessionId) {
      connectionInitiated.current = true
      toast('Reconnecting to Gmail service...', { icon: '🔄' })
      setTimeout(() => connectWebSocket(sessionId), 500)
    } else {
      toast.error('No session found - please login again')
    }
  }

  // Manual voice recording handlers
  const handleStartRecording = async () => {
    if (!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Please connect to Gmail service first')
      return
    }
    
    // Wait for session to be ready
    if (!sessionReadyRef.current) {
      toast('Waiting for session...', { icon: '⏳' })
      // Wait up to 2 seconds for session
      let waited = 0
      while (!sessionReadyRef.current && waited < 2000) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waited += 100
      }
      if (!sessionReadyRef.current) {
        toast.error('Session not ready, please try again')
        return
      }
    }
    
    // CRITICAL FIX: Block recording when AI is speaking OR when processing request
    if (isAISpeaking) {
      console.log('AI is speaking, cannot start recording')
      toast('Please wait for AI to finish speaking', { icon: '⏳', duration: 2000 })
      return
    }
    
    if (isProcessingRequest) {
      console.log('Still processing previous request, please wait')
      toast('Still processing - please wait for response', { icon: '⚙️', duration: 2000 })
      return
    }
    
    if (isRecording || manualVoiceCapture.isRecording) {
      console.log('Already recording, ignoring start request')
      return
    }
    
    if (!manualVoiceCapture.isSupported) {
      toast.error('Microphone not supported in this browser')
      return
    }
    
    // Don't stop playback here - let it finish naturally
    // audioPlaybackHook.stopPlayback()
    
    try {
      if (!audioPlaybackHook.isSupported) {
        console.log('🔊 Initializing audio playback on user gesture...')
      }
    } catch (error) {
      console.warn('Audio playback initialization warning:', error)
    }
    
    if (manualVoiceCapture.permissionStatus === 'prompt') {
      const granted = await manualVoiceCapture.requestPermission()
      if (!granted) {
        toast.error('Microphone permission required for voice commands')
        return
      }
    }
    
    if (manualVoiceCapture.permissionStatus === 'denied') {
      toast.error('Microphone permission denied')
      return
    }
    
    await manualVoiceCapture.startRecording()
  }

  const handleStopRecording = () => {
    if (!isRecording && !manualVoiceCapture.isRecording) {
      console.log('Not recording, ignoring stop request')
      return
    }
    
    manualVoiceCapture.stopRecording()
  }

  // Hands-free voice handlers
  const handleToggleHandsFree = async () => {
    if (!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Please connect to Gmail service first')
      return
    }
    
    if (!continuousVoiceCapture.isSupported) {
      toast.error('Microphone not supported in this browser')
      return
    }
    
    if (continuousVoiceCapture.permissionStatus === 'prompt') {
      const granted = await continuousVoiceCapture.requestPermission()
      if (!granted) {
        toast.error('Microphone permission required for voice commands')
        return
      }
    }
    
    if (continuousVoiceCapture.permissionStatus === 'denied') {
      toast.error('Microphone permission denied')
      return
    }
    
    if (continuousVoiceCapture.isListening) {
      continuousVoiceCapture.stopListening()
      toast('🔇 Voice capture stopped', { icon: '🛑', duration: 2000 })
    } else {
      await continuousVoiceCapture.startListening()
      if (!useWakeWord) {
        toast('🎤 Voice capture active - speak naturally', { icon: '🎤', duration: 3000 })
      }
    }
  }

  // Switch voice mode
  const handleSwitchMode = (newMode: VoiceMode) => {
    if (newMode === voiceMode) return
    
    // Stop current mode
    if (voiceMode === 'hands-free' && continuousVoiceCapture.isListening) {
      continuousVoiceCapture.stopListening()
    }
    
    setVoiceMode(newMode)
    toast(`Switched to ${newMode} mode`, { icon: '🔄', duration: 2000 })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 font-['Inter',system-ui,sans-serif]">
        <div className="text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 font-['Inter',system-ui,sans-serif]">
        <div className="text-center max-w-sm mx-auto px-6">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-400 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <svg className="w-8 h-8 text-white" fill="white" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-medium text-white mb-4">VoiceInbox</h1>
          <p className="text-gray-400 mb-8 leading-relaxed">
            Process your inbox with just your voice
          </p>
          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex flex-col font-['Inter',system-ui,sans-serif] text-white">
        {/* Minimal Header */}
        <header className="bg-black/20 backdrop-blur-xl border-b border-white/10">
          <div className="w-full max-w-sm mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="white" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </div>
              <h1 className="text-lg font-medium text-white">VoiceInbox</h1>
            </div>
            
            <div className="flex items-center space-x-2">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isConnecting 
                  ? 'bg-yellow-400 animate-pulse'
                  : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) 
                    ? 'bg-green-400' 
                    : 'bg-red-400'
              }`}></div>
              <button
                onClick={() => setShowTests(!showTests)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {(!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && !isConnecting && (
                <button
                  onClick={forceReconnect}
                  className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 bg-blue-500/20 rounded-lg transition-colors"
                >
                  Reconnect
                </button>
              )}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-400 hover:text-gray-300 px-2 py-1 bg-white/5 rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main Interface */}
        <main className="flex-1 flex flex-col w-full max-w-sm mx-auto px-6">
          {showTests ? (
            <div className="space-y-6 mt-8">
              <ConnectionTest />
              <GmailTest 
                ws={wsRef.current} 
                isConnected={!!(wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN)} 
              />
            </div>
          ) : (
            <>
              {/* Central Microphone Area */}
              <div className="flex flex-col justify-center items-center py-8 min-h-[400px]">
                
                {/* Main Mic Button */}
                <div className="relative mb-6">
                  {voiceMode === 'manual' ? (
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleStartRecording()
                      }}
                      onMouseUp={(e) => {
                        e.preventDefault()
                        handleStopRecording()
                      }}
                      onMouseLeave={(e) => {
                        e.preventDefault()
                        if (isRecording || manualVoiceCapture.isRecording) {
                          handleStopRecording()
                        }
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        handleStartRecording()
                      }}
                      onTouchEnd={(e) => {
                        e.preventDefault()
                        handleStopRecording()
                      }}
                      disabled={!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !manualVoiceCapture.isSupported || isAISpeaking || isProcessingRequest}
                      className={`w-28 h-28 rounded-full font-medium transition-all duration-300 shadow-2xl active:scale-95 relative overflow-hidden ${
                        isRecording
                          ? 'bg-gradient-to-r from-red-500 to-red-600 scale-110 shadow-red-500/50'
                          : isProcessingRequest
                          ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/50'
                          : isAISpeaking
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 shadow-purple-500/50'
                          : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && manualVoiceCapture.isSupported)
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 shadow-blue-500/50'
                          : 'bg-gradient-to-r from-gray-600 to-gray-700 cursor-not-allowed shadow-gray-600/30'
                      }`}
                    >
                      {/* Pulse animation for recording */}
                      {isRecording && (
                        <div className="absolute inset-0 rounded-full bg-white/20 animate-ping"></div>
                      )}
                      
                      {isAISpeaking ? (
                        <svg className="w-12 h-12 mx-auto relative z-10" fill="white" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3z"/>
                          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                      ) : (
                        <svg className="w-12 h-12 mx-auto relative z-10" fill="white" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleToggleHandsFree}
                      disabled={!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !continuousVoiceCapture.isSupported}
                      className={`w-28 h-28 rounded-full font-medium transition-all duration-300 shadow-2xl active:scale-95 relative overflow-hidden ${
                        continuousVoiceCapture.isListening
                          ? 'bg-gradient-to-r from-red-500 to-red-600 shadow-red-500/50'
                          : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && continuousVoiceCapture.isSupported)
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 shadow-blue-500/50'
                          : 'bg-gradient-to-r from-gray-600 to-gray-700 cursor-not-allowed shadow-gray-600/30'
                      }`}
                    >
                      {/* Voice visualizer for hands-free */}
                      {continuousVoiceCapture.isListening && (
                        <div className="absolute inset-2 rounded-full border border-white/30 animate-pulse"></div>
                      )}
                      
                      {continuousVoiceCapture.isListening ? (
                        <svg className="w-12 h-12 mx-auto relative z-10" fill="white" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                          <circle cx="12" cy="12" r="8" fill="none" stroke="white" strokeWidth="1" opacity="0.5"/>
                        </svg>
                      ) : (
                        <svg className="w-12 h-12 mx-auto relative z-10" fill="white" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                      )}
                    </button>
                  )}
                </div>

                {/* Status Text */}
                <div className="text-center mb-4">
                  <h2 className="text-xl font-medium text-white mb-1">
                    {isConnecting 
                      ? 'Connecting...' 
                      : isProcessingRequest
                      ? 'Processing...'
                      : isAISpeaking
                      ? 'Speaking...'
                      : isRecording || (voiceMode === 'hands-free' && continuousVoiceCapture.isListening)
                      ? 'Listening...'
                      : 'Ready'
                    }
                  </h2>
                  
                  <p className="text-gray-400 text-sm">
                    {isConnecting 
                      ? 'Connecting to Gmail...'
                      : isProcessingRequest
                      ? 'Processing your request'
                      : isAISpeaking
                      ? 'Generating response'
                      : voiceMode === 'manual'
                        ? isRecording
                          ? 'Release to send'
                          : 'Hold to speak'
                        : continuousVoiceCapture.isListening
                          ? 'Say something'
                          : 'Tap to activate'
                    }
                  </p>
                </div>

                {/* Mode Toggle */}
                <div className="bg-white/5 backdrop-blur-sm rounded-full p-1 border border-white/10">
                  <div className="flex">
                    <button
                      onClick={() => handleSwitchMode('hands-free')}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        voiceMode === 'hands-free'
                          ? 'bg-white/20 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Hands-Free
                    </button>
                    <button
                      onClick={() => handleSwitchMode('manual')}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                        voiceMode === 'manual'
                          ? 'bg-white/20 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Push to Talk
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="pb-8 mt-8">
                {/* Secondary Controls for Hands-Free */}
                {voiceMode === 'hands-free' && continuousVoiceCapture.isListening && (
                  <div className="flex justify-center space-x-3 mb-6">
                    <button
                      onClick={continuousVoiceCapture.toggleMute}
                      className={`px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs font-medium border border-white/20 hover:bg-white/20 transition-all ${
                        continuousVoiceCapture.isMuted
                          ? 'text-red-400'
                          : 'text-gray-300'
                      }`}
                    >
                      {continuousVoiceCapture.isMuted ? 'Unmute' : 'Mute'}
                    </button>
                    
                    {useWakeWord && voiceStatus === 'listening' && (
                      <button
                        onClick={continuousVoiceCapture.activateManually}
                        className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium hover:bg-green-500/30 transition-all border border-green-500/30"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                )}

                {/* Quick Suggestions */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 text-center mb-3">
                    Try saying
                  </p>
                  {['"How many unread emails?"', '"Show important emails"', '"Search invoices"'].map((suggestion, index) => (
                    <button
                      key={index}
                      className="w-full p-2.5 bg-white/5 backdrop-blur-sm rounded-lg text-xs text-gray-300 hover:bg-white/10 hover:text-white transition-all border border-white/10"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            backdropFilter: 'blur(10px)',
          },
        }}
      />
    </>
  )
}

export default App