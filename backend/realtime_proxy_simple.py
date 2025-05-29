import asyncio
import json
import websockets
import os
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class OpenAIRealtimeProxy:
    """Simplified proxy for testing audio without Gmail functions"""
    
    def __init__(self, gmail_functions: Dict):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found")
        
        self.gmail_functions = gmail_functions
        self.openai_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.client_ws: Optional[Any] = None
        self.user_id: Optional[str] = None
        
    async def connect_to_openai(self):
        """Connect to OpenAI Realtime API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            print("🔗 Connecting to OpenAI Realtime API...")
            self.openai_ws = await websockets.connect(
                "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
                extra_headers=headers,
                max_size=1024*1024*16
            )
            print("✅ Connected to OpenAI Realtime API")
            return True
        except Exception as e:
            print(f"❌ OpenAI connection failed: {e}")
            return False
    
    async def setup_session(self):
        """Configure OpenAI session - SIMPLIFIED VERSION WITHOUT TOOLS"""
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": (
                    "You are VoiceInbox, a helpful Gmail assistant. "
                    "Give complete, natural responses. Be conversational but concise. "
                    "Always provide the full answer - don't cut off mid-sentence. "
                    "For now, just respond conversationally since Gmail functions are temporarily disabled."
                ),
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {
                    "model": "whisper-1"
                },
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.8,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 600
                },
                "temperature": 0.6,
                "max_response_output_tokens": 800
                # NO TOOLS - Testing audio only
            }
        }
        
        if self.openai_ws:
            await self.openai_ws.send(json.dumps(session_config))
            print("📤 Sent simplified session config (no Gmail tools)")
    
    async def handle_client_message(self, message_data: Dict):
        """Handle message from frontend and route appropriately"""
        message_type = message_data.get("type")
        
        # Forward all OpenAI Realtime API messages directly
        if message_type in [
            "input_audio_buffer.append",
            "input_audio_buffer.commit", 
            "response.create",
            "conversation.item.create",
            "response.cancel"
        ]:
            if self.openai_ws:
                await self.openai_ws.send(json.dumps(message_data))
                if message_type in ["input_audio_buffer.commit", "response.create"]:
                    print(f"📤 Forwarded {message_type} to OpenAI")
        
        elif message_type == "audio":
            if self.openai_ws:
                openai_message = {
                    "type": "input_audio_buffer.append",
                    "audio": message_data.get("audio", "")
                }
                await self.openai_ws.send(json.dumps(openai_message))
                print("🎤 Converted legacy audio message to OpenAI format")
        
        else:
            print(f"⚠️ Unknown message type from frontend: {message_type}")
    
    async def handle_openai_message(self, message_data: Dict):
        """Handle message from OpenAI and route to frontend"""
        message_type = message_data.get("type")
        
        # Forward essential messages to frontend
        essential_messages = {
            'session.created', 'session.updated', 'system',
            'response.created', 'response.done', 'error',
            'response.audio.delta', 'response.audio.done',
            'response.output_item.added', 'conversation.item.created',
            'input_audio_buffer.speech_started', 'input_audio_buffer.committed'
        }
        
        if message_type in essential_messages and self.client_ws:
            try:
                await self.client_ws.send_json(message_data)
            except Exception as e:
                print(f"⚠️ Error forwarding message to frontend: {e}")
        
        # Handle specific message types
        if message_type == "response.audio.delta":
            if hasattr(self, '_audio_chunk_count'):
                self._audio_chunk_count += 1
            else:
                self._audio_chunk_count = 1
                print("🎵 Audio streaming started")
            
            if self._audio_chunk_count % 20 == 0:
                print(f"🎵 Audio chunk #{self._audio_chunk_count} - stream healthy")
        
        elif message_type == "response.created":
            self._audio_chunk_count = 0
            print("🚀 OpenAI response started")
        
        elif message_type == "response.done":
            response = message_data.get('response', {})
            status = response.get('status', 'unknown')
            if status == 'failed':
                status_details = response.get('status_details', {})
                print(f"❌ OpenAI response FAILED: {status_details}")
                
                # Send error to frontend
                if self.client_ws:
                    try:
                        await self.client_ws.send_json({
                            "type": "error",
                            "error": {
                                "message": f"OpenAI response failed: {status_details}",
                                "details": status_details
                            }
                        })
                    except Exception as e:
                        print(f"Error sending failure message to frontend: {e}")
            else:
                print(f"✅ OpenAI response completed with status: {status}")
        
        elif message_type in ["session.created", "session.updated"]:
            if self.client_ws and message_type == "session.updated":
                print("✅ OpenAI session ready (simplified mode)")
                try:
                    await self.client_ws.send_json({
                        "type": "system",
                        "message": "OpenAI session ready - voice commands enabled (simplified mode)"
                    })
                except Exception as e:
                    print(f"⚠️ Error sending session ready message: {e}")
        
        elif message_type == "error":
            error_details = message_data.get('error', {})
            print(f"❌ OpenAI error: {error_details}")
    
    async def start_proxy(self, client_websocket, user_id: str):
        """Start proxying between client and OpenAI"""
        self.client_ws = client_websocket
        self.user_id = user_id
        
        if not await self.connect_to_openai():
            print("❌ Failed to connect to OpenAI")
            return False
        
        await self.setup_session()
        asyncio.create_task(self._listen_to_openai())
        
        print(f"🎉 OpenAI Realtime proxy started (simplified mode) for user {user_id}")
        return True
    
    async def _listen_to_openai(self):
        """Listen for messages from OpenAI"""
        try:
            while self.openai_ws:
                message = await self.openai_ws.recv()
                message_data = json.loads(message)
                await self.handle_openai_message(message_data)
        except websockets.exceptions.ConnectionClosed:
            print("🔌 OpenAI WebSocket closed")
        except Exception as e:
            print(f"❌ Error listening to OpenAI: {e}")
    
    async def cleanup(self):
        """Clean up connections"""
        if self.openai_ws:
            await self.openai_ws.close()
            print("🧹 Cleaned up OpenAI connection")
