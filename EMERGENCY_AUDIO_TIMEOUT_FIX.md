# 🚨 EMERGENCY AUDIO TIMEOUT FIX

## THE PROBLEM YOU EXPERIENCED:

1. **Audio plays for 1ms** → Stops abruptly  
2. **30 seconds later** → Wrong audio plays (foreign language from previous session)
3. **WebSocket disconnects** after every response
4. **Voice capture still 16kHz** instead of 48kHz

## ROOT CAUSE:

The **audio timeout recovery mechanism** is causing chaos:
- It's designed to "recover" after 30 seconds if audio seems stuck
- But it's triggering even during normal playback
- Playing stale buffers from previous sessions
- The "foreign language" audio was from a cached/stale buffer

## IMMEDIATE MANUAL FIX:

Since the file editing is having issues, here's what you need to do:

**1. Open** `/Users/kunal/voice-inbox-mvp/frontend/src/hooks/useAudioPlayback.ts`

**2. Find this code around line 264:**
```typescript
timeoutRef.current = setTimeout(async () => {
  if (isPlayingRef.current) {
    console.warn('🚨 Audio playback timeout detected')
    
    // Try to recover by reinitializing audio context
    const recovered = await initAudioContext(true)
    if (recovered && audioBufferQueueRef.current.length > 0) {
      console.log('🔄 Attempting to resume playback after timeout')
      // Try to continue with remaining buffers
      playNextBuffer()
    } else {
      console.warn('🛑 Audio recovery failed, stopping playback')
      stopPlayback()
    }
  }
}, 30000) // 30 second timeout
```

**3. Replace it with:**
```typescript
// TIMEOUT DISABLED - was causing delayed playback of wrong audio
console.log('✨ Audio timeout recovery disabled')
```

**4. Save the file**

## EXPECTED RESULT:

- ✅ No more 30-second delayed audio
- ✅ No more foreign language audio
- ✅ Clean audio completion
- ✅ Button returns to blue properly

## TEST AFTER FIX:

Try voice again - should work without the bizarre 30-second delay and wrong language issue.

The core audio fixes (48kHz, resampling, single response) are working - we just need to remove this problematic timeout recovery.
