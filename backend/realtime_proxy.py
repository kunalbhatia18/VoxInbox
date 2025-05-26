import asyncio
import json
import websockets
import os
from typing import Optional, Dict, Any
from dotenv import load_dotenv

load_dotenv()

class OpenAIRealtimeProxy:
    """Proxy between frontend WebSocket and OpenAI Realtime API"""
    
    def __init__(self, gmail_functions: Dict):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found")
        
        self.gmail_functions = gmail_functions  # Reference to existing Gmail functions
        self.openai_ws: Optional[websockets.WebSocketClientProtocol] = None
        self.client_ws: Optional[Any] = None  # Frontend WebSocket
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
        """Configure OpenAI session with Gmail tools"""
        # Convert Gmail functions to OpenAI tool format
        tools = self._create_gmail_tools()
        
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": (
                    "You are VoiceInbox, a helpful email assistant. "
                    "Help users manage Gmail through voice commands. "
                    "Be concise and natural. When users ask about emails, use the available functions. "
                    "Always confirm actions before executing them."
                ),
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "input_audio_transcription": {"model": "whisper-1"},
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                },
                "tools": tools,
                "tool_choice": "auto",
                "temperature": 0.7
            }
        }
        
        if self.openai_ws:
            await self.openai_ws.send(json.dumps(session_config))
            print("📤 Sent session config with Gmail tools")
    
    def _create_gmail_tools(self):
        """Convert Gmail functions to OpenAI tool format"""
        # For now, let's add just a few key functions
        return [
            {
                "type": "function",
                "name": "list_unread",
                "description": "List unread emails",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of emails to return",
                            "default": 10
                        }
                    }
                }
            },
            {
                "type": "function", 
                "name": "search_messages",
                "description": "Search emails by query",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Search query (e.g., 'from:john urgent')"
                        },
                        "max_results": {
                            "type": "integer", 
                            "description": "Maximum results",
                            "default": 10
                        }
                    },
                    "required": ["query"]
                }
            },
            {
                "type": "function",
                "name": "create_draft", 
                "description": "Create email draft",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "to": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Recipient email addresses"
                        },
                        "subject": {
                            "type": "string",
                            "description": "Email subject"
                        },
                        "body_markdown": {
                            "type": "string", 
                            "description": "Email body in markdown"
                        }
                    },
                    "required": ["to", "subject", "body_markdown"]
                }
            }
        ]
    
    async def handle_client_message(self, message_data: Dict):
        """Handle message from frontend and route appropriately"""
        message_type = message_data.get("type")
        
        if message_type == "audio":
            # Forward audio to OpenAI
            if self.openai_ws:
                openai_message = {
                    "type": "input_audio_buffer.append",
                    "audio": message_data.get("audio", "")
                }
                await self.openai_ws.send(json.dumps(openai_message))
                print("🎤 Forwarded audio to OpenAI")
        
        elif message_type == "conversation.item.create":
            # Forward conversation item to OpenAI
            if self.openai_ws:
                await self.openai_ws.send(json.dumps(message_data))
                print("💬 Forwarded conversation item to OpenAI")
    
    async def handle_openai_message(self, message_data: Dict):
        """Handle message from OpenAI and route to frontend or Gmail functions"""
        message_type = message_data.get("type")
        
        if message_type == "response.audio.delta":
            # Forward audio response to frontend
            if self.client_ws:
                await self.client_ws.send_json({
                    "type": "audio_response",
                    "audio": message_data.get("delta", "")
                })
        
        elif message_type == "response.function_call_delta":
            # Handle Gmail function calls
            function_name = message_data.get("name")
            if function_name in self.gmail_functions:
                print(f"🔧 Executing Gmail function: {function_name}")
                # We'll implement function execution in the next step
        
        elif message_type in ["session.created", "session.updated"]:
            print(f"✅ OpenAI session: {message_type}")
        
        else:
            print(f"📨 OpenAI message: {message_type}")
    
    async def start_proxy(self, client_websocket, user_id: str):
        """Start proxying between client and OpenAI"""
        self.client_ws = client_websocket
        self.user_id = user_id
        
        # Connect to OpenAI
        if not await self.connect_to_openai():
            return False
        
        # Setup session
        await self.setup_session()
        
        # Start listening to OpenAI messages
        asyncio.create_task(self._listen_to_openai())
        
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
