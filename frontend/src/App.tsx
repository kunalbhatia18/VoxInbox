import { useEffect, useState, useRef } from 'react'
import { Toaster, toast } from 'react-hot-toast'
import { GmailTest } from './components/GmailTest'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showTests, setShowTests] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Check authentication status
    checkAuth()

    // Cleanup on unmount
    return () => {
      wsRef.current?.close()
    }
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/status', {
        credentials: 'include',
      })
      const data = await response.json()
      setIsAuthenticated(data.authenticated)
      if (data.email) setUserEmail(data.email)

      if (data.authenticated) {
        const sessionId = document.cookie
          .split('; ')
          .find((row) => row.startsWith('session_id='))
          ?.split('=')[1]
        if (sessionId) {
          connectWebSocket(sessionId)
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      toast.error('Authentication check failed')
    } finally {
      setLoading(false)
    }
  }

  const connectWebSocket = (sessionId: string) => {
    console.log('Attempting WebSocket connection with session:', sessionId)
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`)

    ws.onopen = () => {
      console.log('WebSocket connected successfully')
      setWsConnected(true)
      toast.success('Connected to Gmail service')
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
      setWsConnected(false)
      if (event.code === 4001) {
        toast.error('Invalid session - please login again')
      } else if (event.code === 4002) {
        toast.error('Connection already active')
      } else {
        toast.error('Disconnected from Gmail service')
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      toast.error('Failed to connect to Gmail service')
    }

    wsRef.current = ws
  }

  const handleLogin = () => {
    window.location.href = '/api/login'
  }

  const startRecording = () => {
    setIsRecording(true)
    toast('Push-to-talk recording started', { icon: '🎤' })
    // TODO: Implement audio capture
  }

  const stopRecording = () => {
    setIsRecording(false)
    toast('Recording stopped', { icon: '⏹️' })
    // TODO: Send audio to WebSocket
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
            className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition"
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
              <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">{userEmail}</span>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4">
          {showTests ? (
            <div className="max-w-4xl mx-auto">
              <GmailTest ws={wsRef.current} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-gray-600 mb-8">
                  {wsConnected ? 'Gmail functions ready! Voice coming soon...' : 'Connecting to Gmail service...'}
                </p>

                {/* Push-to-talk button */}
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onTouchStart={startRecording}
                  onTouchEnd={stopRecording}
                  disabled={!wsConnected}
                  className={
                    `w-32 h-32 rounded-full transition-all duration-200 ` +
                    (isRecording
                      ? 'bg-red-500 scale-110 shadow-lg'
                      : wsConnected
                      ? 'bg-primary hover:bg-blue-600 shadow'
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
                  {isRecording ? 'Recording...' : 'Push and hold to talk (coming soon)'}
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
