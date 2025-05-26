import os
import secrets
import json
import asyncio
import aiosqlite
import base64
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import FastAPI, HTTPException, Depends, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv
from openai import AsyncOpenAI
from google.auth.transport import requests as google_requests
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import httpx

# Import OpenAI Realtime Proxy
from realtime_proxy import OpenAIRealtimeProxy

# Load environment variables
load_dotenv()

# Configuration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
SECRET_KEY = os.getenv("SECRET_KEY", secrets.token_urlsafe(32))
REDIRECT_URI = "http://localhost:8000/oauth2callback"

# Validate required environment variables
if not all([GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY]):
    print("❌ Missing required environment variables!")
    print("Please ensure these are set in your .env file:")
    print("- GOOGLE_CLIENT_ID")
    print("- GOOGLE_CLIENT_SECRET") 
    print("- OPENAI_API_KEY")
    exit(1)

# Initialize OpenAI
openai_client = AsyncOpenAI(api_key=OPENAI_API_KEY)

# Gmail scopes
SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify"
]

# Guard rails
MAX_MESSAGES = 50
MAX_THREADS = 20
MAX_RECIPIENTS = 10
MAX_LABELS_OP = 100
GMAIL_TIMEOUT = 8.0
CACHE_DB_PATH = "gmail_cache.db"
MAX_CACHE_SIZE_MB = 10
CACHE_EXPIRY_SECONDS = 300  # 5 minutes

