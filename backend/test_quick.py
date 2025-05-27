#!/usr/bin/env python3
"""
Quick test to verify the fixes work - run from backend directory
"""

import json
import os
import sys
from dotenv import load_dotenv

def main():
    print("🧪 Quick VoiceInbox Fix Test")
    print("="*30)
    
    # Load environment
    load_dotenv()
    
    # Test 1: Check OpenAI API key
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key and len(api_key) > 20:
        masked_key = api_key[:8] + "..." + api_key[-4:]
        print(f"✅ OpenAI API key: {masked_key}")
    else:
        print("❌ OpenAI API key missing or invalid")
        return False
    
    # Test 2: Import realtime proxy
    try:
        from realtime_proxy import OpenAIRealtimeProxy
        print("✅ Realtime proxy imports successfully")
    except Exception as e:
        print(f"❌ Import failed: {e}")
        return False
    
    # Test 3: Create tools and test JSON serialization
    try:
        gmail_functions = {"test": lambda: None}
        proxy = OpenAIRealtimeProxy(gmail_functions)
        tools = proxy._create_gmail_tools()
        
        # This will fail if we have 'false' instead of False
        json_str = json.dumps(tools, indent=2)
        parsed = json.loads(json_str)
        
        print(f"✅ Created and serialized {len(tools)} tools")
        
        # Verify no JavaScript booleans
        if 'false' in json_str and '"false"' not in json_str:
            print("❌ Found JavaScript 'false' in JSON")
            return False
        
        print("✅ All tools use correct Python booleans")
        
    except Exception as e:
        print(f"❌ Tool creation/serialization failed: {e}")
        return False
    
    print("\n🎉 All tests passed! Ready to test voice.")
    print("\n📋 Next steps:")
    print("1. Start backend: python3 main.py")
    print("2. Start frontend in another terminal")
    print("3. Test voice input/output")
    
    return True

if __name__ == "__main__":
    main()
