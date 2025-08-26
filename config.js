// config.js - Secure Configuration for DriveBridge
// This file is safe to commit to GitHub - OAuth Client IDs are meant to be public for SPAs

class Config {
    static getGoogleClientId() {
        // REPLACE WITH YOUR ACTUAL GOOGLE OAUTH CLIENT ID
        // This is safe to be public - OAuth Client IDs are designed to be public for web apps
        return '572659500576-97729khduevuhv0bti7ce3cm6ep1t7gn.apps.googleusercontent.com';
    }
    
    static getMicrosoftClientId() {
        // REPLACE WITH YOUR ACTUAL MICROSOFT APPLICATION ID
        // This is safe to be public - Application IDs are designed to be public for SPAs
        return 'db78149b-9098-4898-b5b5-567fa03f75f0';
    }
    
    static getRedirectUri() {
        // Automatically detects your GitHub Pages URL
        // No hardcoded URLs that could expose your username
        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            const pathname = window.location.pathname;
            
            // GitHub Pages detection
            if (hostname.includes('.github.io')) {
                return `${window.location.origin}${pathname.replace(/\/$/, '')}`;
            }
            
            // Local development
            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                return `${window.location.origin}${pathname.replace(/\/$/, '')}`;
            }
            
            // Custom domain
            return window.location.origin + (pathname !== '/' ? pathname.replace(/\/$/, '') : '');
        }
        
        // Fallback - replace with your actual GitHub Pages URL
        return 'https://YOUR_GITHUB_USERNAME.github.io/drivebridge';
    }
    
    static getApiEndpoints() {
        // Public API endpoints - safe to expose
        return {
            google: {
                drive: 'https://www.googleapis.com/drive/v3',
                upload: 'https://www.googleapis.com/upload/drive/v3'
            },
            microsoft: {
                graph: 'https://graph.microsoft.com/v1.0'
            }
        };
    }
    
    static getAppSettings() {
        return {
            maxFileSize: 100 * 1024 * 1024, // 100MB - adjust as needed
            batchSize: 5, // Files per batch - adjust based on rate limits
            retryAttempts: 3,
            retryDelay: 2000, // milliseconds
            logRetentionCount: 100
        };
    }
    
    // Security settings
    static getSecuritySettings() {
        return {
            // Only allow HTTPS in production
            requireHttps: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
            // Content Security Policy headers (if you add them to GitHub Pages)
            cspEnabled: true,
            // Rate limiting
            maxRequestsPerMinute: 60
        };
    }
}

// Validate environment on load
if (typeof window !== 'undefined') {
    // Security check - ensure HTTPS in production
    if (!Config.getSecuritySettings().requireHttps && window.location.hostname.includes('.github.io')) {
        console.warn('🔒 SECURITY WARNING: Application should run over HTTPS in production');
    }
    
    // Validate configuration
    const googleId = Config.getGoogleClientId();
    const microsoftId = Config.getMicrosoftClientId();
    
    if (googleId.includes('YOUR_GOOGLE_CLIENT_ID')) {
        console.warn('⚠️ Please configure your Google OAuth Client ID in config.js');
    }
    
    if (microsoftId.includes('YOUR_MICROSOFT_CLIENT_ID')) {
        console.warn('⚠️ Please configure your Microsoft Application ID in config.js');
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}
