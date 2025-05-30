import React from 'react'

interface VoiceVisualizerProps {
  status: 'idle' | 'listening' | 'processing' | 'active' | 'speaking'
  isActive: boolean
  isMuted: boolean
  amplitude?: number
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  status,
  isActive,
  isMuted,
  amplitude = 0
}) => {
  const getStatusColor = () => {
    if (isMuted) return 'rgb(156, 163, 175)' // gray-400
    switch (status) {
      case 'listening': return 'rgb(59, 130, 246)' // blue-500
      case 'active': return 'rgb(34, 197, 94)' // green-500
      case 'processing': return 'rgb(249, 115, 22)' // orange-500
      case 'speaking': return 'rgb(147, 51, 234)' // purple-500
      default: return 'rgb(107, 114, 128)' // gray-500
    }
  }

  const getStatusText = () => {
    if (isMuted) return 'Muted'
    switch (status) {
      case 'listening': return 'Listening for wake word...'
      case 'active': return 'I\'m listening'
      case 'processing': return 'Thinking...'
      case 'speaking': return 'Speaking'
      default: return 'Ready'
    }
  }

  const shouldAnimate = (status === 'active' || status === 'listening' || status === 'speaking') && !isMuted

  return (
    <div className="flex flex-col items-center space-y-6">
      {/* Main Voice Circle */}
      <div className="relative">
        {/* Outer glow rings */}
        {shouldAnimate && (
          <>
            <div 
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ 
                backgroundColor: getStatusColor(),
                animationDuration: status === 'speaking' ? '1s' : '2s'
              }}
            />
            <div 
              className="absolute inset-2 rounded-full animate-pulse opacity-30"
              style={{ 
                backgroundColor: getStatusColor(),
                animationDuration: status === 'speaking' ? '0.8s' : '1.5s'
              }}
            />
          </>
        )}

        {/* Main circle */}
        <div
          className={`
            relative w-32 h-32 rounded-full flex items-center justify-center
            transition-all duration-300 ease-in-out
            ${shouldAnimate ? 'scale-110' : 'scale-100'}
            ${status === 'speaking' ? 'animate-pulse' : ''}
          `}
          style={{
            backgroundColor: getStatusColor(),
            boxShadow: `0 0 30px ${getStatusColor()}40`
          }}
        >
          {/* Inner waveform for speaking */}
          {status === 'speaking' && !isMuted && (
            <div className="flex items-center justify-center space-x-1">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-full animate-pulse"
                  style={{
                    width: '3px',
                    height: `${12 + Math.sin(Date.now() / 200 + i) * 8}px`,
                    animationDelay: `${i * 0.1}s`,
                    animationDuration: '0.6s'
                  }}
                />
              ))}
            </div>
          )}

          {/* Processing dots */}
          {status === 'processing' && !isMuted && (
            <div className="flex space-x-1">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 bg-white rounded-full animate-bounce"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: '1s'
                  }}
                />
              ))}
            </div>
          )}

          {/* Microphone icon for listening states */}
          {(status === 'listening' || status === 'active') && !isMuted && (
            <svg
              className={`w-12 h-12 text-white ${status === 'active' ? 'animate-pulse' : ''}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}

          {/* Muted icon */}
          {isMuted && (
            <svg
              className="w-12 h-12 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          )}

          {/* Idle state */}
          {status === 'idle' && (
            <svg
              className="w-12 h-12 text-white opacity-60"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </div>
      </div>

      {/* Status text */}
      <div className="text-center">
        <p 
          className="text-lg font-medium transition-colors duration-300"
          style={{ color: getStatusColor() }}
        >
          {getStatusText()}
        </p>
        
        {/* Additional status info */}
        {status === 'listening' && !isActive && (
          <p className="text-sm text-gray-500 mt-1">
            Say "hey voiceinbox" or click "Activate Now"
          </p>
        )}
        
        {status === 'active' && (
          <p className="text-sm text-gray-500 mt-1">
            Speak naturally - I'm ready to help
          </p>
        )}
      </div>

      {/* Waveform visualization for speaking */}
      {status === 'speaking' && !isMuted && (
        <div className="flex items-center justify-center space-x-1 h-12">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="bg-purple-500 rounded-full animate-pulse"
              style={{
                width: '3px',
                height: `${8 + Math.sin(Date.now() / 150 + i * 0.5) * 16}px`,
                animationDelay: `${i * 0.05}s`,
                animationDuration: '0.4s'
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
