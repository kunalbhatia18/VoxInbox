import { useEffect, useState, useRef, useMemo } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { GmailTest } from './components/GmailTest'
import { ConnectionTest } from './components/ConnectionTest'
import { useVoiceCapture } from './hooks/useVoiceCapture'
import { useAudioPlayback } from './hooks/useAudioPlayback'

// Extend Window interface for global WebSocket reference
declare global {
  interface Window {
    wsRef: WebSocket | null
  }
}

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
  const wsRef = useRef<WebSocket | null>(null)
  const connectionInitiated = useRef(false) // Prevent React StrictMode double-connections

  // Voice capture hook
  const voiceCapture = useVoiceCapture({
    onAudioData: (audioBase64: string) => {
      // Check if we actually have audio data before sending
      if (!audioBase64 || audioBase64.length < 1000) {
        console.warn('⚠️ Audio buffer too small, skipping send:', audioBase64.length)
        toast.error('Please speak longer - audio too short')
        return
      }
      
      // Send audio to OpenAI via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const audioMessage = {
          type: "input_audio_buffer.append",
          audio: audioBase64
        }
        wsRef.current.send(JSON.stringify(audioMessage))
        console.log('🎤 Sent audio data to OpenAI', audioBase64.length, 'characters')
        
        // NOW commit the audio buffer and request response
        const commitMessage = {
          type: "input_audio_buffer.commit"
        }
        wsRef.current.send(JSON.stringify(commitMessage))
        console.log('📱 Committed audio buffer to OpenAI')
        
        // Request OpenAI to generate a response
        const responseMessage = {
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: "You are VoiceInbox, a helpful email assistant. Respond naturally and help the user with their Gmail tasks.",
            voice: "alloy",
            output_audio_format: "pcm16",
            temperature: 0.6
          }
        }
        wsRef.current.send(JSON.stringify(responseMessage))
        console.log('🤖 Requested OpenAI response with audio output')
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

  // Audio playback hook with stable callbacks
  const audioPlayback = useMemo(() => ({
    onPlaybackStart: () => {
      console.log('🔊 AI started speaking')
      setIsAISpeaking(true)
      toast('🤖 AI speaking...', { icon: '🔊', duration: 30000 })
    },
    onPlaybackEnd: () => {
      console.log('🔊 AI finished speaking')
      setIsAISpeaking(false)
      toast.dismiss() // Clear previous toasts
      toast.success('AI finished speaking', { icon: '✓', duration: 2000 })
    },
    onError: (error: string) => {
      console.error('Audio playback error:', error)
      toast.error(`Audio error: ${error}`)
      setIsAISpeaking(false)
    }
  }), []) // Empty dependency array for stable callbacks

  const audioPlaybackHook = useAudioPlayback(audioPlayback)

  // Update recording state when voice capture changes
  useEffect(() => {
    setIsRecording(voiceCapture.isRecording)
  }, [voiceCapture.isRecording])

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔧 App useEffect running - initializing...')
    }
    
    // Initialize global WebSocket reference
    window.wsRef = null
    
    // Check authentication status
    checkAuth()

    // Cleanup on unmount
    return () => {
      if (import.meta.env.DEV) {
        console.log('🧹 App useEffect cleanup running...')
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        window.wsRef = null // Clear global reference
      }
      // Voice capture handles its own cleanup
    }
  }, []) // Stable dependencies

  const checkAuth = async () => {
    if (authCheckInProgress) {
      console.log('Auth check already in progress, skipping...')
      return
    }
    
    setAuthCheckInProgress(true)
    
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include',
      })
      const data = await response.json()
      setIsAuthenticated(data.authenticated)
      if (data.email) setUserEmail(data.email)

      if (data.authenticated && !connectionInitiated.current) {
        connectionInitiated.current = true // Prevent multiple connection attempts
        const sessionId = document.cookie
          .split('; ')
          .find((row) => row.startsWith('session_id='))
          ?.split('=')[1]
        if (sessionId) {
          // Longer delay to ensure everything is ready and avoid React StrictMode issues
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

  const connectWebSocket = (sessionId: string) => {
    // Prevent multiple connections
    if (isConnecting) {
      console.log('Already attempting to connect, skipping...')
      return
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected, skipping...')
      setWsConnected(true)
      return
    }

    // Prevent rapid reconnection attempts
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connecting, skipping...')
      return
    }

    // Close existing connection if any
    if (wsRef.current) {
      console.log('Closing existing WebSocket before creating new one')
      wsRef.current.close()
      wsRef.current = null
      window.wsRef = null // Clear global reference
    }

    setIsConnecting(true)
    setWsConnected(false)
    if (import.meta.env.DEV) {
      console.log('Creating new WebSocket connection with session:', sessionId)
    }
    
    try {
      const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)
      wsRef.current = ws // Store reference immediately

      ws.onopen = () => {
        if (import.meta.env.DEV) {
          console.log('WebSocket connected successfully')
        }
        setIsConnecting(false)
        // Only set connected if WebSocket is actually open
        if (ws.readyState === WebSocket.OPEN) {
          setWsConnected(true)
          toast.success('Connected to Gmail service')
          // Make WebSocket accessible for testing
          window.wsRef = ws
        }
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          const messageType = message.type
          
          // Only log essential messages to reduce console noise
          if (import.meta.env.DEV && ['response.created', 'response.done', 'response.audio.done', 'system', 'error'].includes(messageType)) {
            console.log('WebSocket message:', message)
          }
          
          // Handle only essential message types from OpenAI Realtime API
          if (messageType === 'response.created') {
            if (import.meta.env.DEV) {
              console.log('🚀 OpenAI response started')
            }
            // Clear any previous audio to ensure clean playback
            audioPlaybackHook.clearQueue()
            
          } else if (messageType === 'response.audio.delta') {
            // Handle audio response chunks from OpenAI - MOST IMPORTANT
            if (message.delta) {
              audioPlaybackHook.addAudioChunk(message.delta)
              // Don't log individual chunks - too noisy
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
            
          } else if (messageType === 'system') {
            // Handle system messages (like fallback mode)
            toast(message.message, { icon: 'ℹ️' })
            
          } else if (messageType === 'error' && !message.function) {
            console.error('❌ OpenAI Error:', message.error)
            toast.error(`OpenAI Error: ${message.error?.message || 'Unknown error'}`)
          }
          
          // Handle function result messages (for testing)
          if (messageType === 'function_result') {
            console.log('Function result:', message.function, message.result)
          }
        } catch (e) {
          console.error('Invalid WebSocket message', e)
        }
      }

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        
        // Only update state if this is still the current WebSocket
        if (wsRef.current === ws) {
          setWsConnected(false)
          setIsConnecting(false)
          wsRef.current = null
          window.wsRef = null
        }
        
        if (event.code === 4001) {
          toast.error('Invalid session - please login again')
        } else if (event.code === 4002) {
          console.log('Another connection was already active')
        } else if (event.code !== 1000 && event.code !== 1001) { // 1000 = normal, 1001 = going away
          // Don't show error toast for normal closure or development reconnections
          if (event.code !== 1006 || !import.meta.env.DEV) {
            toast.error('Disconnected from Gmail service')
          }
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setWsConnected(false)
        setIsConnecting(false)
        if (wsRef.current === ws) {
          wsRef.current = null
          window.wsRef = null // Clear global reference
        }
        toast.error('Failed to connect to Gmail service')
      }
    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setIsConnecting(false)
      setWsConnected(false)
      toast.error('Failed to create WebSocket connection')
    }
  }

  const handleLogin = () => {
    window.location.href = '/api/login'
  }

  const handleLogout = async () => {
    try {
      // Clean up WebSocket first
      connectionInitiated.current = false
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        window.wsRef = null // Clear global reference
      }
      setWsConnected(false)
      setIsConnecting(false)
      
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      })
      // Reload page to clear state
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
    connectionInitiated.current = false // Reset the flag
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
      window.wsRef = null // Clear global reference
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

  // Voice recording handlers
  const handleStartRecording = async () => {
    if (!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Please connect to Gmail service first')
      return
    }
    
    // Prevent recording if AI is speaking
    if (isAISpeaking) {
      console.log('AI is speaking, cannot start recording')
      toast.error('Please wait for AI to finish speaking')
      return
    }
    
    // Prevent double-start
    if (isRecording || voiceCapture.isRecording) {
      console.log('Already recording, ignoring start request')
      return
    }
    
    // Check microphone support
    if (!voiceCapture.isSupported) {
      toast.error('Microphone not supported in this browser')
      return
    }
    
    // Stop any ongoing audio playback first
    audioPlaybackHook.stopPlayback()
    
    // Initialize audio playback context on user gesture (required by browsers)
    try {
      if (!audioPlaybackHook.isSupported) {
        console.log('🔊 Initializing audio playback on user gesture...')
        // This will create AudioContext after user interaction
      }
    } catch (error) {
      console.warn('Audio playback initialization warning:', error)
    }
    
    // Request permission if needed
    if (voiceCapture.permissionStatus === 'prompt') {
      const granted = await voiceCapture.requestPermission()
      if (!granted) {
        toast.error('Microphone permission required for voice commands')
        return
      }
    }
    
    if (voiceCapture.permissionStatus === 'denied') {
      toast.error('Microphone permission denied')
      return
    }
    
    // Start recording
    await voiceCapture.startRecording()
  }

  const handleStopRecording = () => {
    // Prevent double-stop and only stop if actually recording
    if (!isRecording && !voiceCapture.isRecording) {
      console.log('Not recording, ignoring stop request')
      return
    }
    
    voiceCapture.stopRecording()
    // The commit and response.create are now sent in onAudioData callback
    // after the audio is actually processed and sent
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">VoiceInbox MVP</h1>
          <p className="text-gray-600 mb-2">Process your inbox with just your voice</p>
          <p className="text-sm text-gray-500 mb-8">
            "What if we could all arrive at work each day already at Inbox Zero?"
          </p>
          <button
            onClick={handleLogin}
            className="bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
            <h1 className="text-xl font-bold text-gray-900">VoiceInbox</h1>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowTests(!showTests)}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                {showTests ? 'Hide' : 'Show'} Tests
              </button>
              {(!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && !isConnecting && (
                <button
                  onClick={forceReconnect}
                  className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-300 rounded"
                >
                  Reconnect
                </button>
              )}
              {isConnecting && (
                <span className="text-xs text-yellow-600 px-2 py-1">
                  Connecting...
                </span>
              )}
              <button
                onClick={handleLogout}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 border rounded"
              >
                Logout
              </button>
              <div className={`w-2 h-2 rounded-full ${
                isConnecting 
                  ? 'bg-yellow-500 animate-pulse'
                  : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) 
                    ? 'bg-green-500' 
                    : 'bg-red-500'
              }`} />
              <span className="text-sm text-gray-600">{userEmail}</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4">
          {showTests ? (
            <div className="max-w-4xl mx-auto space-y-6">
              <ConnectionTest />
              <GmailTest 
                ws={wsRef.current} 
                isConnected={!!(wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN)} 
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-600 mb-8">
                  {isConnecting 
                    ? 'Connecting to Gmail service...' 
                    : isAISpeaking
                    ? '🤖 AI is responding... Please wait.'
                    : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) 
                      ? '🎤 Ready for voice commands! Press and hold to talk.'
                      : 'Connection lost - click Reconnect'
                  }
                  {import.meta.env.DEV && (
                    <span className="text-xs text-gray-400 block mt-1">
                      WS State: {wsRef.current ? wsRef.current.readyState : 'null'} | Connected: {wsConnected.toString()} | Connecting: {isConnecting.toString()}
                    </span>
                  )}
                </p>

                {/* Push-to-talk button */}
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
                    // Stop recording if mouse leaves button while held down
                    if (isRecording || voiceCapture.isRecording) {
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
                  disabled={!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !voiceCapture.isSupported || isAISpeaking}
                  className={
                    `w-32 h-32 rounded-full transition-all duration-200 ` +
                    (isRecording
                      ? 'bg-red-500 scale-110 shadow-lg animate-pulse'
                      : isAISpeaking
                      ? 'bg-purple-500 scale-105 shadow-lg animate-pulse cursor-not-allowed'
                      : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && voiceCapture.isSupported)
                      ? 'bg-blue-500 hover:bg-blue-600 shadow'
                      : 'bg-gray-300 cursor-not-allowed')
                  }
                >
                  {isAISpeaking ? (
                    // Speaker icon when AI is speaking
                    <svg
                      className="w-12 h-12 mx-auto text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                  ) : (
                    // Microphone icon when ready to record
                    <svg
                      className="w-12 h-12 mx-auto text-white"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  )}
                </button>

                <p className="mt-4 text-xs text-gray-500">
                  {!voiceCapture.isSupported 
                    ? 'Microphone not supported in this browser'
                    : voiceCapture.permissionStatus === 'denied'
                    ? 'Microphone permission denied - please allow access'
                    : isAISpeaking
                    ? '🤖 AI is speaking - please wait for response to finish'
                    : isRecording 
                    ? '🎤 Listening... Release to stop'
                    : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN)
                    ? 'Hold to talk with VoiceInbox'
                    : 'Connect to Gmail service first'
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      <Toaster position="top-right" />
    </>
  )
}

export default App