# Initialize FastAPI
app = FastAPI(title="VoiceInbox MVP API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage
sessions: Dict[str, Dict] = {}
active_websockets: Dict[str, WebSocket] = {}
active_proxies: Dict[str, OpenAIRealtimeProxy] = {}  # Store proxy instances per user

# Pydantic models for Gmail helpers
class SearchMessagesArgs(BaseModel):
    query: str
    max_results: int = Field(default=20, le=MAX_MESSAGES)
    include_body: bool = False

class GetThreadArgs(BaseModel):
    thread_id: str
    include_body: bool = True

class SummarizeMessagesArgs(BaseModel):
    message_ids: List[str] = Field(max_items=MAX_MESSAGES)

class SummarizeThreadArgs(BaseModel):
    thread_id: str

class CategorizeUnreadArgs(BaseModel):
    max_results: int = Field(default=30, le=MAX_MESSAGES)

class CreateDraftArgs(BaseModel):
    to: List[str] = Field(max_items=MAX_RECIPIENTS)
    cc: List[str] = Field(default=[], max_items=MAX_RECIPIENTS)
    bcc: List[str] = Field(default=[], max_items=MAX_RECIPIENTS)
    subject: str
    body_markdown: str
    reply_to_thread_id: Optional[str] = None
    send: bool = False
    
    @validator('to', 'cc', 'bcc')
    def validate_emails(cls, v):
        for email in v:
            if '@' not in email:
                raise ValueError(f"Invalid email: {email}")
        return v

class SendDraftArgs(BaseModel):
    draft_id: str

class ScheduleSendArgs(BaseModel):
    draft_id: str
    send_at_epoch_ms: int
    
    @validator('send_at_epoch_ms')
    def validate_future_time(cls, v):
        if v < int(time.time() * 1000):
            raise ValueError("INVALID_TIME: Schedule time must be in the future")
        return v

class ModifyLabelsArgs(BaseModel):
    msg_ids: List[str] = Field(max_items=MAX_LABELS_OP)
    add: List[str] = Field(default=[])
    remove: List[str] = Field(default=[])

class BulkDeleteArgs(BaseModel):
    msg_ids: List[str] = Field(max_items=100)

class MarkReadArgs(BaseModel):
    msg_ids: List[str] = Field(max_items=MAX_LABELS_OP)

class CreateCalendarEventArgs(BaseModel):
    title: str
    start_epoch_ms: int
    end_epoch_ms: int
    attendees: List[str] = Field(default=[])

# Initialize SQLite cache
async def init_cache():
    async with aiosqlite.connect(CACHE_DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS message_cache (
                cache_key TEXT PRIMARY KEY,
                user_id TEXT,
                data TEXT,
                cached_at INTEGER
            )
        """)
        await db.execute("CREATE INDEX IF NOT EXISTS idx_user_cached_at ON message_cache(user_id, cached_at)")
        await db.commit()

async def cache_get(user_id: str, key: str) -> Optional[Dict]:
    """Get cached data if not expired"""
    async with aiosqlite.connect(CACHE_DB_PATH) as db:
        cursor = await db.execute(
            "SELECT data, cached_at FROM message_cache WHERE cache_key = ? AND user_id = ?",
            (f"{user_id}:{key}", user_id)
        )
        row = await cursor.fetchone()
        if row:
            data, cached_at = row
            if time.time() - cached_at < CACHE_EXPIRY_SECONDS:
                return json.loads(data)
    return None

async def cache_set(user_id: str, key: str, data: Dict):
    """Set cache data"""
    async with aiosqlite.connect(CACHE_DB_PATH) as db:
        cache_key = f"{user_id}:{key}"
        await db.execute(
            "INSERT OR REPLACE INTO message_cache (cache_key, user_id, data, cached_at) VALUES (?, ?, ?, ?)",
            (cache_key, user_id, json.dumps(data), int(time.time()))
        )
        await db.commit()
        
        # Check cache size and clean if needed
        cursor = await db.execute("SELECT COUNT(*) FROM message_cache")
        count = (await cursor.fetchone())[0]
        if count > 1000:  # Simple LRU - delete oldest
            await db.execute(
                "DELETE FROM message_cache WHERE cache_key IN (SELECT cache_key FROM message_cache ORDER BY cached_at LIMIT 100)"
            )
            await db.commit()

# Helper function to get current user
def get_current_user(request: Request) -> str:
    """Get current user from session cookie"""
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session = sessions[session_id]
    if session.get("expires_at", 0) < datetime.now().timestamp():
        del sessions[session_id]
        raise HTTPException(status_code=401, detail="Session expired")
    
    return session["user_id"]

# Gmail service helper with token refresh
def get_gmail_service(user_id: str):
    """Get Gmail service for user with automatic token refresh"""
    session = next((s for s in sessions.values() if s.get("user_id") == user_id), None)
    if not session:
        raise HTTPException(status_code=401, detail="User not found")
    
    credentials = Credentials(
        token=session["access_token"],
        refresh_token=session.get("refresh_token"),
        token_uri="https://accounts.google.com/o/oauth2/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET
    )
    
    # Refresh token if expired
    if credentials.expired:
        request = google_requests.Request()
        credentials.refresh(request)
        # Update session with new token
        session["access_token"] = credentials.token
    
    return build("gmail", "v1", credentials=credentials)

# Gmail helper functions
async def search_messages(user_id: str, args: SearchMessagesArgs) -> Dict:
    """Search Gmail messages"""
    cache_key = f"search:{args.query}:{args.max_results}"
    cached = await cache_get(user_id, cache_key)
    if cached and not args.include_body:
        return cached
    
    try:
        service = get_gmail_service(user_id)
        results = service.users().messages().list(
            userId='me',
            q=args.query,
            maxResults=args.max_results
        ).execute()
        
        messages = results.get('messages', [])
        message_data = []
        
        for msg in messages:
            try:
                msg_detail = service.users().messages().get(
                    userId='me',
                    id=msg['id'],
                    format='metadata' if not args.include_body else 'full',
                    metadataHeaders=['From', 'To', 'Subject', 'Date']
                ).execute()
                
                headers = {h['name']: h['value'] for h in msg_detail.get('payload', {}).get('headers', [])}
                
                msg_info = {
                    'id': msg['id'],
                    'threadId': msg_detail.get('threadId'),
                    'subject': headers.get('Subject', ''),
                    'from': headers.get('From', ''),
                    'to': headers.get('To', ''),
                    'date': headers.get('Date', ''),
                    'snippet': msg_detail.get('snippet', ''),
                    'labelIds': msg_detail.get('labelIds', [])
                }
                
                if args.include_body:
                    body = extract_body(msg_detail.get('payload', {}))
                    if len(body) > 100000:  # 100KB limit
                        msg_info['body_truncated'] = True
                        msg_info['body'] = body[:100000]
                    else:
                        msg_info['body'] = body
                
                message_data.append(msg_info)
            except Exception as e:
                print(f"Error fetching message {msg['id']}: {e}")
                continue
        
        result = {
            'messages': message_data,
            'resultSizeEstimate': results.get('resultSizeEstimate', 0),
            'nextPageToken': results.get('nextPageToken')
        }
        
        if not args.include_body:
            await cache_set(user_id, cache_key, result)
        
        return result
    except HttpError as e:
        if e.resp.status == 401:
            raise ValueError("AUTH_EXPIRED: Gmail authentication expired")
        elif e.resp.status == 429:
            raise ValueError("QUOTA: Gmail API quota exceeded")
        else:
            raise ValueError(f"GMAIL_ERROR: {str(e)}")
    except Exception as e:
        raise ValueError(f"SERVICE_UNAVAILABLE: {str(e)}")

async def list_unread(user_id: str, max_results: int = 20) -> Dict:
    """List unread messages"""
    return await search_messages(user_id, SearchMessagesArgs(
        query="is:unread",
        max_results=min(max_results, MAX_MESSAGES)
    ))

async def list_unread_priority(user_id: str, max_results: int = 20) -> Dict:
    """List unread priority messages"""
    return await search_messages(user_id, SearchMessagesArgs(
        query="is:unread is:important",
        max_results=min(max_results, MAX_MESSAGES)
    ))

async def get_thread(user_id: str, args: GetThreadArgs) -> Dict:
    """Get full email thread"""
    try:
        service = get_gmail_service(user_id)
        thread = service.users().threads().get(
            userId='me',
            id=args.thread_id,
            format='full' if args.include_body else 'metadata'
        ).execute()
        
        messages = []
        for msg in thread.get('messages', []):
            headers = {h['name']: h['value'] for h in msg.get('payload', {}).get('headers', [])}
            msg_info = {
                'id': msg['id'],
                'subject': headers.get('Subject', ''),
                'from': headers.get('From', ''),
                'to': headers.get('To', ''),
                'date': headers.get('Date', ''),
                'snippet': msg.get('snippet', '')
            }
            
            if args.include_body:
                msg_info['body'] = extract_body(msg.get('payload', {}))
            
            messages.append(msg_info)
        
        return {
            'id': thread['id'],
            'messages': messages,
            'historyId': thread.get('historyId')
        }
    except Exception as e:
        raise ValueError(f"THREAD_ERROR: {str(e)}")

async def summarize_messages(user_id: str, args: SummarizeMessagesArgs) -> Dict:
    """Summarize multiple messages using GPT"""
    # First fetch the messages
    messages_data = []
    service = get_gmail_service(user_id)
    
    for msg_id in args.message_ids[:MAX_MESSAGES]:
        try:
            msg = service.users().messages().get(
                userId='me',
                id=msg_id,
                format='full'
            ).execute()
            
            headers = {h['name']: h['value'] for h in msg.get('payload', {}).get('headers', [])}
            body = extract_body(msg.get('payload', {}))[:50000]  # Limit body size
            
            messages_data.append({
                'subject': headers.get('Subject', ''),
                'from': headers.get('From', ''),
                'date': headers.get('Date', ''),
                'body': body
            })
        except Exception as e:
            print(f"Error fetching message {msg_id}: {e}")
    
    if not messages_data:
        return {'summary': 'No messages found to summarize'}
    
    # Create summary with GPT
    prompt = "Summarize these emails concisely:\n\n"
    for i, msg in enumerate(messages_data, 1):
        prompt += f"Email {i}:\nFrom: {msg['from']}\nSubject: {msg['subject']}\nBody: {msg['body'][:1000]}...\n\n"
    
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful email assistant. Provide concise summaries."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500
        )
        
        return {
            'summary': response.choices[0].message.content,
            'message_count': len(messages_data)
        }
    except Exception as e:
        return {'summary': f'Error creating summary: {str(e)}', 'message_count': len(messages_data)}

async def summarize_thread(user_id: str, args: SummarizeThreadArgs) -> Dict:
    """Summarize an email thread"""
    thread = await get_thread(user_id, GetThreadArgs(thread_id=args.thread_id, include_body=True))
    
    prompt = "Summarize this email thread:\n\n"
    for msg in thread['messages']:
        prompt += f"From: {msg['from']}\nDate: {msg['date']}\n{msg.get('body', msg['snippet'])[:1000]}\n\n"
    
    try:
        response = await openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Summarize this email thread concisely, highlighting key points and decisions."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300
        )
        
        return {
            'summary': response.choices[0].message.content,
            'message_count': len(thread['messages'])
        }
    except Exception as e:
        return {'summary': f'Error creating summary: {str(e)}'}

async def categorize_unread(user_id: str, args: CategorizeUnreadArgs) -> Dict:
    """Categorize unread emails by urgency/topic"""
    unread = await list_unread(user_id, args.max_results)
    
    categories = {
        'urgent': [],
        'important': [],
        'newsletters': [],
        'social': [],
        'other': []
    }
    
    for msg in unread['messages']:
        # Simple categorization based on labels and keywords
        labels = msg.get('labelIds', [])
        subject = msg.get('subject', '').lower()
        from_addr = msg.get('from', '').lower()
        
        if 'IMPORTANT' in labels or 'urgent' in subject or 'asap' in subject:
            categories['urgent'].append(msg)
        elif 'CATEGORY_UPDATES' in labels or 'newsletter' in from_addr:
            categories['newsletters'].append(msg)
        elif 'CATEGORY_SOCIAL' in labels:
            categories['social'].append(msg)
        elif 'STARRED' in labels:
            categories['important'].append(msg)
        else:
            categories['other'].append(msg)
    
    return {
        'categories': {k: len(v) for k, v in categories.items()},
        'details': {k: v[:5] for k, v in categories.items()},  # First 5 of each
        'total': unread['resultSizeEstimate']
    }

async def create_draft(user_id: str, args: CreateDraftArgs) -> Dict:
    """Create email draft"""
    total_recipients = len(args.to) + len(args.cc) + len(args.bcc)
    if total_recipients > MAX_RECIPIENTS:
        raise ValueError(f"RECIPIENT_LIMIT: Maximum {MAX_RECIPIENTS} recipients allowed")
    
    try:
        service = get_gmail_service(user_id)
        
        # Create message
        message = MIMEText(args.body_markdown)
        message['to'] = ', '.join(args.to)
        if args.cc:
            message['cc'] = ', '.join(args.cc)
        if args.bcc:
            message['bcc'] = ', '.join(args.bcc)
        message['subject'] = args.subject
        
        # Encode message
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
        
        body = {'message': {'raw': raw_message}}
        if args.reply_to_thread_id:
            body['message']['threadId'] = args.reply_to_thread_id
        
        draft = service.users().drafts().create(
            userId='me',
            body=body
        ).execute()
        
        result = {
            'id': draft['id'],
            'message': {
                'id': draft['message']['id'],
                'threadId': draft['message'].get('threadId'),
                'to': args.to,
                'subject': args.subject
            }
        }
        
        # Send immediately if requested
        if args.send:
            send_result = await send_draft(user_id, SendDraftArgs(draft_id=draft['id']))
            result['sent'] = True
            result['messageId'] = send_result['id']
        
        return result
    except Exception as e:
        raise ValueError(f"DRAFT_ERROR: {str(e)}")

async def send_draft(user_id: str, args: SendDraftArgs) -> Dict:
    """Send a draft"""
    try:
        service = get_gmail_service(user_id)
        result = service.users().drafts().send(
            userId='me',
            body={'id': args.draft_id}
        ).execute()
        
        return {
            'id': result['id'],
            'threadId': result.get('threadId'),
            'labelIds': result.get('labelIds', [])
        }
    except Exception as e:
        raise ValueError(f"SEND_ERROR: {str(e)}")

async def schedule_send(user_id: str, args: ScheduleSendArgs) -> Dict:
    """Schedule draft to be sent later (stub - Gmail API doesn't support this directly)"""
    # In a real implementation, you'd store this in a database and have a background job
    return {
        'status': 'scheduled',
        'draft_id': args.draft_id,
        'send_at': datetime.fromtimestamp(args.send_at_epoch_ms / 1000).isoformat(),
        'note': 'Scheduling not implemented in MVP - draft created but not scheduled'
    }

async def modify_labels(user_id: str, args: ModifyLabelsArgs) -> Dict:
    """Modify message labels (star, archive, etc)"""
    if len(args.msg_ids) > MAX_LABELS_OP:
        raise ValueError(f"TOO_MANY_ITEMS: Maximum {MAX_LABELS_OP} messages per operation")
    
    try:
        service = get_gmail_service(user_id)
        
        # Process in batches of 50 (Gmail API limit)
        modified = 0
        for i in range(0, len(args.msg_ids), 50):
            batch = args.msg_ids[i:i+50]
            
            body = {
                'ids': batch,
                'addLabelIds': args.add,
                'removeLabelIds': args.remove
            }
            
            result = service.users().messages().batchModify(
                userId='me',
                body=body
            ).execute()
            
            modified += len(batch)
        
        return {
            'modified': modified,
            'added': args.add,
            'removed': args.remove
        }
    except Exception as e:
        raise ValueError(f"LABEL_ERROR: {str(e)}")

async def bulk_delete(user_id: str, args: BulkDeleteArgs) -> Dict:
    """Move messages to trash"""
    if len(args.msg_ids) > 100:
        raise ValueError("TOO_MANY_ITEMS: Maximum 100 messages per delete operation")
    
    try:
        service = get_gmail_service(user_id)
        
        # Gmail doesn't have batch delete, so we batch trash instead
        trashed = 0
        for msg_id in args.msg_ids:
            try:
                service.users().messages().trash(userId='me', id=msg_id).execute()
                trashed += 1
            except Exception as e:
                print(f"Error trashing message {msg_id}: {e}")
        
        return {
            'trashed': trashed,
            'requested': len(args.msg_ids)
        }
    except Exception as e:
        raise ValueError(f"DELETE_ERROR: {str(e)}")

async def mark_read(user_id: str, args: MarkReadArgs) -> Dict:
    """Mark messages as read"""
    return await modify_labels(
        user_id,
        ModifyLabelsArgs(
            msg_ids=args.msg_ids,
            remove=['UNREAD']
        )
    )

async def create_calendar_event(user_id: str, args: CreateCalendarEventArgs) -> Dict:
    """Create calendar event (stub - would need Calendar API)"""
    return {
        'status': 'not_implemented',
        'message': 'Calendar integration not included in MVP',
        'title': args.title,
        'start': datetime.fromtimestamp(args.start_epoch_ms / 1000).isoformat()
    }

async def abort_current_action(user_id: str) -> Dict:
    """Cancel current operation"""
    # In a real implementation, this would cancel ongoing operations
    return {'status': 'acknowledged', 'message': 'Operation cancelled'}

async def narrow_scope_request(user_id: str) -> Dict:
    """Return clarifying question when request is too broad"""
    return {
        'clarification_needed': True,
        'suggestions': [
            "Could you be more specific? For example:",
            "- 'Show me unread emails from today'",
            "- 'Summarize emails from John Smith'",
            "- 'Star all emails with invoices'",
            "- 'Draft a reply to the latest email from my boss'"
        ]
    }

# Helper function to extract body from Gmail payload
def extract_body(payload: Dict) -> str:
    """Extract body text from Gmail message payload"""
    body = ""
    
    if 'parts' in payload:
        for part in payload['parts']:
            if part['mimeType'] == 'text/plain':
                data = part['body']['data']
                body += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
            elif part['mimeType'] == 'multipart/alternative':
                body += extract_body(part)
    elif payload.get('body', {}).get('data'):
        body = base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='ignore')
    
    return body

# Function mapping for WebSocket
GMAIL_FUNCTIONS = {
    "search_messages": (search_messages, SearchMessagesArgs),
    "list_unread": (list_unread, None),
    "list_unread_priority": (list_unread_priority, None),
    "get_thread": (get_thread, GetThreadArgs),
    "summarize_messages": (summarize_messages, SummarizeMessagesArgs),
    "summarize_thread": (summarize_thread, SummarizeThreadArgs),
    "categorize_unread": (categorize_unread, CategorizeUnreadArgs),
    "create_draft": (create_draft, CreateDraftArgs),
    "send_draft": (send_draft, SendDraftArgs),
    "schedule_send": (schedule_send, ScheduleSendArgs),
    "modify_labels": (modify_labels, ModifyLabelsArgs),
    "bulk_delete": (bulk_delete, BulkDeleteArgs),
    "mark_read": (mark_read, MarkReadArgs),
    "create_calendar_event": (create_calendar_event, CreateCalendarEventArgs),
    "abort_current_action": (abort_current_action, None),
    "narrow_scope_request": (narrow_scope_request, None)
}

# Routes
@app.get("/")
async def root():
    return {"message": "VoiceInbox MVP API", "functions": list(GMAIL_FUNCTIONS.keys())}

@app.get("/debug/session")
async def debug_session(request: Request):
    """Debug endpoint to check session status"""
    session_id = request.cookies.get("session_id")
    return {
        "session_id_present": session_id is not None,
        "session_id_length": len(session_id) if session_id else 0,
        "session_exists": session_id in sessions if session_id else False,
        "all_cookies": list(request.cookies.keys()),
        "sessions_count": len(sessions)
    }

@app.get("/auth/status")
async def auth_status(request: Request):
    """Check if user is authenticated"""
    try:
        user_id = get_current_user(request)
        session = next((s for s in sessions.values() if s.get("user_id") == user_id), None)
        return {"authenticated": True, "user_id": user_id, "email": session.get("email")}
    except HTTPException:
        return {"authenticated": False}

@app.post("/auth/logout")
async def logout(request: Request):
    """Logout user and clear session"""
    session_id = request.cookies.get("session_id")
    if session_id and session_id in sessions:
        # Remove from active websockets
        user_id = sessions[session_id].get("user_id")
        if user_id in active_websockets:
            del active_websockets[user_id]
        # Remove session
        del sessions[session_id]
    
    # Clear cookie
    response = JSONResponse({"success": True, "message": "Logged out successfully"})
    response.delete_cookie(key="session_id")
    return response

@app.get("/login")
async def login():
    """Initiate OAuth2 flow"""
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token",
                "redirect_uris": [REDIRECT_URI]
            }
        },
        scopes=SCOPES
    )
    flow.redirect_uri = REDIRECT_URI
    
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    
    # Store state in session for CSRF protection
    session_id = secrets.token_urlsafe(32)
    sessions[session_id] = {
        "state": state,
        "expires_at": (datetime.now() + timedelta(minutes=10)).timestamp()
    }
    
    response = RedirectResponse(url=authorization_url)
    response.set_cookie(key="session_id", value=session_id, samesite="lax")
    return response

