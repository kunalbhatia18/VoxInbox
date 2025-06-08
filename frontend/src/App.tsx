import { useEffect, useState, useRef, useMemo } from 'react'
// import { BrowserRouter as Router, Route, Redirect } from "react-router-dom";
// Removed notifications - they were annoying
import { GmailTest } from './components/GmailTest'
import { useVoiceCapture } from './hooks/useVoiceCapture'
import { useContinuousVoiceCapture } from './hooks/useContinuousVoiceCapture'
import { useAudioPlayback } from './hooks/useAudioPlayback'
import toast from 'react-hot-toast'

// Extend Window interface for global WebSocket reference
declare global {
  interface Window {
    wsRef: WebSocket | null
  }
}

type VoiceMode = 'manual' | 'hands-free'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
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
  const [useWakeWord] = useState(false) // Default to false since wake word doesn't work on HTTP
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

  /* ------------------------------------------------------------------ */
  /*  1. NEW: extract token from hash on OAuth redirect                 */
  /* ------------------------------------------------------------------ */
  // Extract token from URL fragment after OAuth redirect
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('token=')) {
      const token = hash.split('token=')[1]
      if (token) {
        localStorage.setItem('session_token', token)
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname)
        // Trigger auth check
        checkAuth()
      }
    }
  }, [])

  // Manual voice capture hook (push-to-talk)
  const manualVoiceCapture = useVoiceCapture({
    onAudioData: (audioBase64: string) => {
      // CRITICAL FIX: Prevent empty audio buffers completely
      if (!audioBase64 || audioBase64.length < 800) {  // Increased minimum size
        console.warn('⚠️ Audio buffer too small, skipping send:', audioBase64.length)
        return
      }

      // ADDITIONAL SAFETY: Debounce rapid requests (prevent <300 ms intervals)
      const now = Date.now()
      if (now - lastRequestTimeRef.current < 300) {
        console.warn('⚠️ Request too soon (300 ms debounce)')
        return
      }
      lastRequestTimeRef.current = now

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setIsProcessingRequest(true) // Block new requests immediately

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
        console.log(`🚀 FAST SEND: ${audioBase64.length} chars`)

        // The backend will automatically create response after receiving committed audio
        console.log('✅ Audio committed - backend will handle response creation')
      } else {
        console.warn('WebSocket not connected, cannot send audio')
      }
    },
    onError: (error: string) => {
      console.error('Voice capture error:', error)
      setIsRecording(false)
    },
    onStatusChange: (status) => {
      console.log('Voice status:', status)
      if (status === 'recording') {
        setIsRecording(true)
      } else if (status === 'processing') {
        setIsRecording(false)
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
    },
    onStatusChange: (status) => {
      console.log('Voice status:', status)
    }
  })

  // Audio playback hook with stable callbacks
  const audioPlayback = useMemo(() => ({
    onPlaybackStart: () => {
      console.log('🔊 AI started speaking')
      setIsAISpeaking(true)
    },
    onPlaybackEnd: () => {
      console.log('🔊 AI finished speaking')
      setIsAISpeaking(false)

      // CRITICAL FIX: Reset processing state when audio ends
      setIsProcessingRequest(false)
      console.log('✓ Full response cycle complete - ready for new requests')
    },
    onError: (error: string) => {
      console.error('Audio playback error:', error)
      setIsAISpeaking(false)
    }
  }), [])

  const audioPlaybackHook = useAudioPlayback(audioPlayback)

  // Update recording state when manual voice capture changes
  useEffect(() => {
    if (voiceMode === 'manual') {
      setIsRecording(manualVoiceCapture.isRecording)
    }
  }, [manualVoiceCapture.isRecording, voiceMode])

  /* ------------------------------------------------------------------ */
  /*  standard mount/unmount logic                                      */
  /* ------------------------------------------------------------------ */
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

  // Smart URL detection - works for both localhost and production
  const getApiBaseUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'http://localhost:8000'
    }
    return 'https://voxinbox-backend-631500803172.us-central1.run.app'
  }

  const getWsBaseUrl = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return 'ws://localhost:8000'
    }
    return 'wss://voxinbox-backend-631500803172.us-central1.run.app'
  }

  /* ------------------------------------------------------------------ */
  /*  2. REPLACED checkAuth                                             */
  /* ------------------------------------------------------------------ */
  const checkAuth = async () => {
    if (authCheckInProgress) {
      console.log('Auth check already in progress, skipping...')
      return
    }

    setAuthCheckInProgress(true)

    try {
      const apiBaseUrl = getApiBaseUrl()
      const token = localStorage.getItem('session_token')

      const response = await fetch(`${apiBaseUrl}/auth/status`, {
        headers: token
          ? {
              'Authorization': `Bearer ${token}`
            }
          : {},
        credentials: 'include', // Keep for backward compatibility
      })

      const data = await response.json()
      setIsAuthenticated(data.authenticated)

      if (data.authenticated && !connectionInitiated.current) {
        connectionInitiated.current = true
        if (token) {
          setTimeout(() => connectWebSocket(token), 1000)
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    } finally {
      setLoading(false)
      setAuthCheckInProgress(false)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  3. UPDATED connectWebSocket (signature & internals)               */
  /* ------------------------------------------------------------------ */
  const connectWebSocket = (sessionToken: string, isRetry: boolean = false) => {
    // If no sessionToken provided, try to get from storage
    if (!sessionToken) {
      sessionToken = localStorage.getItem('session_token') || ''
      if (!sessionToken) {
        console.error('No session token available for WebSocket connection')
        return
      }
    }

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
      console.log('Creating new WebSocket connection with session token:', sessionToken)
    }

    try {
      // Smart URL detection for WebSocket
      const wsBaseUrl = getWsBaseUrl()
      const ws = new WebSocket(`${wsBaseUrl}/ws/${sessionToken}`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('✅ WebSocket connected successfully')
        connectionStateRef.current = 'connected'
        reconnectAttempts.current = 0 // Reset reconnect attempts on successful connection
        setIsConnecting(false)
        setWsConnected(true)
        window.wsRef = ws

        // CRITICAL: Set session token in audio playback to prevent cross-contamination
        audioPlaybackHook.setCurrentSession(sessionToken)
        console.log(`🔒 Audio session locked to: ${sessionToken}`)

        console.log(isRetry ? 'Reconnected to Gmail service' : 'Connected to Gmail service')
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
            return
          }

          if (messageType === 'response.created') {
            if (import.meta.env.DEV) {
              console.log('🚀 OpenAI response started')
            }
            if (isAISpeaking) {
              audioPlaybackHook.stopPlayback()
            }
            audioPlaybackHook.clearQueue()
            awaitingAudioRef.current = true

            if (responseTimeoutRef.current) {
              clearTimeout(responseTimeoutRef.current)
            }
            responseTimeoutRef.current = setTimeout(() => {
              if (awaitingAudioRef.current && !isAISpeaking) {
                console.log('⚠️ No audio received from OpenAI within 3 seconds - resetting state')
                awaitingAudioRef.current = false
                requestStartTimeRef.current = 0 // Reset timing

                // CRITICAL FIX: Reset processing state on timeout
                setIsProcessingRequest(false)
                console.log('⏰ Timeout occurred - reset processing state for retry')

                toast('Request timed out. You can try speaking again.', { icon: '⏰', duration: 1500 })
              }
            }, 1500) // 1.5 s timeout for faster recovery
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
                  console.log(`⚡ TOTAL RESPONSE LATENCY: ${Math.round(totalLatency)} ms (target < 250 ms)`)
                  if (totalLatency > 250) {
                    console.warn(`⚠️ Latency above target! ${Math.round(totalLatency)} ms`)
                  } else {
                    console.log(`✅ Excellent latency! ${Math.round(totalLatency)} ms`)
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

            // CRITICAL FIX: Reset processing state
            setIsProcessingRequest(false)
            console.log('✅ Request processing complete - ready for new requests')

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

            // EMERGENCY RESET
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

      /* -------------------------------------------------------------- */
      /*  6. UPDATED reconnection logic (ws.onclose)                    */
      /* -------------------------------------------------------------- */
      ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason)

        if (wsRef.current === ws) {
          connectionStateRef.current = 'idle'
          setWsConnected(false)
          setIsConnecting(false)
          wsRef.current = null
          window.wsRef = null
          sessionReadyRef.current = false

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

            console.log(`🔄 Attempting reconnection ${reconnectAttempts.current}/${maxReconnectAttempts.current} in ${delay} ms`)
            console.log(`Reconnecting... (${reconnectAttempts.current}/${maxReconnectAttempts.current})`)

            reconnectTimeoutRef.current = setTimeout(() => {
              const token = localStorage.getItem('session_token')

              if (token) {
                connectWebSocket(token, true)
              }
            }, delay)
          } else {
            console.error('Connection failed after multiple attempts')
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

        console.error('WebSocket connection failed')
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setIsConnecting(false)
      setWsConnected(false)
      console.error('Failed to create WebSocket connection')
    }
  }

  const handleLogin = () => {
    const apiBaseUrl = getApiBaseUrl()
    window.location.href = `${apiBaseUrl}/login`
  }

  /* ------------------------------------------------------------------ */
  /*  4. UPDATED handleLogout                                           */
  /* ------------------------------------------------------------------ */
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

      const apiBaseUrl = getApiBaseUrl()
      const token = localStorage.getItem('session_token')

      await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST',
        headers: token
          ? {
              'Authorization': `Bearer ${token}`
            }
          : {},
        credentials: 'include'
      })

      localStorage.removeItem('session_token')
      window.location.reload()
    } catch (error) {
      console.error('Logout failed:', error)
    }
  }

  /* ------------------------------------------------------------------ */
  /*  5. UPDATED forceReconnect                                         */
  /* ------------------------------------------------------------------ */
  const forceReconnect = () => {
    if (isConnecting) {
      console.log('Already connecting, please wait...')
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

    const token = localStorage.getItem('session_token')

    if (token) {
      connectionInitiated.current = true
      console.log('Reconnecting to Gmail service...')
      setTimeout(() => connectWebSocket(token), 500)
    } else {
      console.error('No session found - please login again')
    }
  }

  /* ------------------------------------------------------------------ */
  /*  remainder of component unchanged                                  */
  /* ------------------------------------------------------------------ */

  // Manual voice recording handlers
  const handleStartRecording = async () => {
    if (!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log('Not connected to Gmail service')
      return
    }

    // Wait for session to be ready
    if (!sessionReadyRef.current) {
      console.log('Waiting for session...')
      // Wait up to 2 seconds for session
      let waited = 0
      while (!sessionReadyRef.current && waited < 2000) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waited += 100
      }
      if (!sessionReadyRef.current) {
        console.log('Session not ready, please try again')
        return
      }
    }

    // Block recording when AI is speaking OR when processing request
    if (isAISpeaking) {
      console.log('AI is speaking, cannot start recording')
      return
    }

    if (isProcessingRequest) {
      console.log('Still processing previous request, please wait')
      return
    }

    if (isRecording || manualVoiceCapture.isRecording) {
      console.log('Already recording, ignoring start request')
      return
    }

    if (!manualVoiceCapture.isSupported) {
      console.log('Microphone not supported in this browser')
      return
    }

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
        console.log('Microphone permission required for voice commands')
        return
      }
    }

    if (manualVoiceCapture.permissionStatus === 'denied') {
      console.log('Microphone permission denied')
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
      console.log('Please connect to Gmail service first')
      return
    }

    if (!continuousVoiceCapture.isSupported) {
      console.log('Microphone not supported in this browser')
      return
    }

    if (continuousVoiceCapture.permissionStatus === 'prompt') {
      const granted = await continuousVoiceCapture.requestPermission()
      if (!granted) {
        console.log('Microphone permission required for voice commands')
        return
      }
    }

    if (continuousVoiceCapture.permissionStatus === 'denied') {
      console.log('Microphone permission denied')
      return
    }

    if (continuousVoiceCapture.isListening) {
      continuousVoiceCapture.stopListening()
      console.log('Voice capture stopped')
    } else {
      await continuousVoiceCapture.startListening()
      console.log('Voice capture active')
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
    console.log(`Switched to ${newMode} mode`)
  }

  /* ---------------------- UI RENDERING (unchanged) ------------------ */

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
              {/* <ConnectionTest /> */}
              <GmailTest
                ws={wsRef.current}
                isConnected={!!(wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN)}
              />
            </div>
          ) : (
            <>
              {/* Central Microphone Area */}
              <div className="flex flex-col justify-center items-center py-8 min-h-[400px]">

                {/* Main Mic Button - Clean Design */}
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
                      className={`w-20 h-20 rounded-2xl font-medium transition-all duration-200 active:scale-95 flex items-center justify-center ${
                        isRecording
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                          : isProcessingRequest
                          ? 'bg-orange-500 text-white'
                          : isAISpeaking
                          ? 'bg-purple-500 text-white'
                          : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && manualVoiceCapture.isSupported)
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'bg-gray-500 cursor-not-allowed text-gray-300'
                      }`}
                    >
                      {isAISpeaking ? (
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M3 9v6h4l5 5V4L7 9H3z"/>
                          <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                        </svg>
                      ) : (
                        <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleToggleHandsFree}
                      disabled={!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !continuousVoiceCapture.isSupported}
                      className={`w-20 h-20 rounded-2xl font-medium transition-all duration-200 active:scale-95 flex items-center justify-center ${
                        continuousVoiceCapture.isListening
                          ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                          : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && continuousVoiceCapture.isSupported)
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'bg-gray-500 cursor-not-allowed text-gray-300'
                      }`}
                    >
                      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                      </svg>
                    </button>
                  )}
                </div>

                {/* Clean Status Text */}
                <div className="text-center mb-6">
                  <h2 className="text-lg font-medium text-white mb-1">
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

                  <p className="text-gray-400 text-xs">
                    {voiceMode === 'manual'
                      ? isRecording
                        ? 'Release to send'
                        : 'Hold to speak'
                      : continuousVoiceCapture.isListening
                        ? 'Say something'
                        : 'Tap to activate'
                    }
                  </p>
                </div>

                {/* Clean Mode Toggle */}
                <div className="bg-white/10 rounded-lg p-1">
                  <div className="flex">
                    <button
                      onClick={() => handleSwitchMode('hands-free')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        voiceMode === 'hands-free'
                          ? 'bg-white/20 text-white'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Hands-Free
                    </button>
                    <button
                      onClick={() => handleSwitchMode('manual')}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
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

              {/* Bottom Actions - Simplified */}
              <div className="pb-8 mt-8">
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 text-center mb-3">
                    Try saying
                  </p>
                  {['"How many unread emails?"', '"Show important emails"', '"Search invoices"'].map((suggestion, index) => (
                    <button
                      key={index}
                      className="w-full p-2 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10 transition-all"
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
      {/* Removed Toaster - no more annoying notifications */}
    </>
  )
}

export default App
