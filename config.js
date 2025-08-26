// config.js - Configuration management for DriveBridge
class Config {
    static getGoogleClientId() {
        // Production Google Client ID - replace with your actual client ID
        return '572659500576-97729khduevuhv0bti7ce3cm6ep1t7gn.apps.googleusercontent.com';
    }
    
    static getMicrosoftClientId() {
        // Production Microsoft Client ID - replace with your actual client ID
        return 'db78149b-9098-4898-b5b5-567fa03f75f0';
    }
    
    static getRedirectUri() {
        // Always return the full drivebridge URL for production
        return 'https://lynchypin.github.io/drivebridge';
    }
    
    static getApiEndpoints() {
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
            maxFileSize: 100 * 1024 * 1024, // 100MB
            batchSize: 5,
            retryAttempts: 3,
            retryDelay: 2000,
            logRetentionCount: 100
        };
    }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}
