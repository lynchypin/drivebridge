// DriveBridge Configuration - Production Ready

class Config {
    static getGoogleClientId() {
        return '572659500576-97729khduevuhv0bti7ce3cm6ep1t7gn.apps.googleusercontent.com';
    }
    static getMicrosoftClientId() {
        return 'db78149b-9098-4898-b5b5-567fa03f75f0';
    }
    static getRedirectUri() {
        return 'https://lynchypin.github.io/drivebridge/';
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
    static getChunkSettings() {
        return {
            downloadChunkSize: 32 * 1024 * 1024,
            uploadChunkSize: 8 * 1024 * 1024,
            maxRetryAttempts: 5,
            requestTimeout: 120000,
            maxConcurrentChunks: 3,
            progressUpdateInterval: 500
        };
    }
    static getAppSettings() {
        return {
            maxFileSize: 50 * 1024 * 1024 * 1024,
            batchSize: 3,
            retryAttempts: 3,
            retryDelay: 2000,
            logRetentionCount: 1000,
            enableVerboseLogging: true
        };
    }
    static getSecuritySettings() {
        return {
            requireHttps: window.location.protocol === 'https:' || window.location.hostname === 'localhost',
            cspEnabled: true,
            maxRequestsPerMinute: 100,
            tokenRefreshBuffer: 300000
        };
    }
    static getWorkspaceExportFormats() {
        return {
            'application/vnd.google-apps.document': {
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { name: 'Microsoft Word (.docx)', extension: '.docx' },
                'application/pdf': { name: 'PDF Document (.pdf)', extension: '.pdf' },
                'text/html': { name: 'Web Page (.html)', extension: '.html' },
                'application/rtf': { name: 'Rich Text (.rtf)', extension: '.rtf' },
                'application/vnd.oasis.opendocument.text': { name: 'OpenDocument Text (.odt)', extension: '.odt' },
                'text/plain': { name: 'Plain Text (.txt)', extension: '.txt' },
                'application/epub+zip': { name: 'EPUB (.epub)', extension: '.epub' }
            },
            'application/vnd.google-apps.spreadsheet': {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { name: 'Microsoft Excel (.xlsx)', extension: '.xlsx' },
                'application/pdf': { name: 'PDF Document (.pdf)', extension: '.pdf' },
                'text/csv': { name: 'Comma Separated Values (.csv)', extension: '.csv' },
                'text/tab-separated-values': { name: 'Tab Separated Values (.tsv)', extension: '.tsv' },
                'application/vnd.oasis.opendocument.spreadsheet': { name: 'OpenDocument Spreadsheet (.ods)', extension: '.ods' },
                'application/zip': { name: 'Web Page (.zip)', extension: '.zip' }
            },
            'application/vnd.google-apps.presentation': {
                'application/vnd.openxmlformats-officedocument.presentationml.presentation': { name: 'Microsoft PowerPoint (.pptx)', extension: '.pptx' },
                'application/pdf': { name: 'PDF Document (.pdf)', extension: '.pdf' },
                'text/plain': { name: 'Plain Text (.txt)', extension: '.txt' },
                'image/jpeg': { name: 'JPEG Image (.jpg)', extension: '.jpg' },
                'image/png': { name: 'PNG Image (.png)', extension: '.png' },
                'image/svg+xml': { name: 'SVG Vector (.svg)', extension: '.svg' },
                'application/vnd.oasis.opendocument.presentation': { name: 'OpenDocument Presentation (.odp)', extension: '.odp' }
            },
            'application/vnd.google-apps.drawing': {
                'image/svg+xml': { name: 'SVG Vector (.svg)', extension: '.svg' },
                'image/png': { name: 'PNG Image (.png)', extension: '.png' },
                'image/jpeg': { name: 'JPEG Image (.jpg)', extension: '.jpg' },
                'application/pdf': { name: 'PDF Document (.pdf)', extension: '.pdf' }
            },
            'application/vnd.google-apps.script': {
                'application/vnd.google-apps.script+json': { name: 'Apps Script JSON (.json)', extension: '.json' }
            },
            'application/vnd.google-apps.form': {
                'application/zip': { name: 'Web Page (.zip)', extension: '.zip' }
            }
        };
    }
    static getFileTypeIcons() {
        return {
            'application/vnd.google-apps.folder': '📁',
            'application/vnd.google-apps.document': '📄',
            'application/vnd.google-apps.spreadsheet': '📊',
            'application/vnd.google-apps.presentation': '📈',
            'application/vnd.google-apps.drawing': '🎨',
            'application/vnd.google-apps.script': '⚙️',
            'application/vnd.google-apps.form': '📝',
            'application/pdf': '📕',
            'image/': '🖼️',
            'video/': '🎥',
            'audio/': '🎵',
            'text/': '📃',
            'application/zip': '🗜️',
            'default': '📄'
        };
    }
    static getLoggingConfig() {
        return {
            levels: {
                ERROR: 0,
                WARN: 1,
                INFO: 2,
                DEBUG: 3,
                TRACE: 4
            },
            defaultLevel: 'INFO',
            enableConsoleLog: true,
            enableFileExport: true,
            maxLogSize: 10 * 1024 * 1024,
            logRotationSize: 1000
        };
    }
}
if (typeof window !== 'undefined') {
    const security = Config.getSecuritySettings();
    if (!security.requireHttps && window.location.hostname.includes('.github.io')) {
        console.warn('🔒 SECURITY WARNING: Application should run over HTTPS in production');
    }
    console.log('✅ DriveBridge Configuration Loaded');
    console.log('📊 Chunked transfers enabled - Download: 32MB chunks, Upload: 8MB chunks');
    console.log('📝 Verbose logging enabled');
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Config;
}
