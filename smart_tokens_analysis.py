#!/usr/bin/env python3
"""
Smart Token Limits - Cost Analysis
Shows how smart limits save money while preventing cut-offs
"""

def analyze_smart_tokens():
    print("🎯 Smart Token Limits Analysis")
    print("=" * 60)
    
    # Function categories with examples
    functions = {
        "Short (100 tokens)": {
            "functions": ["count_unread_emails", "mark_read", "abort_current_action"],
            "example": "You have 4 unread emails.",
            "audio_seconds": 3,
            "actual_tokens": 10
        },
        "Medium (300 tokens)": {
            "functions": ["list_unread", "list_unread_priority", "search_messages"],
            "example": "You have emails from: John about the project, Sarah about the meeting, and 2 newsletters.",
            "audio_seconds": 10,
            "actual_tokens": 50
        },
        "Long (800 tokens)": {
            "functions": ["summarize_messages", "summarize_thread", "get_thread"],
            "example": "John's email discusses the project deadline. He needs approval by tomorrow for postponing to next week due to integration issues...",
            "audio_seconds": 25,
            "actual_tokens": 200
        }
    }
    
    print("\n📊 TOKEN LIMITS BY FUNCTION TYPE\n")
    
    total_old_cost = 0
    total_new_cost = 0
    
    for category, info in functions.items():
        print(f"{category}:")
        print(f"  Functions: {', '.join(info['functions'])}")
        print(f"  Example: \"{info['example'][:60]}...\"")
        print(f"  Duration: ~{info['audio_seconds']} seconds")
        
        # Cost calculation
        audio_cost = info['audio_seconds'] * 0.004  # $0.24/min output
        token_cost = info['actual_tokens'] * 0.00002  # $20/1M tokens
        total_cost = audio_cost + token_cost
        
        # Old cost (if everything was 4096 tokens with long responses)
        old_audio_seconds = 45  # Everything was verbose
        old_tokens = 300  # Always used many tokens
        old_cost = old_audio_seconds * 0.004 + old_tokens * 0.00002
        
        print(f"  Cost: ${total_cost:.3f} (was ${old_cost:.3f} with 4096 limit)")
        print(f"  Savings: {((old_cost - total_cost) / old_cost * 100):.0f}%")
        print()
        
        total_old_cost += old_cost
        total_new_cost += total_cost
    
    print("\n💰 DAILY COST COMPARISON (100 queries)")
    print("=" * 40)
    
    # Assume mix: 40% short, 40% medium, 20% long queries
    daily_short = 40 * (3 * 0.004 + 10 * 0.00002)
    daily_medium = 40 * (10 * 0.004 + 50 * 0.00002)
    daily_long = 20 * (25 * 0.004 + 200 * 0.00002)
    daily_total = daily_short + daily_medium + daily_long
    
    # Old daily cost (everything was verbose)
    old_daily = 100 * (45 * 0.004 + 300 * 0.00002)
    
    print(f"Old approach (4096 tokens): ${old_daily:.2f}/day")
    print(f"Fixed limit (150 tokens): Summaries cut off!")
    print(f"Smart limits: ${daily_total:.2f}/day")
    print(f"\nMonthly savings: ${(old_daily - daily_total) * 30:.2f}")
    print(f"Percentage saved: {((old_daily - daily_total) / old_daily * 100):.0f}%")
    
    print("\n✅ BENEFITS")
    print("• No more cut-off summaries")
    print("• 75% cost reduction vs original")
    print("• Optimal tokens for each use case")
    print("• Better user experience")

if __name__ == "__main__":
    analyze_smart_tokens()
