import asyncio
import websockets
import json

async def test_websocket():
    # Replace with your actual session_id from browser cookies
    SESSION_ID = "your-session-id-here"
    
    uri = f"ws://localhost:8000/ws/{SESSION_ID}"
    
    async with websockets.connect(uri) as websocket:
        print("✅ Connected to WebSocket")
        
        # Test audio message
        await websocket.send(json.dumps({
            "type": "audio",
            "data": "base64_encoded_opus_data_here"
        }))
        
        response = await websocket.recv()
        print(f"Received: {response}")
        
        # Test function call
        await websocket.send(json.dumps({
            "type": "function_call",
            "function": "list_unread",
            "args": {"max_results": 5}
        }))
        
        response = await websocket.recv()
        print(f"Received: {response}")

if __name__ == "__main__":
    print("WebSocket Test")
    print("1. First, login via browser to get a session")
    print("2. Check browser DevTools > Application > Cookies for session_id")
    print("3. Update SESSION_ID in this script")
    print("4. Run this test\n")
    
    asyncio.run(test_websocket())