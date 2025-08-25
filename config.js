// config.js - Configuration management for DriveBridge
class Config {
    static getGoogleClientId() {
        // Try to get from environment variables first (for production)
        if (typeof process !== 'undefined' && process.env) {
            return process.env.GOOGLE_CLIENT_ID;
        }
        
        // For GitHub Pages, we'll use a different approach
        // This will be loaded from a separate config file
        return window.DRIVEBRIDGE_CONFIG?.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
    }
    
    static getMicrosoftClientId() {
        if (typeof process !== 'undefined' && process.env) {
            return process.env.MICROSOFT_CLIENT_ID;
        }
        
        return window.DRIVEBRIDGE_CONFIG?.MICROSOFT_CLIENT_ID || 'YOUR_MICROSOFT_CLIENT_ID';
    }
    
    static getRedirectUri() {
        // Automatically detect the current domain
        return window.location.origin;
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}
