#!/usr/bin/env python3

import asyncio
import sys
import os

# Add the backend directory to the path so we can import modules
sys.path.append('/Users/kunal/voice-inbox-mvp/backend')

from realtime_proxy import OpenAIRealtimeProxy

# Mock Gmail functions for testing (we'll use your real ones later)
MOCK_GMAIL_FUNCTIONS = {
    "list_unread": lambda user_id: {"messages": ["Test email 1", "Test email 2"]},
    "search_messages": lambda user_id, args: {"messages": [f"Found: {args.query}"]},
    "create_draft": lambda user_id, args: {"id": "draft_123", "status": "created"}
}

async def test_proxy_setup():
    """Test that the proxy can be created and configured"""
    print("🧪 Testing OpenAI Realtime Proxy Setup")
    print("=" * 40)
    
    try:
        # Create proxy with mock Gmail functions
        proxy = OpenAIRealtimeProxy(MOCK_GMAIL_FUNCTIONS)
        print("✅ Proxy created successfully")
        
        # Test OpenAI connection
        connected = await proxy.connect_to_openai()
        if not connected:
            print("❌ Failed to connect to OpenAI")
            return False
        
        # Test session setup
        await proxy.setup_session()
        print("✅ Session configured with Gmail tools")
        
        # Test tool creation
        tools = proxy._create_gmail_tools()
        print(f"✅ Created {len(tools)} Gmail tools:")
        for tool in tools:
            print(f"   - {tool['name']}: {tool['description']}")
        
        # Cleanup
        await proxy.cleanup()
        
        print("\n🎉 Proxy setup test PASSED!")
        return True
        
    except Exception as e:
        print(f"❌ Proxy setup test FAILED: {e}")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_proxy_setup())
    if success:
        print("\n🚀 Ready to integrate with your existing WebSocket!")
    else:
        print("\n🛠️ Need to fix issues before proceeding.")
