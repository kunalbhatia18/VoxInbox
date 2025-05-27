#!/usr/bin/env python3
"""
Test script to verify OpenAI Realtime API is responding correctly
"""

import asyncio
import json
import websockets
import os
from dotenv import load_dotenv

load_dotenv()

async def test_openai_realtime():
    """Test OpenAI Realtime API connection and response"""
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY not found")
        return
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "OpenAI-Beta": "realtime=v1"
    }
    
    try:
        print("🔗 Connecting to OpenAI Realtime API...")
        
        async with websockets.connect(
            "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
            extra_headers=headers,
            max_size=1024*1024*16
        ) as ws:
            print("✅ Connected to OpenAI Realtime API")
            
            # Send session configuration
            session_config = {
                "type": "session.update",
                "session": {
                    "modalities": ["text", "audio"],
                    "instructions": "You are a helpful assistant. Respond briefly.",
                    "voice": "alloy",
                    "input_audio_format": "pcm16",
                    "output_audio_format": "pcm16",
                    "temperature": 0.6
                }
            }
            
            await ws.send(json.dumps(session_config))
            print("📤 Sent session config")
            
            # Wait for session acknowledgment
            message_count = 0
            while message_count < 10:  # Process up to 10 messages
                try:
                    message = await asyncio.wait_for(ws.recv(), timeout=5.0)
                    data = json.loads(message)
                    print(f"📨 Received: {data.get('type', 'unknown')}")
                    
                    if data.get('type') == 'session.updated':
                        print("✅ Session configured successfully")
                        
                        # Send a text conversation item
                        conversation_item = {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "message",
                                "role": "user",
                                "content": [
                                    {
                                        "type": "input_text",
                                        "text": "Hello! Can you say hello back with voice?"
                                    }
                                ]
                            }
                        }
                        
                        await ws.send(json.dumps(conversation_item))
                        print("📤 Sent conversation item")
                        
                        # Request response
                        response_request = {
                            "type": "response.create",
                            "response": {
                                "modalities": ["text", "audio"]
                            }
                        }
                        
                        await ws.send(json.dumps(response_request))
                        print("📤 Requested response")
                    
                    elif data.get('type') == 'response.audio.delta':
                        audio_len = len(data.get('delta', ''))
                        print(f"🎧 Audio response received: {audio_len} chars")
                        
                    elif data.get('type') == 'response.done':
                        print("✅ Response complete - OpenAI is working!")
                        break
                        
                    elif data.get('type') == 'error':
                        print(f"❌ OpenAI Error: {data.get('error', {})}")
                        break
                    
                    message_count += 1
                    
                except asyncio.TimeoutError:
                    print("⏰ Timeout waiting for OpenAI response")
                    break
            
            print("🧪 Test completed")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_openai_realtime())
