import { useEffect, useState, useRef } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { GmailTest } from './components/GmailTest'
import { ConnectionTest } from './components/ConnectionTest'
import { useVoiceCapture } from './hooks/useVoiceCapture'

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
  const wsRef = useRef<WebSocket | null>(null)
  const connectionInitiated = useRef(false) // Prevent React StrictMode double-connections

  // Voice capture hook
  const voiceCapture = useVoiceCapture({
    onAudioData: (audioBase64: string) => {
      // Send audio to OpenAI via WebSocket
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const audioMessage = {
          type: "input_audio_buffer.append",
          audio: audioBase64
        }
        wsRef.current.send(JSON.stringify(audioMessage))
        console.log('🎤 Sent audio data to OpenAI', audioBase64.length, 'characters')
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

  // Update recording state when voice capture changes
  useEffect(() => {
    setIsRecording(voiceCapture.isRecording)
  }, [voiceCapture.isRecording])

  useEffect(() => {
    console.log('🔧 App useEffect running - initializing...')
    
    // Initialize global WebSocket reference
    window.wsRef = null
    
    // Check authentication status
    checkAuth()

    // Cleanup on unmount
    return () => {
      console.log('🧹 App useEffect cleanup running...')
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
    console.log('Creating new WebSocket connection with session:', sessionId)
    
    try {
      const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)
      wsRef.current = ws // Store reference immediately

      ws.onopen = () => {
        console.log('WebSocket connected successfully')
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
          console.log('WebSocket message:', message)
          
          if (message.type === 'error' && !message.function) {
            toast.error(message.error)
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
    
    // Check microphone support
    if (!voiceCapture.isSupported) {
      toast.error('Microphone not supported in this browser')
      return
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
    voiceCapture.stopRecording()
    
    // Tell OpenAI we've finished sending audio
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const commitMessage = {
        type: "input_audio_buffer.commit"
      }
      wsRef.current.send(JSON.stringify(commitMessage))
      console.log('📱 Committed audio buffer to OpenAI')
    }
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
                  onMouseDown={handleStartRecording}
                  onMouseUp={handleStopRecording}
                  onTouchStart={handleStartRecording}
                  onTouchEnd={handleStopRecording}
                  disabled={!wsConnected || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !voiceCapture.isSupported}
                  className={
                    `w-32 h-32 rounded-full transition-all duration-200 ` +
                    (isRecording
                      ? 'bg-red-500 scale-110 shadow-lg animate-pulse'
                      : (wsConnected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && voiceCapture.isSupported)
                      ? 'bg-blue-500 hover:bg-blue-600 shadow'
                      : 'bg-gray-300 cursor-not-allowed')
                  }
                >
                  <svg
                    className="w-12 h-12 mx-auto text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                </button>

                <p className="mt-4 text-xs text-gray-500">
                  {!voiceCapture.isSupported 
                    ? 'Microphone not supported in this browser'
                    : voiceCapture.permissionStatus === 'denied'
                    ? 'Microphone permission denied - please allow access'
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
