#!/usr/bin/env python3
"""
Comprehensive test to check if all VoiceInbox components are working
"""

import json
import os
import sys
from dotenv import load_dotenv

def test_configuration():
    """Test if configuration is correct"""
    load_dotenv()
    
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("❌ OPENAI_API_KEY not found")
        return False
    
    if len(api_key) < 20:
        print("❌ OPENAI_API_KEY seems invalid (too short)")
        return False
    
    # Mask the key for security
    masked_key = api_key[:8] + "..." + api_key[-4:]
    print(f"✅ OpenAI API key configured: {masked_key}")
    return True

def test_realtime_proxy_import():
    """Test if realtime proxy can be imported without errors"""
    try:
        # Add backend to path
        backend_path = '/Users/kunal/voice-inbox-mvp/backend'
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
        
        from realtime_proxy import OpenAIRealtimeProxy
        
        # Test creating instance (this will test the boolean fix)
        gmail_functions = {"test": lambda: None}
        proxy = OpenAIRealtimeProxy(gmail_functions)
        
        # Test tool creation (this will test the False/false fix)
        tools = proxy._create_gmail_tools()
        
        print(f"✅ Realtime proxy imports correctly")
        print(f"✅ Created {len(tools)} Gmail tools")
        
        # The real test: try to use the tools in a session config like OpenAI would
        session_config = {
            "type": "session.update",
            "session": {
                "tools": tools,
                "temperature": 0.6
            }
        }
        
        # This would fail if we had 'false' instead of False
        json_str = json.dumps(session_config)
        print("✅ Session config with tools serializes correctly")
        
        return True
        
    except NameError as e:
        if "false" in str(e).lower():
            print(f"❌ Found Python boolean error: {e}")
            print("This means 'false' is used instead of 'False' in the code")
            return False
        else:
            print(f"❌ Realtime proxy import failed: {e}")
            return False
    except Exception as e:
        print(f"❌ Realtime proxy import failed: {e}")
        return False

def test_json_serialization():
    """Test JSON serialization of tools"""
    try:
        backend_path = '/Users/kunal/voice-inbox-mvp/backend'
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
            
        from realtime_proxy import OpenAIRealtimeProxy
        
        gmail_functions = {"test": lambda: None}
        proxy = OpenAIRealtimeProxy(gmail_functions)
        tools = proxy._create_gmail_tools()
        
        # Try to serialize to JSON (this will catch any False/false issues)
        json_str = json.dumps(tools, indent=2)
        print("✅ Tools serialize to JSON correctly")
        
        # Parse back to ensure valid JSON
        parsed = json.loads(json_str)
        print(f"✅ JSON parsing successful: {len(parsed)} tools")
        
        # Check that boolean values are correct
        for tool in parsed:
            params = tool.get('parameters', {})
            if 'additionalProperties' in params:
                additional_props = params['additionalProperties']
                if additional_props is False:
                    print("✅ Boolean 'additionalProperties' correctly set to False")
                else:
                    print(f"⚠️ additionalProperties is {additional_props} (type: {type(additional_props)})")
        
        return True
        
    except Exception as e:
        print(f"❌ JSON serialization failed: {e}")
        return False

def test_websocket_proxy_creation():
    """Test that the proxy can be created without the original error"""
    try:
        backend_path = '/Users/kunal/voice-inbox-mvp/backend'
        if backend_path not in sys.path:
            sys.path.insert(0, backend_path)
            
        from realtime_proxy import OpenAIRealtimeProxy
        
        # Simulate the same conditions as main.py
        GMAIL_FUNCTIONS = {
            "search_messages": lambda: None,
            "list_unread": lambda: None,
        }
        
        # This would fail with "name 'false' is not defined" if not fixed
        proxy = OpenAIRealtimeProxy(GMAIL_FUNCTIONS)
        tools = proxy._create_gmail_tools()
        
        # Simulate sending session config like the real app does
        session_config = {
            "type": "session.update", 
            "session": {
                "modalities": ["text", "audio"],
                "tools": tools,
                "tool_choice": "auto"
            }
        }
        
        # This is where the error would occur
        json_message = json.dumps(session_config)
        print("✅ Proxy creation and session config successful")
        print(f"✅ Session config JSON length: {len(json_message)} chars")
        
        return True
        
    except Exception as e:
        print(f"❌ Websocket proxy creation failed: {e}")
        return False

def main():
    """Run all tests"""
    print("🧪 Testing VoiceInbox Configuration")
    print("=" * 40)
    
    tests = [
        ("Configuration", test_configuration),
        ("Realtime Proxy Import", test_realtime_proxy_import),
        ("JSON Serialization", test_json_serialization),
        ("WebSocket Proxy Creation", test_websocket_proxy_creation)
    ]
    
    results = []
    for test_name, test_func in tests:
        print(f"\n🔍 Testing {test_name}...")
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 40)
    print("📊 Test Results:")
    
    all_passed = True
    for test_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {test_name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 40)
    if all_passed:
        print("🎉 All tests passed! The 'false' error is fixed.")
        print("\n📋 Next Steps:")
        print("1. Kill existing backend: pkill -f uvicorn")
        print("2. Restart backend: cd backend && python main.py")
        print("3. Test voice input in browser")
        print("4. Look for 'OpenAI response started' in console")
    else:
        print("❌ Some tests failed. Please fix issues before testing.")
        
    return all_passed

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
