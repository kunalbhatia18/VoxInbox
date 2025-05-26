import { useState } from 'react'

export function ConnectionTest() {
  const [testResults, setTestResults] = useState<any[]>([])
  const [testing, setTesting] = useState(false)

  const runTests = async () => {
    setTesting(true)
    const results = []

    // Test 1: Backend root endpoint
    try {
      const response = await fetch('/api/')
      const data = await response.json()
      results.push({
        test: 'Backend Root',
        status: response.ok ? '✅ Success' : '❌ Failed',
        data: data
      })
    } catch (error) {
      results.push({
        test: 'Backend Root',
        status: '❌ Failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 2: Auth status
    try {
      const response = await fetch('/api/auth/status', { credentials: 'include' })
      const data = await response.json()
      results.push({
        test: 'Auth Status',
        status: response.ok ? '✅ Success' : '❌ Failed',
        data: data
      })
    } catch (error) {
      results.push({
        test: 'Auth Status',
        status: '❌ Failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 3: Session debug info
    try {
      const response = await fetch('/api/debug/session', { credentials: 'include' })
      const data = await response.json()
      results.push({
        test: 'Session Debug',
        status: response.ok ? '✅ Success' : '❌ Failed',
        data: data
      })
    } catch (error) {
      results.push({
        test: 'Session Debug',
        status: '❌ Failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Test 4: Cookie analysis
    const allCookies = document.cookie
    const sessionId = document.cookie
      .split('; ')
      .find((row) => row.startsWith('session_id='))
      ?.split('=')[1]
    
    results.push({
      test: 'Cookie Analysis',
      status: sessionId ? '✅ Session ID Found' : '❌ No Session ID',
      data: {
        sessionId: sessionId || 'Not found',
        allCookies: allCookies || 'No cookies',
        cookieCount: document.cookie.split(';').length
      }
    })

    // Test 5: WebSocket connection test (using existing connection)
    try {
      const sessionId = document.cookie
        .split('; ')
        .find((row) => row.startsWith('session_id='))
        ?.split('=')[1]
      
      if (sessionId) {
        // Test the existing WebSocket connection instead of creating a new one
        const wsStatus = {
          sessionId: sessionId,
          hasWebSocket: !!window.wsRef,
          readyState: window.wsRef ? window.wsRef.readyState : null,
          readyStateText: window.wsRef ? [
            'CONNECTING',
            'OPEN', 
            'CLOSING',
            'CLOSED'
          ][window.wsRef.readyState] : 'No WebSocket'
        }
        
        results.push({
          test: 'WebSocket Status',
          status: wsStatus.readyState === 1 ? '✅ Connected' : '❌ Not Connected',
          data: wsStatus
        })
      } else {
        results.push({
          test: 'WebSocket Status',
          status: '❌ Failed',
          error: 'No session ID found'
        })
      }
    } catch (error) {
      results.push({
        test: 'WebSocket Status',
        status: '❌ Failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    setTestResults(results)
    setTesting(false)
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h3 className="text-lg font-semibold mb-4">🔧 Connection Diagnostics</h3>
      
      <button
        onClick={runTests}
        disabled={testing}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50 mb-4"
      >
        {testing ? 'Testing...' : 'Run Connection Tests'}
      </button>

      {testResults.length > 0 && (
        <div className="space-y-3">
          {testResults.map((result, index) => (
            <div key={index} className="border-l-4 border-blue-500 pl-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">{result.test}</span>
                <span className={result.status.includes('✅') ? 'text-green-600' : 'text-red-600'}>
                  {result.status}
                </span>
              </div>
              {result.data && (
                <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
              {result.error && (
                <div className="text-xs text-red-600 mt-1">
                  Error: {result.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
