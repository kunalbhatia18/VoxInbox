# New WebSocket function for main.py
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint with OpenAI Realtime API integration"""
    
    # MUST accept connection first - cannot close before accepting
    await websocket.accept()
    
    # Then verify session
    if session_id not in sessions:
        await websocket.close(code=4001, reason="Invalid session")
        return
    
    user_id = sessions[session_id]["user_id"]
    
    # Close existing connections for this user
    if user_id in active_websockets:
        print(f"🔄 Closing existing WebSocket for user {user_id}")
        try:
            await active_websockets[user_id].close(code=1000, reason="New connection replacing old one")
        except Exception as e:
            print(f"Error closing old WebSocket: {e}")
    
    # Clean up existing proxy
    if user_id in active_proxies:
        print(f"🔄 Cleaning up existing proxy for user {user_id}")
        try:
            await active_proxies[user_id].cleanup()
        except Exception as e:
            print(f"Error cleaning up proxy: {e}")
        del active_proxies[user_id]
    
    # Store the new connection
    active_websockets[user_id] = websocket
    print(f"✅ WebSocket connected for user {user_id}")
    
    # Create and start OpenAI Realtime Proxy
    proxy = None
    try:
        proxy = OpenAIRealtimeProxy(GMAIL_FUNCTIONS)
        active_proxies[user_id] = proxy
        
        # Start the proxy (connects to OpenAI)
        proxy_started = await proxy.start_proxy(websocket, user_id)
        
        if proxy_started:
            print(f"🎙️ OpenAI Realtime Proxy started for user {user_id}")
            
            # Handle messages from frontend
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Check if it's a direct function call (for backward compatibility/testing)
                if message.get("type") == "function_call":
                    # Handle direct function calls for testing
                    await handle_direct_function_call(websocket, user_id, message)
                else:
                    # Forward all other messages to OpenAI proxy
                    await proxy.handle_client_message(message)
        else:
            # Fallback to direct mode if OpenAI connection fails
            print(f"⚠️ OpenAI connection failed for user {user_id}, falling back to direct mode")
            await websocket.send_json({
                "type": "system",
                "message": "Connected in direct mode (OpenAI unavailable)"
            })
            
            # Handle messages in direct mode
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                if message.get("type") == "function_call":
                    await handle_direct_function_call(websocket, user_id, message)
                else:
                    # Echo for testing
                    await websocket.send_json({
                        "type": "echo",
                        "data": message
                    })
    
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected for user {user_id}")
    except Exception as e:
        print(f"❌ WebSocket error for user {user_id}: {e}")
    finally:
        # Cleanup
        if user_id in active_websockets and active_websockets[user_id] == websocket:
            del active_websockets[user_id]
            print(f"🧹 Cleaned up WebSocket for user {user_id}")
        
        if user_id in active_proxies:
            try:
                await active_proxies[user_id].cleanup()
            except Exception as e:
                print(f"Error cleaning up proxy: {e}")
            del active_proxies[user_id]
            print(f"🧹 Cleaned up proxy for user {user_id}")

async def handle_direct_function_call(websocket: WebSocket, user_id: str, message: Dict):
    """Handle direct function calls (for backward compatibility and testing)"""
    func_name = message.get("function")
    if func_name in GMAIL_FUNCTIONS:
        try:
            func, args_model = GMAIL_FUNCTIONS[func_name]
            
            # Parse arguments if needed
            if args_model:
                args = args_model(**message.get("args", {}))
                if asyncio.iscoroutinefunction(func):
                    result = await func(user_id, args)
                else:
                    result = func(user_id, args)
            else:
                if asyncio.iscoroutinefunction(func):
                    result = await func(user_id)
                else:
                    result = func(user_id)
            
            await websocket.send_json({
                "type": "function_result",
                "function": func_name,
                "result": result
            })
        except ValueError as e:
            # Send guard rail errors
            error_msg = str(e)
            error_code = error_msg.split(':')[0] if ':' in error_msg else 'ERROR'
            await websocket.send_json({
                "type": "error",
                "function": func_name,
                "error_code": error_code,
                "error": error_msg
            })
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "function": func_name,
                "error": str(e)
            })
    else:
        await websocket.send_json({
            "type": "error",
            "error": f"Unknown function: {func_name}"
        })
