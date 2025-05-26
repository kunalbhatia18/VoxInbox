import { useState } from 'react'
import { toast } from 'react-hot-toast'

interface GmailTestProps {
  ws: WebSocket | null
}

export function GmailTest({ ws }: GmailTestProps) {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const testFunction = async (funcName: string, args?: any) => {
    if (!ws) {
      toast.error('WebSocket not connected')
      return
    }

    setLoading(true)
    setResults(null)

    // Send function call
    ws.send(JSON.stringify({
      type: 'function_call',
      function: funcName,
      args: args || {}
    }))

    // Listen for response
    const handler = (event: MessageEvent) => {
      const message = JSON.parse(event.data)
      if (message.function === funcName) {
        setLoading(false)
        if (message.type === 'error') {
          toast.error(`${message.error_code || 'Error'}: ${message.error}`)
          setResults({ error: message.error })
        } else {
          toast.success(`${funcName} completed`)
          setResults(message.result)
        }
        ws.removeEventListener('message', handler)
      }
    }

    ws.addEventListener('message', handler)

    // Timeout after 10 seconds
    setTimeout(() => {
      ws.removeEventListener('message', handler)
      if (loading) {
        setLoading(false)
        toast.error('Request timed out')
      }
    }, 10000)
  }

  const tests = [
    {
      name: 'List Unread',
      func: 'list_unread',
      args: { max_results: 5 }
    },
    {
      name: 'List Priority',
      func: 'list_unread_priority',
      args: { max_results: 5 }
    },
    {
      name: 'Search "invoice"',
      func: 'search_messages',
      args: { query: 'invoice', max_results: 5 }
    },
    {
      name: 'Categorize Unread',
      func: 'categorize_unread',
      args: { max_results: 30 }
    },
    {
      name: 'Create Draft',
      func: 'create_draft',
      args: {
        to: ['test@example.com'],
        subject: 'Test Email from VoiceInbox',
        body_markdown: 'This is a test email created by VoiceInbox MVP.'
      }
    }
  ]

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4">Gmail Function Tests</h2>
      
      <div className="grid gap-2 mb-4">
        {tests.map((test) => (
          <button
            key={test.func}
            onClick={() => testFunction(test.func, test.args)}
            disabled={loading || !ws}
            className="text-left px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {test.name}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      )}

      {results && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Results:</h3>
          <pre className="bg-gray-100 p-4 rounded text-xs overflow-auto max-h-96">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}