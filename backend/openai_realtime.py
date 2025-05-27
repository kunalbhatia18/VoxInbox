import asyncio
import json
import websockets
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class OpenAIRealtimeHandler:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
        
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.openai_ws: Optional[websockets.WebSocketClientProtocol] = None
        
    async def connect_to_openai(self):
        """Connect to OpenAI Realtime API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            print("🔗 Connecting to OpenAI Realtime API...")
            self.openai_ws = await websockets.connect(
                "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
                extra_headers=headers,
                max_size=1024*1024*16  # 16MB max message size
            )
            print("✅ Connected to OpenAI Realtime API successfully!")
            return True
        except Exception as e:
            print(f"❌ Failed to connect to OpenAI Realtime API: {e}")
            return False
    
    async def send_session_config(self):
        """Configure the OpenAI session for our use case"""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": (
                    "You are VoiceInbox, a helpful email assistant. "
                    "You help users manage their Gmail inbox through voice commands. "
                    "You can list emails, search, create drafts, send emails, and organize messages. "
                    "Always be concise and helpful. When users ask about emails, use the provided functions."
                ),
                "voice": "alloy",
                "input_audio_format": "pcm16",  
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                },
                "tools": [],  # We'll add Gmail functions here later
                "tool_choice": "auto",
                "temperature": 0.8,
                "max_response_output_tokens": 4096
            }
        }
        
        if self.openai_ws:
            await self.openai_ws.send(json.dumps(session_config))
            print("📤 Sent session configuration to OpenAI")
        else:
            print("❌ No OpenAI WebSocket connection")

async def test_openai_connection():
    """Simple test to verify OpenAI Realtime API connection works"""
    handler = OpenAIRealtimeHandler()
    
    # Test connection
    connected = await handler.connect_to_openai()
    if not connected:
        return False
    
    # Send session config
    await handler.send_session_config()
    
    # Listen for response
    try:
        response = await asyncio.wait_for(handler.openai_ws.recv(), timeout=10.0)
        response_data = json.loads(response)
        print(f"📨 Received from OpenAI: {response_data.get('type', 'unknown')}")
        
        # Clean up
        await handler.openai_ws.close()
        print("✅ OpenAI Realtime API test successful!")
        return True
        
    except asyncio.TimeoutError:
        print("❌ Timeout waiting for OpenAI response")
        await handler.openai_ws.close()
        return False
    except Exception as e:
        print(f"❌ Error during test: {e}")
        if handler.openai_ws:
            await handler.openai_ws.close()
        return False

if __name__ == "__main__":
    # Test the connection
    asyncio.run(test_openai_connection())
