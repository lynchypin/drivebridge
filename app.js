// DriveBridge - Universal File Sharing Application
class DriveBridge {
    constructor() {
        // Configuration - Replace with your actual OAuth credentials
        this.config = {
            google: {
                clientId: Config.getGoogleClientId(),
                scopes: ['https://www.googleapis.com/auth/drive'],
                discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
            },
            microsoft: {
                clientId: Config.getMicrosoftClientId(),
                authority: 'https://login.microsoftonline.com/common',
                redirectUri: Config.getRedirectUri(),
                scopes: ['https://graph.microsoft.com/Files.ReadWrite', 'https://graph.microsoft.com/User.Read']
            }
        };

        // State management
        this.state = {
            googleAuth: null,
            msalInstance: null,
            googleToken: null,
            microsoftToken: null,
            currentGoogleFolder: 'root',
            currentOneDriveFolder: 'root',
            selectedGoogleFiles: new Set(),
            selectedOneDriveFiles: new Set(),
            transfers: new Map(),
            googleFiles: [],
            oneDriveFiles: [],
            isInitialized: false
        };

        // File type mappings
        this.fileTypes = {
            image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'],
            document: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
            spreadsheet: ['xls', 'xlsx', 'csv', 'ods'],
            presentation: ['ppt', 'pptx', 'odp'],
            archive: ['zip', 'rar', '7z', 'tar', 'gz'],
            video: ['mp4', 'avi', 'mov', 'wmv', 'flv', 'webm'],
            audio: ['mp3', 'wav', 'flac', 'aac', 'ogg']
        };

        // Wait for DOM to be ready before initializing
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        try {
            console.log('Initializing DriveBridge...');
            
            // Set up event listeners first
            this.setupEventListeners();
            
            // Initialize APIs
            await this.initializeAPIs();
            
            // Check for existing authentication
            this.checkExistingAuth();
            
            console.log('DriveBridge initialized successfully');
            this.showNotification('DriveBridge ready! Connect your cloud services to get started.', 'info');
            
        } catch (error) {
            console.error('Initialization failed:', error);
            this.showNotification('Failed to initialize DriveBridge. Please refresh the page.', 'error');
        }
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Authentication buttons
        const googleAuthBtn = document.getElementById('google-auth-btn');
        if (googleAuthBtn) {
            googleAuthBtn.addEventListener('click', () => this.authenticateGoogle());
            console.log('Google auth button listener added');
        }
        
        const onedriveAuthBtn = document.getElementById('onedrive-auth-btn');
        if (onedriveAuthBtn) {
            onedriveAuthBtn.addEventListener('click', () => this.authenticateMicrosoft());
            console.log('OneDrive auth button listener added');
        }
        
        const proceedBtn = document.getElementById('proceed-btn');
        if (proceedBtn) {
            proceedBtn.addEventListener('click', () => this.showDashboard());
            console.log('Proceed button listener added');
        }
        
        // Dashboard buttons
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshFiles());
        }
        
        const disconnectBtn = document.getElementById('disconnect-all-btn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnectAll());
        }
        
        // Transfer buttons
        const transferToOneDriveBtn = document.getElementById('transfer-to-onedrive');
        if (transferToOneDriveBtn) {
            transferToOneDriveBtn.addEventListener('click', () => this.transferSelectedFiles('google', 'onedrive'));
        }
        
        const transferToGoogleBtn = document.getElementById('transfer-to-google');
        if (transferToGoogleBtn) {
            transferToGoogleBtn.addEventListener('click', () => this.transferSelectedFiles('onedrive', 'google'));
        }
        
        console.log('Event listeners setup complete');
    }

    async initializeAPIs() {
        try {
            // Wait for Google Identity Services to load
            await this.waitForGoogleAPI();
            
            // Initialize Microsoft MSAL
            if (typeof msal !== 'undefined') {
                this.state.msalInstance = new msal.PublicClientApplication({
                    auth: {
                        clientId: this.config.microsoft.clientId,
                        authority: this.config.microsoft.authority,
                        redirectUri: this.config.microsoft.redirectUri
                    },
                    cache: {
                        cacheLocation: 'sessionStorage'
                    }
                });
                console.log('✅ Microsoft MSAL initialized');
            }
            
        } catch (error) {
            console.error('API initialization failed:', error);
        }
    }

    waitForGoogleAPI() {
        return new Promise((resolve, reject) => {
            const checkGoogle = () => {
                if (typeof google !== 'undefined' && google.accounts) {
                    console.log('✅ Google Identity Services loaded');
                    resolve();
                } else {
                    setTimeout(checkGoogle, 100);
                }
            };
            checkGoogle();
        });
    }

    async authenticateGoogle() {
        try {
            console.log('Starting Google authentication...');
            
            // Clear any existing tokens
            sessionStorage.removeItem('google_token');
            
            // Initialize Google OAuth2 client
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.clientId,
                scope: 'https://www.googleapis.com/auth/drive',
                callback: (response) => {
                    if (response.access_token) {
                        console.log('✅ Google authentication successful!');
                        
                        // Store the real token
                        const tokenData = {
                            access_token: response.access_token,
                            expires_in: response.expires_in || 3600,
                            scope: response.scope,
                            token_type: 'Bearer',
                            timestamp: Date.now()
                        };
                        
                        sessionStorage.setItem('google_token', JSON.stringify(tokenData));
                        this.state.googleToken = response.access_token;
                        
                        this.updateConnectionStatus('google', true);
                        this.showNotification('Google Drive connected successfully!', 'success');
                        this.checkProceedButton();
                        
                        console.log('Google authentication completed');
                    } else {
                        console.error('Google authentication failed - no access token');
                        this.showNotification('Google authentication failed. Please try again.', 'error');
                    }
                },
                error_callback: (error) => {
                    console.error('Google OAuth error:', error);
                    this.showNotification('Google authentication failed. Please try again.', 'error');
                }
            });
            
            // Request access token
            client.requestAccessToken();
            
        } catch (error) {
            console.error('Google authentication error:', error);
            this.showNotification('Google authentication failed. Please try again.', 'error');
        }
    }

    async authenticateMicrosoft() {
        try {
            console.log('Starting Microsoft authentication...');
            
            if (!this.state.msalInstance) {
                throw new Error('Microsoft MSAL not initialized');
            }
            
            const loginRequest = {
                scopes: this.config.microsoft.scopes
            };
            
            const response = await this.state.msalInstance.loginPop
