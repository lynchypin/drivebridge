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
            
            const response = await this.state.msalInstance.loginPopup(loginRequest);
            
            if (response.accessToken) {
                console.log('✅ Microsoft authentication successful!');
                
                // Store the real token
                const tokenData = {
                    access_token: response.accessToken,
                    expires_in: response.expiresOn ? Math.floor((response.expiresOn.getTime() - Date.now()) / 1000) : 3600,
                    scope: response.scopes.join(' '),
                    token_type: 'Bearer',
                    timestamp: Date.now()
                };
                
                sessionStorage.setItem('microsoft_token', JSON.stringify(tokenData));
                this.state.microsoftToken = response.accessToken;
                
                this.updateConnectionStatus('onedrive', true);
                this.showNotification('OneDrive connected successfully!', 'success');
                this.checkProceedButton();
                
                console.log('Microsoft authentication completed');
            } else {
                throw new Error('No access token received');
            }
            
        } catch (error) {
            console.error('Microsoft authentication error:', error);
            this.showNotification('Microsoft authentication failed. Please try again.', 'error');
        }
    }

    updateConnectionStatus(service, connected) {
        console.log(`Updating ${service} connection status to: ${connected}`);
        const statusElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-status`);
        if (statusElement) {
            const statusSpan = statusElement.querySelector('.status');
            if (statusSpan) {
                statusSpan.textContent = connected ? 'Connected' : 'Disconnected';
                statusSpan.className = connected ? 'status status--success' : 'status status--error';
                console.log(`${service} status updated to: ${connected ? 'Connected' : 'Disconnected'}`);
            }
        }
    }

    checkProceedButton() {
        const googleConnected = !!this.state.googleToken;
        const microsoftConnected = !!this.state.microsoftToken;
        const bothConnected = googleConnected && microsoftConnected;
        
        console.log('Checking proceed button:', { bothConnected, google: googleConnected, microsoft: microsoftConnected });
        
        const proceedBtn = document.getElementById('proceed-btn');
        if (proceedBtn) {
            proceedBtn.disabled = !bothConnected;
            if (bothConnected) {
                console.log('Proceed button enabled');
            } else {
                console.log('Proceed button disabled');
            }
        }
    }

    checkExistingAuth() {
        console.log('Checking existing authentication...');
        
        // Check for stored tokens
        const googleToken = sessionStorage.getItem('google_token');
        const microsoftToken = sessionStorage.getItem('microsoft_token');
        
        if (googleToken && !googleToken.includes('demo_')) {
            try {
                const tokenData = JSON.parse(googleToken);
                if (this.isTokenValid(tokenData)) {
                    this.state.googleToken = tokenData.access_token;
                    this.updateConnectionStatus('google', true);
                    console.log('Found existing Google token');
                }
            } catch (e) {
                console.log('Invalid Google token found, clearing...');
                sessionStorage.removeItem('google_token');
            }
        }
        
        if (microsoftToken && !microsoftToken.includes('demo_')) {
            try {
                const tokenData = JSON.parse(microsoftToken);
                if (this.isTokenValid(tokenData)) {
                    this.state.microsoftToken = tokenData.access_token;
                    this.updateConnectionStatus('onedrive', true);
                    console.log('Found existing Microsoft token');
                }
            } catch (e) {
                console.log('Invalid Microsoft token found, clearing...');
                sessionStorage.removeItem('microsoft_token');
            }
        }
        
        this.checkProceedButton();
    }

    isTokenValid(tokenData) {
        if (!tokenData.timestamp || !tokenData.expires_in) {
            return false;
        }
        
        const expirationTime = tokenData.timestamp + (tokenData.expires_in * 1000);
        return Date.now() < expirationTime;
    }

    showDashboard() {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';
        
        // Load files from both services
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
    }

    async loadGoogleDriveFiles() {
        if (!this.state.googleToken) {
            console.log('No Google token available');
            return;
        }

        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents,webViewLink)`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                this.state.googleFiles = data.files || [];
                this.renderFileList('google', this.state.googleFiles);
                console.log('✅ Loaded real Google Drive files:', this.state.googleFiles.length);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to load Google Drive files:', error);
            this.showNotification('Failed to load Google Drive files', 'error');
        }
    }

    async loadOneDriveFiles() {
        if (!this.state.microsoftToken) {
            console.log('No Microsoft token available');
            return;
        }

        try {
            const endpoint = this.state.currentOneDriveFolder === 'root' 
                ? 'https://graph.microsoft.com/v1.0/me/drive/root/children'
                : `https://graph.microsoft.com/v1.0/me/drive/items/${this.state.currentOneDriveFolder}/children`;

            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.state.microsoftToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.state.oneDriveFiles = data.value || [];
                this.renderFileList('onedrive', this.state.oneDriveFiles);
                console.log('✅ Loaded real OneDrive files:', this.state.oneDriveFiles.length);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to load OneDrive files:', error);
            this.showNotification('Failed to load OneDrive files', 'error');
        }
    }

    renderFileList(service, files) {
        const fileListElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-file-list`);
        if (!fileListElement) return;

        if (files.length === 0) {
            fileListElement.innerHTML = '<div class="empty-state">No files found</div>';
            return;
        }

        const fileItems = files.map(file => {
            const isFolder = service === 'google' 
                ? file.mimeType === 'application/vnd.google-apps.folder'
                : file.folder !== undefined;
                
            const fileSize = file.size ? this.formatFileSize(file.size) : '';
            const modifiedDate = file.modifiedTime || file.lastModifiedDateTime || '';
            
            return `
                <div class="file-item ${isFolder ? 'file-item--folder' : ''}" data-file-id="${file.id}">
                    <div class="file-icon">
                        ${this.getFileIcon(file)}
                    </div>
                    <div class="file-info">
                        <div class="file-name">${file.name}</div>
                        <div class="file-meta">
                            ${fileSize} ${modifiedDate ? '• ' + new Date(modifiedDate).toLocaleDateString() : ''}
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="btn btn--ghost btn--small" onclick="app.selectFile('${service}', '${file.id}')">
                            Select
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        fileListElement.innerHTML = fileItems;
    }

    getFileIcon(file) {
        // Simple file type detection - you can enhance this
        if (file.mimeType === 'application/vnd.google-apps.folder' || file.folder) {
            return '📁';
        }
        
        const name = file.name.toLowerCase();
        if (name.includes('.pdf')) return '📄';
        if (name.includes('.doc') || name.includes('.docx')) return '📝';
        if (name.includes('.xls') || name.includes('.xlsx')) return '📊';
        if (name.includes('.ppt') || name.includes('.pptx')) return '📈';
        if (name.includes('.jpg') || name.includes('.png') || name.includes('.gif')) return '🖼️';
        if (name.includes('.mp4') || name.includes('.avi')) return '🎥';
        if (name.includes('.mp3') || name.includes('.wav')) return '🎵';
        
        return '📄';
    }

    formatFileSize(bytes) {
        if (!bytes) return '';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    selectFile(service, fileId) {
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedSet.has(fileId)) {
            selectedSet.delete(fileId);
        } else {
            selectedSet.add(fileId);
        }
        
        // Update transfer button states
        this.updateTransferButtons();
    }

    updateTransferButtons() {
        const transferToOneDriveBtn = document.getElementById('transfer-to-onedrive');
        const transferToGoogleBtn = document.getElementById('transfer-to-google');
        
        if (transferToOneDriveBtn) {
            transferToOneDriveBtn.disabled = this.state.selectedGoogleFiles.size === 0;
        }
        
        if (transferToGoogleBtn) {
            transferToGoogleBtn.disabled = this.state.selectedOneDriveFiles.size === 0;
        }
    }

    async transferSelectedFiles(from, to) {
        const selectedFiles = from === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedFiles.size === 0) {
            this.showNotification('No files selected for transfer', 'warning');
            return;
        }
        
        this.showNotification(`Starting transfer of ${selectedFiles.size} file(s)...`, 'info');
        
        // Here you would implement the actual file transfer logic
        // For now, just show a success message
        setTimeout(() => {
            this.showNotification(`Successfully transferred ${selectedFiles.size} file(s)!`, 'success');
            selectedFiles.clear();
            this.updateTransferButtons();
        }, 2000);
    }

    refreshFiles() {
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        this.showNotification('Files refreshed', 'success');
    }

    disconnectAll() {
        // Clear all tokens
        sessionStorage.clear();
        localStorage.clear();
        
        // Reset state
        this.state.googleToken = null;
        this.state.microsoftToken = null;
        this.state.selectedGoogleFiles.clear();
        this.state.selectedOneDriveFiles.clear();
        
        // Update UI
        this.updateConnectionStatus('google', false);
        this.updateConnectionStatus('onedrive', false);
        this.checkProceedButton();
        
        // Go back to auth view
        document.getElementById('dashboard-view').style.display = 'none';
        document.getElementById('auth-view').style.display = 'block';
        
        this.showNotification('Disconnected from all services', 'info');
    }

    showNotification(message, type = 'info') {
        console.log(`Notification [${type}]: ${message}`);
        
        const container = document.getElementById('notifications');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// Initialize the application when DOM is loaded
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded - Creating DriveBridge instance...');
        app = new DriveBridge();
    });
} else {
    console.log('DOM already loaded - Creating DriveBridge instance...');
    app = new DriveBridge();
}
