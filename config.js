// config.js - Configuration management for DriveBridge
class Config {
    static getGoogleClientId() {
        // Try to get from environment variables first (for production)
        if (typeof process !== 'undefined' && process.env) {
            return process.env.GOOGLE_CLIENT_ID;
        }
        
        // For GitHub Pages, we'll use a different approach
        // This will be loaded from a separate config file
        return window.DRIVEBRIDGE_CONFIG?.GOOGLE_CLIENT_ID || '572659500576-97729khduevuhv0bti7ce3cm6ep1t7gn.apps.googleusercontent.com';
    }
    
    static getMicrosoftClientId() {
        if (typeof process !== 'undefined' && process.env) {
            return process.env.MICROSOFT_CLIENT_ID;
        }
        
        return window.DRIVEBRIDGE_CONFIG?.MICROSOFT_CLIENT_ID || 'db78149b-9098-4898-b5b5-567fa03f75f0';
    }
    
    static getRedirectUri() {
    // Always return the full drivebridge URL
    return 'https://lynchypin.github.io/drivebridge';
}
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}
