#!/usr/bin/env python3
"""
OpenAI Realtime API Cost Analyzer & Optimizer
Works within API constraints (temp >= 0.6, etc.)
"""

import json
import base64
import time

class RealtimeCostAnalyzer:
    """Analyze your OpenAI Realtime API costs from console logs"""
    
    # OpenAI Realtime API Pricing (as of Dec 2024)
    PRICING = {
        "audio_input_per_second": 0.001,   # $0.06/minute
        "audio_output_per_second": 0.004,  # $0.24/minute
        "text_input_per_token": 0.000005,  # $5/1M tokens
        "text_output_per_token": 0.00002   # $20/1M tokens
    }
    
    def analyze_session(self, console_logs):
        """Analyze costs from your console logs"""
        
        # Parse audio inputs
        audio_inputs = []
        for line in console_logs:
            if "Sent audio data to OpenAI" in line and "characters" in line:
                # Extract base64 length
                chars = int(line.split()[5])
                # Convert to approximate seconds (base64 of 16-bit PCM at 24kHz)
                bytes_len = chars * 0.75  # base64 to bytes
                samples = bytes_len / 2   # 16-bit = 2 bytes per sample
                seconds = samples / 24000  # 24kHz sample rate
                audio_inputs.append(seconds)
        
        # Count responses
        responses = console_logs.count("response.created")
        
        # Estimate output audio (conservative: 10 seconds per response)
        output_seconds = responses * 10
        
        # Calculate costs
        input_cost = sum(audio_inputs) * self.PRICING["audio_input_per_second"]
        output_cost = output_seconds * self.PRICING["audio_output_per_second"]
        
        # Text costs (rough estimate)
        text_cost = responses * 500 * self.PRICING["text_output_per_token"]  # ~500 tokens per response
        
        total = input_cost + output_cost + text_cost
        
        return {
            "inputs": len(audio_inputs),
            "input_seconds": sum(audio_inputs),
            "responses": responses,
            "output_seconds": output_seconds,
            "input_cost": input_cost,
            "output_cost": output_cost,
            "text_cost": text_cost,
            "total_cost": total
        }

def create_optimized_config():
    """Create the most cost-optimized configuration within API constraints"""
    
    config = '''
# COST-OPTIMIZED OpenAI Realtime API Configuration
# Reduces costs by ~70% while staying within API limits

# 1. SESSION CONFIGURATION
session_config = {
    "type": "session.update",
    "session": {
        "modalities": ["text", "audio"],
        "instructions": "Brief Gmail assistant. Max 15 words per response.",
        "voice": "alloy",
        "input_audio_format": "pcm16",
        "output_audio_format": "pcm16",
        "input_audio_transcription": {
            "model": "whisper-1"
        },
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.9,         # Very high - reduces false triggers
            "prefix_padding_ms": 100,  # Minimal padding
            "silence_duration_ms": 400 # Quick cutoff
        },
        "tools": minimal_tools,  # Only essential tools
        "tool_choice": "required",  # Force tool use when applicable
        "temperature": 0.6,  # Minimum allowed
        "max_response_output_tokens": 50  # Absolute minimum useful
    }
}

# 2. MINIMAL TOOL SET (reduces token usage)
minimal_tools = [
    {
        "type": "function",
        "name": "count_unread_emails",
        "description": "Count unread",
        "parameters": {"type": "object", "properties": {}}
    },
    {
        "type": "function",
        "name": "list_unread",
        "description": "List emails",
        "parameters": {
            "type": "object",
            "properties": {
                "max_results": {"type": "integer", "default": 3}
            }
        }
    }
]

# 3. RESPONSE OPTIMIZATION
def create_minimal_response(function_result):
    """Force minimal responses"""
    return {
        "type": "response.create",
        "response": {
            "modalities": ["audio"],  # Audio only (no text tokens)
            "instructions": f"Say only: '{function_result}'. Nothing else."
        }
    }

# 4. CLIENT-SIDE OPTIMIZATIONS
# - Implement silence detection to auto-stop recording
# - Limit recording to 10 seconds max
# - Show visual feedback to encourage short queries
'''
    
    return config

def calculate_savings():
    """Show potential cost savings"""
    
    print("""
💰 COST COMPARISON (per 100 interactions/day)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CURRENT SETUP:
• Input: 20 sec/interaction × $0.001/sec = $0.02
• Output: 30 sec/interaction × $0.004/sec = $0.12
• Tokens: ~2000 tokens × $0.00002 = $0.04
• Per interaction: $0.18
• Daily (100 interactions): $18
• Monthly: $540 😱

OPTIMIZED SETUP:
• Input: 3 sec/interaction × $0.001/sec = $0.003
• Output: 5 sec/interaction × $0.004/sec = $0.02
• Tokens: ~200 tokens × $0.00002 = $0.004
• Per interaction: $0.027
• Daily (100 interactions): $2.70
• Monthly: $81 ✅

SAVINGS: 85% reduction! ($459/month saved)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

def main():
    print("🔍 OpenAI Realtime API Cost Analysis")
    print("=" * 50)
    
    # Analyze the provided logs
    sample_logs = """
    App.tsx:38 🎤 Sent audio data to OpenAI 229376 characters
    App.tsx:38 🎤 Sent audio data to OpenAI 513368 characters
    App.tsx:38 🎤 Sent audio data to OpenAI 81920 characters
    App.tsx:38 🎤 Sent audio data to OpenAI 245760 characters
    App.tsx:236 🚀 response.created
    App.tsx:236 🚀 response.created
    App.tsx:236 🚀 response.created
    App.tsx:236 🚀 response.created
    App.tsx:236 🚀 response.created
    """
    
    analyzer = RealtimeCostAnalyzer()
    results = analyzer.analyze_session(sample_logs)
    
    print(f"""
📊 Your Session Analysis:
• Audio inputs: {results['inputs']}
• Total input time: {results['input_seconds']:.1f} seconds
• AI responses: {results['responses']}
• Estimated output time: {results['output_seconds']} seconds

💸 Cost Breakdown:
• Input audio: ${results['input_cost']:.3f}
• Output audio: ${results['output_cost']:.3f}
• Text/tokens: ${results['text_cost']:.3f}
• TOTAL: ${results['total_cost']:.3f}

Cost per interaction: ${results['total_cost']/results['inputs']:.3f}
""")
    
    print("\n" + "=" * 50)
    calculate_savings()
    
    print("\n🛠️ IMMEDIATE ACTIONS:")
    print("1. Update max_response_output_tokens to 50")
    print("2. Shorten instructions to <20 words")
    print("3. Increase VAD threshold to 0.9")
    print("4. Reduce tool descriptions to 2-3 words")
    print("5. Add client-side recording limits")
    
    print("\n💡 ALTERNATIVE: Hybrid Approach")
    print("For 95% cost savings, consider:")
    print("• Whisper API: $0.006/minute (10x cheaper)")
    print("• GPT-4o-mini: $0.15/1M tokens (130x cheaper)")
    print("• TTS API: $15/1M chars (still expensive but more control)")

if __name__ == "__main__":
    main()
