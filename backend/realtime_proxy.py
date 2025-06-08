import asyncio
import json
import websockets
import os
import time
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
        self.pending_audio_response = False  # Track if we're waiting for audio response
        
    async def connect_to_openai(self):
        """Connect to OpenAI Realtime API"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        try:
            print("🔗 Connecting to OpenAI Realtime API...")
            self.openai_ws = await websockets.connect(
                "wss://api.openai.com/v1/realtime?model=gpt-4o-mini-realtime-preview-2024-12-17",
                extra_headers=headers,
                max_size=1024*1024*16,
                ping_interval=30,  # Send ping every 30 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
                close_timeout=10   # Wait 10 seconds for close
            )
            print("✅ Connected to OpenAI Realtime API (gpt-4o-mini-realtime-preview-2024-12-17)")
            return True
        except Exception as e:
            print(f"❌ OpenAI connection failed: {e}")
            return False
    
    async def setup_session(self):
        """Configure OpenAI session with Gmail tools - optimized for audio responses"""
        tools = self._create_gmail_tools()
        
        session_config = {
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": (
                    "You are VoiceInbox, a helpful Gmail assistant. "
                    "When users ask about their emails, call the appropriate function and then provide a natural, conversational response. "
                    "Be concise but helpful in your audio responses."
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
                    "prefix_padding_ms": 200,
                    "silence_duration_ms": 300
                },
                "tools": tools,
                "tool_choice": "auto",
                "temperature": 0.6,
                "max_response_output_tokens": 800  # CORRECTED: For session.update use max_response_output_tokens
            }
        }
        
        if self.openai_ws:
            await self.openai_ws.send(json.dumps(session_config))
            print("📤 Sent session config with Gmail tools")
            print(f"🔧 Configured {len(tools)} Gmail functions for OpenAI")
            print(f"🎯 Tools available: {[tool['name'] for tool in tools]}")
            print(f"💬 Instructions: {session_config['session']['instructions'][:100]}...")
            print(f"🎯 VAD optimized: 300ms silence detection, 200ms padding for FASTER response")
    
    def _create_gmail_tools(self):
        """Convert Gmail functions to OpenAI tool format"""
        # Expanded functions for better email management
        return [
            {
                "type": "function",
                "name": "count_unread_emails",
                "description": "REQUIRED: Call this function whenever user asks 'how many unread emails', 'unread count', 'how many emails', or similar counting questions. Returns exact number of unread emails.",
                "parameters": {
                    "type": "object",
                    "properties": {},
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "list_unread",
                "description": "List actual unread email details (subjects, senders) - use when user wants to see email content",
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
                "description": "Search emails using Gmail search syntax. For important emails, try multiple strategies: 'is:starred' (user-starred), 'from:boss@company.com' (from specific important people), 'subject:urgent OR subject:important' (urgent content), or 'label:important' (Gmail's auto-importance). You can also search by sender names.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Gmail search query. Examples: 'from:john urgent', 'is:starred', 'label:important', 'subject:invoice'"
                        },
                        "max_results": {
                            "type": "integer", 
                            "description": "Maximum number of results to return",
                            "default": 5
                        }
                    },
                    "required": ["query"],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "create_draft",
                "description": "Create or send email drafts. Use this when user asks to draft, compose, write, or send emails",
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
                            "description": "Email subject line"
                        },
                        "body_markdown": {
                            "type": "string",
                            "description": "Email body content (can include markdown)"
                        },
                        "send": {
                            "type": "boolean",
                            "description": "Whether to send immediately (true) or just create draft (false)",
                            "default": False
                        },
                        "cc": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "CC recipients",
                            "default": []
                        }
                    },
                    "required": ["to", "subject", "body_markdown"],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "mark_read",
                "description": "Mark emails as read. Use when user says 'mark as read' or wants to clear unread status",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "msg_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of message IDs to mark as read"
                        }
                    },
                    "required": ["msg_ids"],
                    "additionalProperties": False
                }
            },
            {
                "type": "function",
                "name": "categorize_unread",
                "description": "Categorize and analyze unread emails by urgency and type. Use for email organization questions",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "max_results": {
                            "type": "integer",
                            "description": "Maximum number of emails to analyze",
                            "default": 20
                        }
                    },
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
                # Only log important messages
                if message_type in ["input_audio_buffer.commit", "response.create"]:
                    print(f"📤 Forwarded {message_type} to OpenAI")
                
                # For push-to-talk mode, manually create response after commit
                if message_type == "input_audio_buffer.commit":
                    print("📱 Audio committed - creating response for push-to-talk mode")
                    # Create response immediately since user manually stopped recording
                    response_message = {
                        "type": "response.create"
                    }
                    await self.openai_ws.send(json.dumps(response_message))
                    print("🤖 Response created for push-to-talk interaction")
        
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
        
        # Only forward essential messages to frontend to prevent flooding
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
        
        # Handle specific message types for processing (minimal logging)
        if message_type == "response.audio.delta":
            # Monitor audio stream health occasionally
            if hasattr(self, '_audio_chunk_count'):
                self._audio_chunk_count += 1
            else:
                self._audio_chunk_count = 1
                print("🎵 Audio streaming started")
            
            # Log every 20th chunk to monitor stream health without spam
            if self._audio_chunk_count % 20 == 0:
                print(f"🎵 Audio chunk #{self._audio_chunk_count} - stream healthy")
        
        elif message_type == "response.created":
            # Reset audio chunk counter for new response
            self._audio_chunk_count = 0
            
            # Measure time from commit to response creation
            if hasattr(self, '_commit_time'):
                response_creation_time = time.time()
                creation_latency = (response_creation_time - self._commit_time) * 1000
                print(f"⚡ COMMIT TO RESPONSE: {creation_latency:.0f}ms (faster = better)")
            pass  # Logging handled in _listen_to_openai
        
        elif message_type == "conversation.item.created":
            print(f"📝 Conversation item created: {message_data.get('item', {}).get('type', 'unknown')}")
            
        elif message_type == "response.output_item.added":
            item = message_data.get('item', {})
            print(f"📝 Response output item added: {item.get('type', 'unknown')}")
            if item.get('type') == 'message':
                content = item.get('content', [])
                print(f"📝 Message item added with {len(content)} content items")
                for i, content_item in enumerate(content):
                    print(f"    Content {i}: {content_item.get('type', 'unknown')}")
        
        elif message_type == "response.done":
            # Log the full response to debug why no audio is being returned
            response = message_data.get('response', {})
            output_items = response.get('output', [])
            
            print(f"🎙️ Response done. Output items: {len(output_items)}")
            for i, item in enumerate(output_items):
                item_type = item.get('type', 'unknown')
                print(f"  Item {i}: type={item_type}")
                if item_type == 'message':
                    role = item.get('role', 'unknown')
                    content = item.get('content', [])
                    print(f"    Role: {role}, Content items: {len(content)}")
                    for j, content_item in enumerate(content):
                        content_type = content_item.get('type', 'unknown')
                        print(f"      Content {j}: type={content_type}")
                        if content_type == 'audio':
                            print(f"        Audio found!")
                        elif content_type == 'text':
                            text_content = content_item.get('text', '')[:50]
                            print(f"        Text: {text_content}...")
            
            # Reset pending audio response flag when any response completes
            if hasattr(self, 'pending_audio_response'):
                self.pending_audio_response = False
            
            # Reset timing variables for next interaction
            if hasattr(self, '_speech_start_time'):
                delattr(self, '_speech_start_time')
            if hasattr(self, '_first_audio_time'):
                delattr(self, '_first_audio_time')
            
            if not any(item.get('type') == 'message' for item in output_items):
                print("⚠️ No message items found in response!")
            
            pass  # Logging handled in _listen_to_openai
        
        elif message_type == "input_audio_buffer.speech_started":
            print("🎤 User started speaking")
            # Start timing for latency measurement
            if not hasattr(self, '_speech_start_time'):
                self._speech_start_time = time.time()
        
        elif message_type == "input_audio_buffer.committed":
            if hasattr(self, '_speech_start_time'):
                commit_time = time.time()
                speech_duration = (commit_time - self._speech_start_time) * 1000
                print(f"⏱️ User spoke for {speech_duration:.0f}ms before VAD cutoff")
                # Start timing for response latency
                self._commit_time = commit_time
        
        elif message_type == "response.audio.delta":
            # First audio chunk - measure total latency
            if hasattr(self, '_speech_start_time') and not hasattr(self, '_first_audio_time'):
                self._first_audio_time = time.time()
                total_latency = (self._first_audio_time - self._speech_start_time) * 1000
                print(f"⚡ TOTAL LATENCY: {total_latency:.0f}ms (target: <200ms - improved from 500ms VAD)")
                if total_latency > 200:
                    print(f"⚠️ Latency above new target! {total_latency:.0f}ms > 200ms")
                else:
                    print(f"✅ Excellent latency! {total_latency:.0f}ms < 200ms")
        
        elif message_type == "conversation.item.input_audio_transcription.completed":
            transcription = message_data.get('transcript', '')
            print(f"🎤 User said: '{transcription}'")
            
        elif message_type == "response.function_call_arguments.done":
            # Function call completed - execute it
            start_time = time.time()  # Performance timing
            
            item_id = message_data.get("item_id")
            call_id = message_data.get("call_id")
            function_name = message_data.get("name")
            function_args = message_data.get("arguments")
            
            print(f"🔧 Function call detected: {function_name} with args: {function_args}")
            
            if function_name and function_args is not None:
                print(f"🔧 Executing Gmail function: {function_name}")
                await self._execute_function(call_id or item_id, function_name, function_args)
                
                # Performance logging
                execution_time = (time.time() - start_time) * 1000  # Convert to ms
                print(f"⚡ Function {function_name} completed in {execution_time:.0f}ms")
        
        elif message_type.startswith("response.function_call"):
            print(f"🔧 Function call event: {message_type}")
            print(f"🔍 Full message data: {json.dumps(message_data, indent=2)}")
            if message_type == "response.function_call_arguments.delta":
                function_name = message_data.get('name', 'unknown')
                args_delta = message_data.get('delta', '')
                print(f"🔧 Function call in progress: {function_name}, args: {args_delta}")
        
        elif message_type in ["session.created", "session.updated"]:
            # Send confirmation to frontend that session is ready
            if self.client_ws and message_type == "session.updated":
                print("✅ OpenAI session ready")
                try:
                    await self.client_ws.send_json({
                        "type": "system",
                        "message": "OpenAI session ready - voice commands enabled"
                    })
                except Exception as e:
                    print(f"⚠️ Error sending session ready message: {e}")
        
        elif message_type == "error":
            print(f"❌ OpenAI error: {message_data.get('error', {})}")
    
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
                elif function_name in ['abort_current_action', 'narrow_scope_request', 'count_unread_emails', 'get_email_counts']:
                    result = await func(self.user_id)
                
                # Functions with simple parameters (like max_results)
                elif function_name in ['categorize_unread']:
                    try:
                        import importlib
                        main_module = importlib.import_module('main')
                        CategorizeUnreadArgs = getattr(main_module, 'CategorizeUnreadArgs')
                        max_results = args.get('max_results', 20)
                        result = await func(self.user_id, CategorizeUnreadArgs(max_results=max_results))
                    except (ImportError, AttributeError) as e:
                        print(f"Warning: Could not import CategorizeUnreadArgs: {e}")
                        # Fallback: call with max_results directly
                        max_results = args.get('max_results', 20)
                        result = await func(self.user_id, max_results)
                
                # Functions with complex args that need the full args dict
                else:
                    # Import here to avoid circular imports - use dynamic import
                    try:
                        import importlib
                        main_module = importlib.import_module('main')
                        SearchMessagesArgs = getattr(main_module, 'SearchMessagesArgs')
                        GetThreadArgs = getattr(main_module, 'GetThreadArgs')
                        SummarizeMessagesArgs = getattr(main_module, 'SummarizeMessagesArgs')
                        SummarizeThreadArgs = getattr(main_module, 'SummarizeThreadArgs')
                        CategorizeUnreadArgs = getattr(main_module, 'CategorizeUnreadArgs')
                        CreateDraftArgs = getattr(main_module, 'CreateDraftArgs')
                        SendDraftArgs = getattr(main_module, 'SendDraftArgs')
                        ScheduleSendArgs = getattr(main_module, 'ScheduleSendArgs')
                        ModifyLabelsArgs = getattr(main_module, 'ModifyLabelsArgs')
                        BulkDeleteArgs = getattr(main_module, 'BulkDeleteArgs')
                        MarkReadArgs = getattr(main_module, 'MarkReadArgs')
                        CreateCalendarEventArgs = getattr(main_module, 'CreateCalendarEventArgs')
                    except ImportError as e:
                        print(f"Warning: Could not import from main module: {e}")
                        raise
                    
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
                
                # Issue 6 Fix: Use consistent truncation function
                try:
                    import importlib
                    main_module = importlib.import_module('main')
                    truncate_large_result = getattr(main_module, 'truncate_large_result')
                    result_str = truncate_large_result(result, 4000)  # 4KB limit for audio responses
                    
                    original_size = len(json.dumps(result, default=str))
                    if len(result_str) < original_size:
                        print(f"⚠️ Truncated large result for {function_name}: {original_size} -> {len(result_str)} chars")
                except (ImportError, AttributeError):
                    # Fallback to original logic if import fails
                    result_str = json.dumps(result, default=str)
                    if len(result_str) > 4000:
                        result_str = result_str[:4000] + '... (truncated)'
                        print(f"⚠️ Fallback truncation for {function_name}")
                
                # Send result back to OpenAI
                function_result = {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": result_str
                    }
                }
                
                if self.openai_ws:
                    await self.openai_ws.send(json.dumps(function_result))
                    print(f"📤 Sent function result to OpenAI: {json.dumps(result, default=str)[:100]}...")
                    
                    # CRITICAL: OpenAI Realtime API requires explicit response creation after function calls
                    # This is different from regular chat API - function calls don't automatically continue
                    if not self.pending_audio_response:
                        self.pending_audio_response = True
                        
                        # CRITICAL FIX: Use session defaults to avoid conflicts
                        audio_response = {
                            "type": "response.create"
                            # Let it inherit session settings:
                            # - temperature: 0.6 (meets minimum requirement)
                            # - modalities: ["text", "audio"]
                            # - max_response_output_tokens: 800
                        }
                        await self.openai_ws.send(json.dumps(audio_response))
                        print(f"🎤 Response created with session defaults (no conflicts)")
                        
                        # EMERGENCY TIMEOUT: Reset if no response within 10 seconds
                        asyncio.create_task(self._emergency_timeout_reset(10.0))
                    else:
                        print(f"⏳ Audio response already pending, skipping duplicate")
                
                print(f"✅ Function {function_name} completed - OpenAI generating LIGHTNING-FAST response")
            else:
                print(f"⚠️ Unknown function: {function_name}")
                
        except Exception as e:
            print(f"❌ Error executing function {function_name}: {e}")
            import traceback
            traceback.print_exc()
            
            # CRITICAL FIX: Always reset pending response on errors
            self.pending_audio_response = False
            
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
        """Listen for messages from OpenAI with automatic reconnection"""
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                while self.openai_ws:
                    message = await self.openai_ws.recv()
                    message_data = json.loads(message)
                    
                    # Only log essential message types to reduce noise
                    message_type = message_data.get('type', 'unknown')
                    if message_type == 'error':
                        print(f"❌ OpenAI error: {message_type}")
                    elif message_type == 'response.created':
                        # Check if it's a function call response
                        response = message_data.get('response', {})
                        if response.get('output', []):
                            print("🎤 Creating voice response...")
                    elif message_type == 'response.done':
                        # Only log if it's the final voice response
                        response = message_data.get('response', {})
                        if any(item.get('type') == 'message' for item in response.get('output', [])):
                            print("✅ Voice response completed")
                    
                    await self.handle_openai_message(message_data)
                    
            except websockets.exceptions.ConnectionClosed as e:
                print(f"🔌 OpenAI WebSocket closed: {e}")
                retry_count += 1
                if retry_count < max_retries:
                    print(f"🔄 Attempting to reconnect to OpenAI ({retry_count}/{max_retries})...")
                    if await self.connect_to_openai():
                        await self.setup_session()
                        print("✅ OpenAI connection recovered")
                        retry_count = 0  # Reset on successful reconnection
                    else:
                        await asyncio.sleep(2 ** retry_count)  # Exponential backoff
                else:
                    print("❌ Failed to reconnect to OpenAI after multiple attempts")
                    break
                    
            except Exception as e:
                print(f"❌ Error listening to OpenAI: {e}")
                break
    
    async def _emergency_timeout_reset(self, timeout_seconds: float):
        """Emergency timeout to prevent stuck responses"""
        await asyncio.sleep(timeout_seconds)
        if self.pending_audio_response:
            print(f"❗ EMERGENCY TIMEOUT: Resetting stuck response after {timeout_seconds}s")
            self.pending_audio_response = False
            
            # Send emergency message to frontend
            if self.client_ws:
                try:
                    await self.client_ws.send_json({
                        "type": "error",
                        "error": {"message": "Response timeout - please try again"},
                        "emergency_reset": True
                    })
                except Exception as e:
                    print(f"⚠️ Error sending emergency reset: {e}")

    async def cleanup(self):
        """Clean up connections"""
        if self.openai_ws:
            await self.openai_ws.close()
            print("🧹 Cleaned up OpenAI connection")
