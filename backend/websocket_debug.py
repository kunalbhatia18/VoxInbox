# 🔍 ADD THIS DEBUGGING TO YOUR WebSocket ENDPOINT

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint with OpenAI Realtime API integration"""
    
    # MUST accept connection first - cannot close before accepting
    await websocket.accept()
    
    # 🔍 DEBUG: Log session details
    print(f"🔍 WebSocket DEBUG:")
    print(f"   Session ID received: {session_id}")
    print(f"   Sessions available: {list(sessions.keys())}")
    print(f"   Total sessions: {len(sessions)}")
    
    # Then verify session
    if session_id not in sessions:
        print(f"❌ Session {session_id} NOT FOUND in sessions!")
        print(f"❌ Available sessions: {list(sessions.keys())}")
        await websocket.close(code=4001, reason="Invalid session")
        return
    
    print(f"✅ Session {session_id} found!")
    user_id = sessions[session_id]["user_id"]
    print(f"✅ User ID: {user_id}")
    
    # Rest of your WebSocket code...
    # [Continue with existing WebSocket code]
