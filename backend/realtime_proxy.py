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
                    "You are VoiceInbox, a helpful Gmail voice assistant. "
                    "Respond naturally and conversationally. When users ask about emails, use the available Gmail functions. "
                    "Keep responses concise but friendly. Always confirm before taking actions like sending emails."
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
                "tools": tools,
                "tool_choice": "auto",
                "temperature": 0.6,
                "max_response_output_tokens": 4096
            }
        }
        
        if self.openai_ws:
            await self.openai_ws.send(json.dumps(session_config))
            print("📤 Sent session config with Gmail tools")
            print(f"🔧 Configured {len(tools)} Gmail functions for OpenAI")
    
    def _create_gmail_tools(self):
        """Convert Gmail functions to OpenAI tool format"""
        # Simplified tool set for testing - just essential functions
        return [
            {
                "type": "function",
                "name": "list_unread",
                "description": "List the user's unread emails",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of emails to return",
                            "default": 10
                        }
                    },
                    "additionalProperties": False
                }
            },
            {
                "type": "function", 
                "name": "search_messages",
                "description": "Search the user's emails using Gmail search syntax",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Gmail search query (e.g., 'from:john urgent', 'is:important')"
                        },
                        "max_results": {
                            "type": "integer", 
                            "description": "Maximum number of results to return",
                            "default": 10
                        }
                    },
                    "required": ["query"],
                    "additionalProperties": False
                }
            }
        ]
    
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
                print(f"📤 Forwarded {message_type} to OpenAI")
        
        # Legacy audio message handling (for backward compatibility)
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
        """Handle message from OpenAI and route to frontend or Gmail functions"""
        message_type = message_data.get("type")
        
        # Forward all OpenAI messages to frontend for proper handling
        if self.client_ws:
            try:
                await self.client_ws.send_json(message_data)
            except Exception as e:
                print(f"⚠️ Error forwarding message to frontend: {e}")
        
        # Handle specific message types for logging/processing
        if message_type == "response.audio.delta":
            print(f"🎧 Forwarded audio chunk: {len(message_data.get('delta', ''))} chars")
        
        elif message_type == "response.created":
            print("🚀 OpenAI response started")
        
        elif message_type == "response.done":
            print("✅ OpenAI response completed")
        
        elif message_type == "response.function_call_arguments.done":
            # Function call completed - execute it
            item_id = message_data.get("item_id")
            call_id = message_data.get("call_id")  # This might be the actual call_id
            function_name = message_data.get("name")
            function_args = message_data.get("arguments")
            
            if function_name and function_args is not None:
                print(f"🔧 Executing Gmail function: {function_name}")
                await self._execute_function(call_id or item_id, function_name, function_args)
        
        elif message_type in ["session.created", "session.updated"]:
            print(f"✅ OpenAI session: {message_type}")
            # Send confirmation to frontend that session is ready
            if self.client_ws and message_type == "session.updated":
                try:
                    await self.client_ws.send_json({
                        "type": "system",
                        "message": "OpenAI session ready - voice commands enabled"
                    })
                except Exception as e:
                    print(f"⚠️ Error sending session ready message: {e}")
        
        elif message_type == "error":
            print(f"❌ OpenAI error: {message_data.get('error', {})}")
        
        else:
            print(f"📨 OpenAI message: {message_type}")
    
    async def _execute_function(self, call_id: str, function_name: str, arguments: str):
        """Execute a Gmail function and send result back to OpenAI"""
        try:
            args = json.loads(arguments) if arguments else {}
            
            # Execute the function with user_id as first parameter
            if function_name in self.gmail_functions:
                func = self.gmail_functions[function_name]
                
                # All Gmail functions expect user_id as first parameter
                # Functions with simple parameters (like max_results)
                if function_name in ['list_unread', 'list_unread_priority']:
                    max_results = args.get('max_results', 20)
                    result = await func(self.user_id, max_results)
                
                # Functions with no additional parameters
                elif function_name in ['abort_current_action', 'narrow_scope_request']:
                    result = await func(self.user_id)
                
                # Functions with complex args that need the full args dict
                else:
                    # Import here to avoid circular imports
                    from main import (
                        SearchMessagesArgs, GetThreadArgs, SummarizeMessagesArgs,
                        SummarizeThreadArgs, CategorizeUnreadArgs, CreateDraftArgs,
                        SendDraftArgs, ScheduleSendArgs, ModifyLabelsArgs,
                        BulkDeleteArgs, MarkReadArgs, CreateCalendarEventArgs
                    )
                    
                    # Map function names to their argument classes
                    arg_classes = {
                        'search_messages': SearchMessagesArgs,
                        'get_thread': GetThreadArgs,
                        'summarize_messages': SummarizeMessagesArgs,
                        'summarize_thread': SummarizeThreadArgs,
                        'categorize_unread': CategorizeUnreadArgs,
                        'create_draft': CreateDraftArgs,
                        'send_draft': SendDraftArgs,
                        'schedule_send': ScheduleSendArgs,
                        'modify_labels': ModifyLabelsArgs,
                        'bulk_delete': BulkDeleteArgs,
                        'mark_read': MarkReadArgs,
                        'create_calendar_event': CreateCalendarEventArgs
                    }
                    
                    if function_name in arg_classes:
                        args_obj = arg_classes[function_name](**args)
                        result = await func(self.user_id, args_obj)
                    else:
                        # Fallback - just pass args as is
                        result = await func(self.user_id, args)
                
                # Send result back to OpenAI
                function_result = {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": json.dumps(result, default=str)
                    }
                }
                
                if self.openai_ws:
                    await self.openai_ws.send(json.dumps(function_result))
                    print(f"📤 Sent function result to OpenAI")
                    
                    # Request a voice response after function execution
                    response_request = {
                        "type": "response.create",
                        "response": {
                            "modalities": ["audio", "text"],
                            "instructions": "Summarize the email results naturally in a conversational way. Keep it brief and friendly."
                        }
                    }
                    await self.openai_ws.send(json.dumps(response_request))
                    print("🎤 Requested voice response for function result")
            else:
                print(f"⚠️ Unknown function: {function_name}")
                
        except Exception as e:
            print(f"❌ Error executing function {function_name}: {e}")
            import traceback
            traceback.print_exc()
            
            # Send error back to OpenAI
            if self.openai_ws:
                error_result = {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": json.dumps({"error": str(e)})
                    }
                }
                await self.openai_ws.send(json.dumps(error_result))
    
    async def start_proxy(self, client_websocket, user_id: str):
        """Start proxying between client and OpenAI"""
        self.client_ws = client_websocket
        self.user_id = user_id
        
        # Connect to OpenAI
        if not await self.connect_to_openai():
            print("❌ Failed to connect to OpenAI")
            return False
        
        # Setup session and wait for confirmation
        await self.setup_session()
        
        # Start listening to OpenAI messages immediately
        asyncio.create_task(self._listen_to_openai())
        
        print(f"🎉 OpenAI Realtime proxy started successfully for user {user_id}")
        return True
    
    async def _listen_to_openai(self):
        """Listen for messages from OpenAI"""
        try:
            while self.openai_ws:
                message = await self.openai_ws.recv()
                message_data = json.loads(message)
                print(f"📨 Raw OpenAI message: {message_data.get('type', 'unknown')}")
                
                # Log audio delta messages specifically
                if message_data.get('type') == 'response.audio.delta':
                    delta_len = len(message_data.get('delta', ''))
                    print(f"🎧 Audio delta received: {delta_len} chars")
                
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
