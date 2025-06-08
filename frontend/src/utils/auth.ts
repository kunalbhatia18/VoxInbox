// src/utils/auth.ts
const SESSION_KEY = 'voxinbox_session_id';

export const auth = {
  // Get stored session ID
  getSessionId(): string | null {
    return localStorage.getItem(SESSION_KEY);
  },

  // Store session ID
  setSessionId(sessionId: string): void {
    localStorage.setItem(SESSION_KEY, sessionId);
  },

  // Remove session ID
  clearSessionId(): void {
    localStorage.removeItem(SESSION_KEY);
  },

  // Get auth headers for API requests
  getAuthHeaders(): HeadersInit {
    const sessionId = this.getSessionId();
    if (sessionId) {
      return {
        'Authorization': `Bearer ${sessionId}`,
        'Content-Type': 'application/json'
      };
    }
    return {
      'Content-Type': 'application/json'
    };
  },

  // Extract session from URL fragment after OAuth redirect
  extractSessionFromUrl(): string | null {
    const hash = window.location.hash;
    if (hash && hash.includes('session=')) {
      const sessionId = hash.split('session=')[1].split('&')[0];
      if (sessionId) {
        // Store the session
        this.setSessionId(sessionId);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return sessionId;
      }
    }
    return null;
  }
};