@app.get("/oauth2callback")
async def oauth2callback(request: Request, code: str, state: str):
    """Handle OAuth2 callback"""
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in sessions:
        raise HTTPException(status_code=400, detail="Invalid session")
    
    session = sessions[session_id]
    if session.get("state") != state:
        raise HTTPException(status_code=400, detail="Invalid state")
    
    # Exchange code for tokens
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://accounts.google.com/o/oauth2/token",
                "redirect_uris": [REDIRECT_URI]
            }
        },
        scopes=SCOPES,
        state=state
    )
    flow.redirect_uri = REDIRECT_URI
    flow.fetch_token(code=code)
    
    credentials = flow.credentials
    
    # Get user info
    service = build("oauth2", "v2", credentials=credentials)
    user_info = service.userinfo().get().execute()
    user_id = user_info["id"]
    
    # Store session
    sessions[session_id] = {
        "user_id": user_id,
        "email": user_info["email"],
        "access_token": credentials.token,
        "refresh_token": credentials.refresh_token,
        "expires_at": (datetime.now() + timedelta(hours=1)).timestamp()
    }
    
    # Redirect to frontend
    response = RedirectResponse(url=FRONTEND_URL)
    response.set_cookie(key="session_id", value=session_id, httponly=False, samesite="lax", secure=False)
    return response

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint with OpenAI Realtime API integration"""
    
    # MUST accept connection first - cannot close before accepting
    await websocket.accept()
    
    # Then verify session
    if session_id not in sessions:
        await websocket.close(code=4001, reason="Invalid session")
        return
    
    user_id = sessions[session_id]["user_id"]
    
    # Close existing connections for this user
    if user_id in active_websockets:
        print(f"🔄 Closing existing WebSocket for user {user_id}")
        try:
            await active_websockets[user_id].close(code=1000, reason="New connection replacing old one")
        except Exception as e:
            print(f"Error closing old WebSocket: {e}")
    
    # Clean up existing proxy
    if user_id in active_proxies:
        print(f"🔄 Cleaning up existing proxy for user {user_id}")
        try:
            await active_proxies[user_id].cleanup()
        except Exception as e:
            print(f"Error cleaning up proxy: {e}")
        del active_proxies[user_id]
    
    # Store the new connection
    active_websockets[user_id] = websocket
    print(f"✅ WebSocket connected for user {user_id}")
    
    # Create and start OpenAI Realtime Proxy
    proxy = None
    try:
        proxy = OpenAIRealtimeProxy(GMAIL_FUNCTIONS)
        active_proxies[user_id] = proxy
        
        # Start the proxy (connects to OpenAI)
        proxy_started = await proxy.start_proxy(websocket, user_id)
        
        if proxy_started:
            print(f"🎙️ OpenAI Realtime Proxy started for user {user_id}")
            
            # Handle messages from frontend
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Check if it's a direct function call (for backward compatibility/testing)
                if message.get("type") == "function_call":
                    # Handle direct function calls for testing
                    await handle_direct_function_call(websocket, user_id, message)
                else:
                    # Forward all other messages to OpenAI proxy
                    await proxy.handle_client_message(message)
        else:
            # Fallback to direct mode if OpenAI connection fails
            print(f"⚠️ OpenAI connection failed for user {user_id}, falling back to direct mode")
            await websocket.send_json({
                "type": "system",
                "message": "Connected in direct mode (OpenAI unavailable)"
            })
            
            # Handle messages in direct mode
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                
                if message.get("type") == "function_call":
                    await handle_direct_function_call(websocket, user_id, message)
                else:
                    # Echo for testing
                    await websocket.send_json({
                        "type": "echo",
                        "data": message
                    })
    
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected for user {user_id}")
    except Exception as e:
        print(f"❌ WebSocket error for user {user_id}: {e}")
    finally:
        # Cleanup
        if user_id in active_websockets and active_websockets[user_id] == websocket:
            del active_websockets[user_id]
            print(f"🧹 Cleaned up WebSocket for user {user_id}")
        
        if user_id in active_proxies:
            try:
                await active_proxies[user_id].cleanup()
            except Exception as e:
                print(f"Error cleaning up proxy: {e}")
            del active_proxies[user_id]
            print(f"🧹 Cleaned up proxy for user {user_id}")

async def handle_direct_function_call(websocket: WebSocket, user_id: str, message: Dict):
    """Handle direct function calls (for backward compatibility and testing)"""
    func_name = message.get("function")
    if func_name in GMAIL_FUNCTIONS:
        try:
            func, args_model = GMAIL_FUNCTIONS[func_name]
            
            # Parse arguments if needed
            if args_model:
                args = args_model(**message.get("args", {}))
                if asyncio.iscoroutinefunction(func):
                    result = await func(user_id, args)
                else:
                    result = func(user_id, args)
            else:
                if asyncio.iscoroutinefunction(func):
                    result = await func(user_id)
                else:
                    result = func(user_id)
            
            await websocket.send_json({
                "type": "function_result",
                "function": func_name,
                "result": result
            })
        except ValueError as e:
            # Send guard rail errors
            error_msg = str(e)
            error_code = error_msg.split(':')[0] if ':' in error_msg else 'ERROR'
            await websocket.send_json({
                "type": "error",
                "function": func_name,
                "error_code": error_code,
                "error": error_msg
            })
        except Exception as e:
            await websocket.send_json({
                "type": "error",
                "function": func_name,
                "error": str(e)
            })
    else:
        await websocket.send_json({
            "type": "error",
            "error": f"Unknown function: {func_name}"
        })

# Test endpoint for Gmail functions
@app.post("/test/{function_name}")
async def test_function(function_name: str, request: Request):
    """Test Gmail functions via HTTP (for debugging)"""
    user_id = get_current_user(request)
    
    if function_name not in GMAIL_FUNCTIONS:
        raise HTTPException(status_code=404, detail=f"Function {function_name} not found")
    
    func, args_model = GMAIL_FUNCTIONS[function_name]
    body = await request.json() if args_model else {}
    
    try:
        if args_model:
            args = args_model(**body)
            result = await func(user_id, args) if asyncio.iscoroutinefunction(func) else func(user_id, args)
        else:
            result = await func(user_id) if asyncio.iscoroutinefunction(func) else func(user_id)
        
        return {"success": True, "result": result}
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"Unexpected error: {str(e)}"}

@app.on_event("startup")
async def startup_event():
    """Initialize cache on startup"""
    await init_cache()
    print("✅ Gmail cache initialized")
    print(f"✅ {len(GMAIL_FUNCTIONS)} Gmail functions available")
    print("🎙️ OpenAI Realtime API integration ready")
    print("🔄 Backward compatibility maintained for existing functions")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)