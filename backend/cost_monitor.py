import asyncio
import json

class CostMonitor:
    """Monitor OpenAI Realtime API costs"""
    
    def __init__(self):
        self.audio_input_seconds = 0
        self.audio_output_seconds = 0
        self.text_tokens = 0
        
    def add_audio_input(self, seconds):
        self.audio_input_seconds += seconds
        
    def add_audio_output(self, seconds):
        self.audio_output_seconds += seconds
        
    def add_tokens(self, count):
        self.text_tokens += count
        
    def get_cost(self):
        # OpenAI Realtime API pricing
        audio_input_cost = self.audio_input_seconds * 0.001  # $0.06/min
        audio_output_cost = self.audio_output_seconds * 0.004  # $0.24/min
        text_cost = self.text_tokens * 0.00002  # $20/1M tokens
        
        total = audio_input_cost + audio_output_cost + text_cost
        
        return {
            "audio_input": f"${audio_input_cost:.3f}",
            "audio_output": f"${audio_output_cost:.3f}", 
            "text": f"${text_cost:.3f}",
            "total": f"${total:.3f}"
        }
    
    def print_summary(self):
        costs = self.get_cost()
        print(f"""
💰 Cost Summary:
━━━━━━━━━━━━━━━━━━━━━
Audio Input:  {costs['audio_input']} ({self.audio_input_seconds:.1f}s)
Audio Output: {costs['audio_output']} ({self.audio_output_seconds:.1f}s)  
Text Tokens:  {costs['text']} ({self.text_tokens} tokens)
━━━━━━━━━━━━━━━━━━━━━
TOTAL COST:   {costs['total']}
        """)

# Global monitor instance
cost_monitor = CostMonitor()
