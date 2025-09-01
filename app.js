// DriveBridge - Universal File Sharing Application
// Production Version with Smart Incremental Transfers, Duplicate Handling, and Google Workspace Export

class DriveBridge {
    constructor() {
        // Security: Validate environment before initialization
        this.validateEnvironment();
        
        // Configuration
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
            },
            endpoints: Config.getApiEndpoints(),
            settings: Config.getAppSettings(),
            security: Config.getSecuritySettings()
        };

        // State management - kept in memory only, never persisted
        this.state = {
            googleAuth: null,
            msalInstance: null,
            googleToken: null,
            microsoftToken: null,
            currentGoogleFolder: 'root',
            currentOneDriveFolder: 'root',
            googleFolderPath: [{ id: 'root', name: 'Root' }],
            onedriveFolderPath: [{ id: 'root', name: 'Root' }],
            selectedGoogleFiles: new Set(),
            selectedOneDriveFiles: new Set(),
            transfers: new Map(),
            googleFiles: [],
            oneDriveFiles: [],
            transferLogs: [],
            isInitialized: false,
            rateLimiter: new Map(), // Track API request rates
            transferCache: new Map(), // Cache for checking existing files
            currentExportFile: null, // For export format selection
            selectedExportFormat: null
        };

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    // Security validation
    validateEnvironment() {
        if (typeof window !== 'undefined') {
            const isProduction = window.location.hostname.includes('.github.io') || 
                                window.location.hostname.includes('drivebridge');
            const isSecure = window.location.protocol === 'https:' || 
                           window.location.hostname === 'localhost';
            
            if (isProduction && !isSecure) {
                throw new Error('🔒 SECURITY ERROR: Production environment requires HTTPS');
            }
            
            if (Config.getGoogleClientId().includes('YOUR_GOOGLE_CLIENT_ID')) {
                console.warn('⚠️ Configure your Google OAuth Client ID in config.js');
            }
            
            if (Config.getMicrosoftClientId().includes('YOUR_MICROSOFT_CLIENT_ID')) {
                console.warn('⚠️ Configure your Microsoft Application ID in config.js');
            }
        }
    }

    // Rate limiting for API calls
    checkRateLimit(service) {
        const now = Date.now();
        const rateLimitKey = `${service}_requests`;
        
        if (!this.state.rateLimiter.has(rateLimitKey)) {
            this.state.rateLimiter.set(rateLimitKey, []);
        }
        
        const requests = this.state.rateLimiter.get(rateLimitKey);
        const oneMinuteAgo = now - 60000;
        
        // Remove requests older than 1 minute
        const recentRequests = requests.filter(timestamp => timestamp > oneMinuteAgo);
        this.state.rateLimiter.set(rateLimitKey, recentRequests);
        
        // Check if we're over the limit
        if (recentRequests.length >= 50) { // Conservative rate limit
            throw new Error(`Rate limit exceeded for ${service}. Please wait before making more requests.`);
        }
        
        // Add current request
        recentRequests.push(now);
        this.state.rateLimiter.set(rateLimitKey, recentRequests);
    }

    async init() {
        try {
            console.log('🚀 Initializing DriveBridge...');
            
            this.clearAllModals();
            this.setupEventListeners();
            await this.initializeAPIs();
            this.checkExistingAuth();
            this.initTransferLogSystem();
            
            console.log('✅ DriveBridge initialized successfully');
            this.showNotification('DriveBridge ready! Connect your cloud services to get started.', 'info');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showNotification('Failed to initialize DriveBridge. Please refresh the page.', 'error');
        }
    }

    clearAllModals() {
        document.querySelectorAll('.modal, .popup, [id*="modal"], [id*="popup"]').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        
        document.querySelectorAll('.modal-backdrop, .overlay, .modal-overlay').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        
        document.body.style.overflow = 'auto';
        document.body.classList.remove('modal-open');
    }

    setupEventListeners() {
        // Authentication buttons
        this.addClickListener('google-auth-btn', () => this.authenticateGoogle());
        this.addClickListener('onedrive-auth-btn', () => this.authenticateMicrosoft());
        this.addClickListener('proceed-btn', () => this.showDashboard());
        
        // Dashboard buttons
        this.addClickListener('refresh-btn', () => this.refreshFiles());
        this.addClickListener('disconnect-all-btn', () => this.disconnectAll());
        
        // Transfer buttons
        this.addClickListener('transfer-to-onedrive', () => this.transferSelectedFiles('google', 'onedrive'));
        this.addClickListener('transfer-to-google', () => this.transferSelectedFiles('onedrive', 'google'));
        
        // Selection buttons
        this.addClickListener('google-select-all', () => this.selectAllFiles('google'));
        this.addClickListener('google-clear-all', () => this.clearAllSelections('google'));
        this.addClickListener('onedrive-select-all', () => this.selectAllFiles('onedrive'));
        this.addClickListener('onedrive-clear-all', () => this.clearAllSelections('onedrive'));
        
        // Search functionality
        this.addInputListener('google-search', (e) => this.searchFiles('google', e.target.value));
        this.addInputListener('onedrive-search', (e) => this.searchFiles('onedrive', e.target.value));
        
        // Transfer log controls
        this.addClickListener('clear-logs-btn', () => this.clearTransferLogs());
        this.addClickListener('toggle-logs-btn', () => this.toggleTransferLogs());
        
        // Folder creation
        this.addClickListener('google-new-folder', () => this.showCreateFolderModal('google'));
        this.addClickListener('onedrive-new-folder', () => this.showCreateFolderModal('onedrive'));
        this.addClickListener('create-folder-confirm', () => this.confirmCreateFolder());
        this.addClickListener('create-folder-cancel', () => this.hideCreateFolderModal());
        
        // Export format modal
        this.addClickListener('export-confirm', () => this.confirmExportFormat());
        this.addClickListener('export-cancel', () => this.hideExportFormatModal());
        
        // Error modal
        this.addClickListener('error-close', () => this.hideErrorModal());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Security: Clear tokens on page unload
        window.addEventListener('beforeunload', () => this.secureCleanup());
    }

    addClickListener(id, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', handler);
        }
    }

    addInputListener(id, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', handler);
        }
    }

    handleKeyboardShortcuts(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case 'r':
                    event.preventDefault();
                    this.refreshFiles();
                    break;
            }
        }
        
        if (event.key === 'Escape') {
            this.hideAllModals();
        }
    }

    hideAllModals() {
        this.hideCreateFolderModal();
        this.hideErrorModal();
        this.hideExportFormatModal();
    }

    secureCleanup() {
        if (this.state.googleToken) {
            this.state.googleToken = null;
        }
        if (this.state.microsoftToken) {
            this.state.microsoftToken = null;
        }
        
        sessionStorage.removeItem('google_token');
        sessionStorage.removeItem('microsoft_token');
    }

    async initializeAPIs() {
        try {
            await this.waitForGoogleAPI();
            await this.waitForMSAL();
        } catch (error) {
            console.error('API initialization failed:', error);
            throw error;
        }
    }

    waitForGoogleAPI() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100;
            
            const checkGoogle = () => {
                attempts++;
                if (typeof google !== 'undefined' && google.accounts) {
                    console.log('✅ Google Identity Services loaded');
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Google API failed to load'));
                } else {
                    setTimeout(checkGoogle, 100);
                }
            };
            checkGoogle();
        });
    }

    waitForMSAL() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 100;
            
            const checkMSAL = () => {
                attempts++;
                if (typeof msal !== 'undefined' && msal.PublicClientApplication) {
                    try {
                        this.state.msalInstance = new msal.PublicClientApplication({
                            auth: {
                                clientId: this.config.microsoft.clientId,
                                authority: this.config.microsoft.authority,
                                redirectUri: this.config.microsoft.redirectUri
                            },
                            cache: {
                                cacheLocation: 'sessionStorage',
                                storeAuthStateInCookie: false
                            }
                        });
                        console.log('✅ Microsoft MSAL initialized');
                        resolve();
                    } catch (error) {
                        console.error('❌ MSAL initialization error:', error);
                        reject(error);
                    }
                } else if (attempts >= maxAttempts) {
                    reject(new Error('MSAL failed to load'));
                } else {
                    setTimeout(checkMSAL, 100);
                }
            };
            
            checkMSAL();
        });
    }

    async authenticateGoogle() {
        try {
            console.log('🔐 Starting Google authentication...');
            
            sessionStorage.removeItem('google_token');
            this.state.googleToken = null;
            
            this.checkRateLimit('google');
            
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.clientId,
                scope: this.config.google.scopes.join(' '),
                callback: (response) => {
                    if (response.access_token && !response.error) {
                        console.log('✅ Google authentication successful!');
                        
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
                        this.addTransferLog('Google Drive authentication successful', 'success');
                    } else {
                        console.error('Google authentication failed:', response.error);
                        this.showNotification('Google authentication failed. Please try again.', 'error');
                        this.showErrorModal('Google Authentication Failed', response.error_description || 'Please try again.');
                    }
                },
                error_callback: (error) => {
                    console.error('Google OAuth error:', error);
                    this.showNotification('Google authentication failed. Please try again.', 'error');
                    this.showErrorModal('Google Authentication Error', error.message || 'Authentication was cancelled or failed.');
                }
            });
            
            client.requestAccessToken();
            
        } catch (error) {
            console.error('Google authentication error:', error);
            this.showNotification('Google authentication failed. Please try again.', 'error');
            this.showErrorModal('Google Authentication Error', error.message);
        }
    }

    async authenticateMicrosoft() {
        try {
            console.log('🔐 Starting Microsoft authentication...');
            
            if (!this.state.msalInstance) {
                throw new Error('Microsoft MSAL not initialized');
            }
            
            sessionStorage.removeItem('microsoft_token');
            this.state.microsoftToken = null;
            
            this.checkRateLimit('microsoft');
            
            const loginRequest = {
                scopes: this.config.microsoft.scopes,
                prompt: 'select_account'
            };
            
            const response = await this.state.msalInstance.loginPopup(loginRequest);
            
            if (response.accessToken) {
                console.log('✅ Microsoft authentication successful!');
                
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
                this.addTransferLog('OneDrive authentication successful', 'success');
            } else {
                throw new Error('No access token received');
            }
            
        } catch (error) {
            console.error('Microsoft authentication error:', error);
            this.showNotification('Microsoft authentication failed. Please try again.', 'error');
            this.showErrorModal('Microsoft Authentication Error', error.message);
        }
    }

    updateConnectionStatus(service, connected) {
        const statusElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-status`);
        if (statusElement) {
            const statusSpan = statusElement.querySelector('.status');
            if (statusSpan) {
                statusSpan.textContent = connected ? 'Connected' : 'Disconnected';
                statusSpan.className = connected ? 'status status--success' : 'status status--error';
            }
        }
    }

    checkProceedButton() {
        const googleConnected = !!this.state.googleToken;
        const microsoftConnected = !!this.state.microsoftToken;
        const bothConnected = googleConnected && microsoftConnected;
        
        const proceedBtn = document.getElementById('proceed-btn');
        if (proceedBtn) {
            proceedBtn.disabled = !bothConnected;
        }
    }

    checkExistingAuth() {
        const googleToken = sessionStorage.getItem('google_token');
        const microsoftToken = sessionStorage.getItem('microsoft_token');
        
        if (googleToken && !googleToken.includes('demo_')) {
            try {
                const tokenData = JSON.parse(googleToken);
                if (this.isTokenValid(tokenData)) {
                    this.state.googleToken = tokenData.access_token;
                    this.updateConnectionStatus('google', true);
                    this.addTransferLog('Restored Google Drive session', 'info');
                }
            } catch (e) {
                sessionStorage.removeItem('google_token');
            }
        }
        
        if (microsoftToken && !microsoftToken.includes('demo_')) {
            try {
                const tokenData = JSON.parse(microsoftToken);
                if (this.isTokenValid(tokenData)) {
                    this.state.microsoftToken = tokenData.access_token;
                    this.updateConnectionStatus('onedrive', true);
                    this.addTransferLog('Restored OneDrive session', 'info');
                }
            } catch (e) {
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
        const isValid = Date.now() < (expirationTime - 60000);
        
        if (!isValid) {
            console.log('🔒 Token expired, will need re-authentication');
        }
        
        return isValid;
    }

    initTransferLogSystem() {
        this.showTransferProgress();
        this.addTransferLog('Transfer log system initialized - Smart incremental transfers with Google Workspace export enabled', 'info');
    }

    showDashboard() {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';
        
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        
        this.addTransferLog('Dashboard loaded - both services connected', 'info');
    }

    async loadGoogleDriveFiles() {
        if (!this.state.googleToken) return;

        try {
            this.checkRateLimit('google');
            
            const response = await fetch(
                `${this.config.endpoints.google.drive}/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents,webViewLink)&pageSize=1000`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                this.state.googleFiles = data.files || [];
                this.renderFileList('google', this.state.googleFiles);
                this.renderFolderNavigation('google');
                console.log('✅ Loaded Google Drive files:', this.state.googleFiles.length);
            } else if (response.status === 401) {
                this.handleTokenExpiry('google');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to load Google Drive files:', error);
            this.showNotification('Failed to load Google Drive files', 'error');
            this.addTransferLog(`Failed to load Google Drive files: ${error.message}`, 'error');
        }
    }

    async loadOneDriveFiles() {
        if (!this.state.microsoftToken) return;

        try {
            this.checkRateLimit('microsoft');
            
            const endpoint = this.state.currentOneDriveFolder === 'root' 
                ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;

            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.state.microsoftToken}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.state.oneDriveFiles = data.value || [];
                this.renderFileList('onedrive', this.state.oneDriveFiles);
                this.renderFolderNavigation('onedrive');
                console.log('✅ Loaded OneDrive files:', this.state.oneDriveFiles.length);
            } else if (response.status === 401) {
                this.handleTokenExpiry('onedrive');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to load OneDrive files:', error);
            this.showNotification('Failed to load OneDrive files', 'error');
            this.addTransferLog(`Failed to load OneDrive files: ${error.message}`, 'error');
        }
    }

    handleTokenExpiry(service) {
        console.log(`🔒 ${service} token expired`);
        this.addTransferLog(`${service} session expired - please reconnect`, 'warning');
        
        if (service === 'google') {
            this.state.googleToken = null;
            sessionStorage.removeItem('google_token');
            this.updateConnectionStatus('google', false);
        } else {
            this.state.microsoftToken = null;
            sessionStorage.removeItem('microsoft_token');
            this.updateConnectionStatus('onedrive', false);
        }
        
        this.showNotification(`${service} session expired. Please reconnect.`, 'warning');
    }

    renderFolderNavigation(service) {
        const breadcrumbElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-breadcrumb`);
        if (!breadcrumbElement) return;
        
        const folderPath = service === 'google' ? this.state.googleFolderPath : this.state.onedriveFolderPath;
        
        const breadcrumbHTML = folderPath.map((folder, index) => {
            const isLast = index === folderPath.length - 1;
            const safeFolderName = this.escapeHtml(folder.name);
            return `
                <span class="breadcrumb__item ${isLast ? 'breadcrumb__item--active' : ''}" 
                      ${!isLast ? `onclick="app.navigateToFolder('${service}', '${folder.id}', ${index})"` : ''}
                      title="${safeFolderName}">
                    ${safeFolderName}
                </span>
                ${!isLast ? '<span class="breadcrumb__separator">></span>' : ''}
            `;
        }).join('');
        
        breadcrumbElement.innerHTML = breadcrumbHTML;
    }

    async navigateToFolder(service, folderId, pathIndex) {
        try {
            if (service === 'google') {
                this.state.currentGoogleFolder = folderId;
                this.state.googleFolderPath = this.state.googleFolderPath.slice(0, pathIndex + 1);
                await this.loadGoogleDriveFiles();
                this.state.selectedGoogleFiles.clear();
            } else {
                this.state.currentOneDriveFolder = folderId;
                this.state.onedriveFolderPath = this.state.onedriveFolderPath.slice(0, pathIndex + 1);
                await this.loadOneDriveFiles();
                this.state.selectedOneDriveFiles.clear();
            }
            
            this.updateTransferButtons();
            const folderName = service === 'google' ? this.state.googleFolderPath[pathIndex].name : this.state.onedriveFolderPath[pathIndex].name;
            this.addTransferLog(`Navigated to folder: ${this.escapeHtml(folderName)} in ${service}`, 'info');
        } catch (error) {
            console.error('Navigation failed:', error);
            this.addTransferLog(`Navigation failed: ${error.message}`, 'error');
        }
    }

    async openFolder(service, folderId, folderName) {
        try {
            const safeFolderName = this.sanitizeInput(folderName);
            
            if (service === 'google') {
                this.state.currentGoogleFolder = folderId;
                this.state.googleFolderPath.push({ id: folderId, name: safeFolderName });
                await this.loadGoogleDriveFiles();
                this.state.selectedGoogleFiles.clear();
            } else {
                this.state.currentOneDriveFolder = folderId;
                this.state.onedriveFolderPath.push({ id: folderId, name: safeFolderName });
                await this.loadOneDriveFiles();
                this.state.selectedOneDriveFiles.clear();
            }
            
            this.updateTransferButtons();
            this.addTransferLog(`Opened folder: ${this.escapeHtml(safeFolderName)} in ${service}`, 'info');
        } catch (error) {
            console.error('Open folder failed:', error);
            this.addTransferLog(`Failed to open folder: ${error.message}`, 'error');
        }
    }

    renderFileList(service, files) {
        const fileListElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-file-list`);
        if (!fileListElement) return;

        if (files.length === 0) {
            fileListElement.innerHTML = '<div class="empty-state">No files found</div>';
            return;
        }

        const folders = files.filter(file => this.isFolder(file, service));
        const regularFiles = files.filter(file => !this.isFolder(file, service));
        
        folders.sort((a, b) => a.name.localeCompare(b.name));
        regularFiles.sort((a, b) => a.name.localeCompare(b.name));
        
        const sortedFiles = [...folders, ...regularFiles];

        const fileItems = sortedFiles.map(file => {
            const isFolder = this.isFolder(file, service);
            const fileSize = file.size ? this.formatFileSize(file.size) : '';
            const modifiedDate = file.modifiedTime || file.lastModifiedDateTime || '';
            const isSelected = service === 'google' 
                ? this.state.selectedGoogleFiles.has(file.id)
                : this.state.selectedOneDriveFiles.has(file.id);
            
            const safeFileName = this.escapeHtml(file.name);
            const safeFileId = this.escapeHtml(file.id);
            
            // Add Google Workspace indicator
            const isGoogleWorkspace = service === 'google' && this.isGoogleWorkspaceFile(file);
            const workspaceIndicator = isGoogleWorkspace ? '<span class="workspace-badge" title="Google Workspace file - will show export options">📄*</span>' : '';
            
            return `
                <div class="file-item ${isFolder ? 'file-item--folder' : ''} ${isSelected ? 'file-item--selected' : ''} ${isGoogleWorkspace ? 'file-item--workspace' : ''}" 
                     data-file-id="${safeFileId}" data-service="${service}">
                    <div class="file-checkbox">
                        <input type="checkbox" 
                               id="file-${service}-${safeFileId}" 
                               ${isSelected ? 'checked' : ''}
                               onchange="app.toggleFileSelection('${service}', '${safeFileId}')"
                               aria-label="Select ${safeFileName}">
                    </div>
                    <div class="file-icon" ${isFolder ? `onclick="app.openFolder('${service}', '${safeFileId}', '${safeFileName}')"` : ''}>
                        ${this.getFileIcon(file)}
                    </div>
                    <div class="file-info" ${isFolder ? `onclick="app.openFolder('${service}', '${safeFileId}', '${safeFileName}')"` : ''}>
                        <div class="file-name" title="${safeFileName}">${safeFileName} ${workspaceIndicator}</div>
                        <div class="file-meta">
                            ${fileSize} ${modifiedDate ? '• ' + new Date(modifiedDate).toLocaleDateString() : ''}
                        </div>
                    </div>
                    <div class="file-actions">
                        ${!isFolder ? `<button class="btn btn--ghost btn--small" onclick="app.downloadFile('${service}', '${safeFileId}', '${safeFileName}')" title="Download ${safeFileName}">⬇️</button>` : ''}
                        <button class="btn btn--ghost btn--small" onclick="app.getShareLink('${service}', '${safeFileId}', '${safeFileName}')" title="Share ${safeFileName}">🔗</button>
                    </div>
                </div>
            `;
        }).join('');

        fileListElement.innerHTML = fileItems;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    sanitizeInput(input) {
        if (!input) return '';
        return input.replace(/[<>'"&]/g, '').trim();
    }

    isFolder(file, service) {
        if (service === 'google') {
            return file.mimeType === 'application/vnd.google-apps.folder';
        } else {
            return file.folder !== undefined;
        }
    }

    // Google Workspace File Detection and Export Functionality
    isGoogleWorkspaceFile(fileInfo) {
        if (!fileInfo || !fileInfo.mimeType) return false;
        
        const workspaceMimeTypes = [
            'application/vnd.google-apps.document',     // Google Docs
            'application/vnd.google-apps.spreadsheet', // Google Sheets
            'application/vnd.google-apps.presentation', // Google Slides
            'application/vnd.google-apps.drawing',     // Google Drawings
            'application/vnd.google-apps.form',        // Google Forms
            'application/vnd.google-apps.script',      // Google Apps Script
            'application/vnd.google-apps.site'         // Google Sites (limited support)
        ];
        
        return workspaceMimeTypes.includes(fileInfo.mimeType);
    }

    getGoogleWorkspaceExportFormats(mimeType) {
        const exportFormats = {
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
        
        return exportFormats[mimeType] || {};
    }

    async handleGoogleWorkspaceExport(fileId, fileInfo) {
        return new Promise((resolve, reject) => {
            this.currentExportFile = { fileId, fileInfo, resolve, reject };
            this.showExportFormatModal(fileInfo);
        });
    }

    showExportFormatModal(fileInfo) {
        const modal = document.getElementById('export-format-modal');
        const overlay = document.getElementById('modal-overlay');
        const fileInfoElement = document.getElementById('export-file-info');
        const optionsContainer = document.getElementById('export-format-options');
        
        if (!modal || !overlay) return;
        
        // Update file info
        fileInfoElement.textContent = `Select the format to export "${fileInfo.name}":`;
        
        // Get available formats
        const formats = this.getGoogleWorkspaceExportFormats(fileInfo.mimeType);
        
        // Clear previous options
        optionsContainer.innerHTML = '';
        
        // Create format options
        Object.entries(formats).forEach(([mimeType, formatInfo]) => {
            const option = document.createElement('div');
            option.className = 'export-format-option';
            option.dataset.mimeType = mimeType;
            option.onclick = () => this.selectExportFormat(option, mimeType);
            
            const icon = this.getFormatIcon(mimeType);
            
            option.innerHTML = `
                <div class="format-icon">${icon}</div>
                <div class="format-name">${formatInfo.name}</div>
                <div class="format-description">${this.getFormatDescription(mimeType, fileInfo.mimeType)}</div>
            `;
            
            optionsContainer.appendChild(option);
        });
        
        // Show modal
        modal.classList.remove('hidden');
        overlay.classList.remove('hidden');
        
        // Select first option by default
        const firstOption = optionsContainer.querySelector('.export-format-option');
        if (firstOption) {
            this.selectExportFormat(firstOption, firstOption.dataset.mimeType);
        }
    }

    selectExportFormat(optionElement, mimeType) {
        // Clear previous selection
        document.querySelectorAll('.export-format-option').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Select current option
        optionElement.classList.add('selected');
        this.selectedExportFormat = mimeType;
    }

    getFormatIcon(mimeType) {
        const iconMap = {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📄',
            'application/pdf': '📕',
            'text/html': '🌐',
            'application/rtf': '📝',
            'text/plain': '📃',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
            'text/csv': '📈',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
            'image/jpeg': '🖼️',
            'image/png': '🖼️',
            'image/svg+xml': '🎨',
            'application/zip': '🗜️',
            'application/epub+zip': '📚',
            'application/vnd.google-apps.script+json': '⚙️'
        };
        
        return iconMap[mimeType] || '📄';
    }

    getFormatDescription(exportMimeType, originalMimeType) {
        const descriptions = {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Best for editing in Microsoft Word',
            'application/pdf': 'Best for sharing and printing',
            'text/html': 'Best for web publishing',
            'text/plain': 'Plain text without formatting',
            'text/csv': 'Best for data analysis',
            'image/jpeg': 'Compressed image format',
            'image/png': 'High quality image format',
            'application/zip': 'Complete web page with assets'
        };
        
        return descriptions[exportMimeType] || 'Standard format';
    }

    async confirmExportFormat() {
        if (!this.selectedExportFormat || !this.currentExportFile) {
            this.showNotification('Please select an export format', 'warning');
            return;
        }
        
        const { fileId, fileInfo, resolve, reject } = this.currentExportFile;
        
        try {
            this.hideExportFormatModal();
            
            this.addTransferLog(`📤 Exporting ${this.escapeHtml(fileInfo.name)} as ${this.getGoogleWorkspaceExportFormats(fileInfo.mimeType)[this.selectedExportFormat].name}`, 'info');
            
            // Export the file
            const blob = await this.exportGoogleWorkspaceFile(fileId, fileInfo, this.selectedExportFormat);
            
            // Update filename with correct extension
            const formatInfo = this.getGoogleWorkspaceExportFormats(fileInfo.mimeType)[this.selectedExportFormat];
            if (formatInfo && formatInfo.extension) {
                const baseName = fileInfo.name.replace(/\.[^/.]+$/, ""); // Remove existing extension if any
                fileInfo.name = baseName + formatInfo.extension;
            }
            
            resolve(blob);
            
        } catch (error) {
            this.hideExportFormatModal();
            reject(error);
        } finally {
            this.currentExportFile = null;
            this.selectedExportFormat = null;
        }
    }

    hideExportFormatModal() {
        const modal = document.getElementById('export-format-modal');
        const overlay = document.getElementById('modal-overlay');
        
        if (modal && overlay) {
            modal.classList.add('hidden');
            overlay.classList.add('hidden');
        }
        
        // If user cancels, reject the promise
        if (this.currentExportFile && this.currentExportFile.reject) {
            this.currentExportFile.reject(new Error('Export cancelled by user'));
            this.currentExportFile = null;
            this.selectedExportFormat = null;
        }
    }

    async exportGoogleWorkspaceFile(fileId, fileInfo, exportMimeType) {
        try {
            this.checkRateLimit('google');
            
            // Export the file
            const response = await fetch(
                `${this.config.endpoints.google.drive}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
                {
                    headers: { 
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }
            );
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpiry('google');
                }
                if (response.status === 403) {
                    throw new Error(`Export not allowed. File may be too large or you don't have permission.`);
                }
                throw new Error(`Failed to export Google Workspace file: ${response.status} - ${response.statusText}`);
            }
            
            const formatName = this.getGoogleWorkspaceExportFormats(fileInfo.mimeType)[exportMimeType]?.name || 'selected format';
            this.addTransferLog(`✅ Successfully exported as ${formatName}`, 'success');
            
            return await response.blob();
            
        } catch (error) {
            this.addTransferLog(`❌ Failed to export Google Workspace file: ${error.message}`, 'error');
            throw error;
        }
    }

    async downloadFileBlobById(fileId, service) {
        this.checkRateLimit(service);
        
        if (service === 'google') {
            // First, get file info to check if it's a Google Workspace file
            const fileInfo = await this.fetchFileInfoById(fileId, service);
            
            if (this.isGoogleWorkspaceFile(fileInfo)) {
                // Show format selection modal for Google Workspace files
                return await this.handleGoogleWorkspaceExport(fileId, fileInfo);
            } else {
                // Handle regular files
                const response = await fetch(`${this.config.endpoints.google.drive}/files/${fileId}?alt=media`, {
                    headers: { 
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (!response.ok) {
                    if (response.status === 401) {
                        this.handleTokenExpiry('google');
                    }
                    if (response.status === 403) {
                        throw new Error(`Access denied. File may be a Google Workspace document or you don't have permission.`);
                    }
                    throw new Error(`Failed to download from Google Drive: ${response.status} - ${response.statusText}`);
                }
                
                return await response.blob();
            }
        } else {
            // OneDrive logic remains the same
            const response = await fetch(`${this.config.endpoints.microsoft.graph}/me/drive/items/${fileId}/content`, {
                headers: { 
                    'Authorization': `Bearer ${this.state.microsoftToken}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this.handleTokenExpiry('onedrive');
                }
                throw new Error(`Failed to download from OneDrive: ${response.status} - ${response.statusText}`);
            }
            
            return await response.blob();
        }
    }

    toggleFileSelection(service, fileId) {
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedSet.has(fileId)) {
            selectedSet.delete(fileId);
        } else {
            selectedSet.add(fileId);
        }
        
        const fileItem = document.querySelector(`[data-file-id="${fileId}"][data-service="${service}"]`);
        if (fileItem) {
            if (selectedSet.has(fileId)) {
                fileItem.classList.add('file-item--selected');
            } else {
                fileItem.classList.remove('file-item--selected');
            }
        }
        
        this.updateTransferButtons();
    }

    selectAllFiles(service) {
        const files = service === 'google' ? this.state.googleFiles : this.state.oneDriveFiles;
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        files.forEach(file => selectedSet.add(file.id));
        
        files.forEach(file => {
            const checkbox = document.getElementById(`file-${service}-${file.id}`);
            if (checkbox) checkbox.checked = true;
        });
        
        this.renderFileList(service, files);
        this.updateTransferButtons();
        this.addTransferLog(`Selected all files in ${service} (${files.length} items)`, 'info');
    }

    clearAllSelections(service) {
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        const files = service === 'google' ? this.state.googleFiles : this.state.oneDriveFiles;
        
        selectedSet.clear();
        
        files.forEach(file => {
            const checkbox = document.getElementById(`file-${service}-${file.id}`);
            if (checkbox) checkbox.checked = false;
        });
        
        this.renderFileList(service, files);
        this.updateTransferButtons();
        this.addTransferLog(`Cleared all selections in ${service}`, 'info');
    }

    updateTransferButtons() {
        const transferToOneDriveBtn = document.getElementById('transfer-to-onedrive');
        const transferToGoogleBtn = document.getElementById('transfer-to-google');
        
        if (transferToOneDriveBtn) {
            const count = this.state.selectedGoogleFiles.size;
            transferToOneDriveBtn.disabled = count === 0;
            transferToOneDriveBtn.textContent = count > 0 
                ? `Transfer ${count} Selected to OneDrive →`
                : 'Transfer Selected to OneDrive →';
        }
        
        if (transferToGoogleBtn) {
            const count = this.state.selectedOneDriveFiles.size;
            transferToGoogleBtn.disabled = count === 0;
            transferToGoogleBtn.textContent = count > 0
                ? `← Transfer ${count} Selected to Google Drive`
                : '← Transfer Selected to Google Drive';
        }
    }

    // SMART INCREMENTAL TRANSFER SYSTEM
    async transferSelectedFiles(from, to) {
        const selectedFiles = from === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedFiles.size === 0) {
            this.showNotification('No files selected for transfer', 'warning');
            return;
        }
        
        if (!this.validateTokens(from, to)) {
            this.showNotification('Authentication required. Please reconnect your services.', 'error');
            return;
        }
        
        this.addTransferLog(`🚀 Starting SMART incremental transfer of ${selectedFiles.size} items from ${from} to ${to}`, 'info');
        this.showNotification(`Starting smart transfer of ${selectedFiles.size} item(s)...`, 'info');
        
        // Clear transfer cache for fresh analysis
        this.state.transferCache.clear();
        
        const fileArray = Array.from(selectedFiles);
        const batches = this.createBatches(fileArray, this.config.settings.batchSize);
        
        let totalSuccess = 0;
        let totalFailed = 0;
        let totalSkipped = 0;
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            this.addTransferLog(`📦 Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} items)`, 'info');
            
            const batchPromises = batch.map(fileId => this.smartTransferSingleFile(fileId, from, to));
            const results = await Promise.allSettled(batchPromises);
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    if (result.value === 'transferred') {
                        totalSuccess++;
                    } else if (result.value === 'skipped') {
                        totalSkipped++;
                    } else {
                        totalFailed++;
                    }
                } else {
                    totalFailed++;
                    const fileId = batch[index];
                    const fileInfo = this.getFileInfo(fileId, from);
                    const fileName = fileInfo?.name || fileId;
                    this.addTransferLog(`❌ Failed to transfer: ${this.escapeHtml(fileName)} - ${result.reason || 'Unknown error'}`, 'error');
                }
            });
            
            if (batchIndex < batches.length - 1) {
                await this.delay(this.config.settings.retryDelay);
            }
        }
        
        selectedFiles.clear();
        this.updateTransferButtons();
        
        this.renderFileList('google', this.state.googleFiles);
        this.renderFileList('onedrive', this.state.oneDriveFiles);
        
        const message = `Smart transfer complete! ✅ ${totalSuccess} transferred, ⏭️ ${totalSkipped} skipped, ❌ ${totalFailed} failed`;
        this.addTransferLog(message, totalSuccess > 0 ? 'success' : (totalSkipped > 0 ? 'info' : 'error'));
        this.showNotification(message, totalSuccess > 0 ? 'success' : 'info');
        
        setTimeout(() => {
            this.refreshFiles();
        }, 3000);
    }

    validateTokens(from, to) {
        const fromToken = from === 'google' ? this.state.googleToken : this.state.microsoftToken;
        const toToken = to === 'google' ? this.state.googleToken : this.state.microsoftToken;
        
        return fromToken && toToken;
    }

    createBatches(array, batchSize) {
        const batches = [];
        for (let i = 0; i < array.length; i += batchSize) {
            batches.push(array.slice(i, i + batchSize));
        }
        return batches;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // SMART TRANSFER WITH DUPLICATE DETECTION
    async smartTransferSingleFile(fileId, from, to, retryCount = 0) {
        try {
            return await this.smartTransferWithDuplicateCheck(fileId, from, to);
        } catch (error) {
            if (retryCount < this.config.settings.retryAttempts) {
                this.addTransferLog(`🔄 Retrying transfer (attempt ${retryCount + 1}/${this.config.settings.retryAttempts})`, 'warning');
                await this.delay(this.config.settings.retryDelay * (retryCount + 1));
                return this.smartTransferSingleFile(fileId, from, to, retryCount + 1);
            } else {
                throw error;
            }
        }
    }

    async smartTransferWithDuplicateCheck(fileId, from, to) {
        try {
            // Get file info
            let fileInfo = this.getFileInfo(fileId, from);
            
            if (!fileInfo) {
                this.addTransferLog(`🔍 File not in current view, fetching info for ID: ${fileId}`, 'info');
                fileInfo = await this.fetchFileInfoById(fileId, from);
            }
            
            if (!fileInfo) {
                throw new Error(`File not found: ${fileId}`);
            }
            
            // Check if item already exists in destination
            const existingItem = await this.checkIfItemExists(fileInfo.name, to);
            
            if (existingItem) {
                if (this.isFolder(fileInfo, from)) {
                    // For folders, perform incremental sync
                    this.addTransferLog(`📁 Folder "${this.escapeHtml(fileInfo.name)}" exists, performing incremental sync`, 'info');
                    return await this.incrementalFolderSync(fileInfo, existingItem, from, to);
                } else {
                    // For files, check if they're identical
                    const areIdentical = await this.areFilesIdentical(fileInfo, existingItem, from, to);
                    if (areIdentical) {
                        this.addTransferLog(`⏭️ Skipping identical file: ${this.escapeHtml(fileInfo.name)}`, 'info');
                        return 'skipped';
                    } else {
                        // Files differ, transfer with new name
                        const newName = this.generateUniqueFileName(fileInfo.name, existingItem.name);
                        this.addTransferLog(`🔄 File differs, transferring as: ${this.escapeHtml(newName)}`, 'info');
                        return await this.transferSingleFileWithInfo({...fileInfo, name: newName}, from, to);
                    }
                }
            } else {
                // Item doesn't exist, proceed with normal transfer
                return await this.transferSingleFileWithInfo(fileInfo, from, to);
            }
            
        } catch (error) {
            const fileInfo = this.getFileInfo(fileId, from);
            const fileName = fileInfo?.name || fileId;
            this.addTransferLog(`❌ Smart transfer failed: ${this.escapeHtml(fileName)} - ${error.message}`, 'error');
            throw error;
        }
    }

    async checkIfItemExists(itemName, service) {
        try {
            const cacheKey = `${service}:${this.getCurrentFolderId(service)}:${itemName}`;
            if (this.state.transferCache.has(cacheKey)) {
                return this.state.transferCache.get(cacheKey);
            }
            
            this.checkRateLimit(service);
            
            let existingItems;
            
            if (service === 'google') {
                const query = `name='${itemName.replace(/'/g, "\\'")}' and '${this.state.currentGoogleFolder}' in parents and trashed=false`;
                const response = await fetch(
                    `${this.config.endpoints.google.drive}/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,modifiedTime)`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.state.googleToken}`,
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    existingItems = data.files || [];
                }
            } else {
                const currentFolder = this.state.currentOneDriveFolder;
                const endpoint = currentFolder === 'root' 
                    ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                    : `${this.config.endpoints.microsoft.graph}/me/drive/items/${currentFolder}/children`;
                
                const response = await fetch(`${endpoint}?$filter=name eq '${itemName.replace(/'/g, "''")}'`, {
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    existingItems = data.value || [];
                }
            }
            
            const existingItem = existingItems && existingItems.length > 0 ? existingItems[0] : null;
            this.state.transferCache.set(cacheKey, existingItem);
            return existingItem;
            
        } catch (error) {
            console.error('Error checking if item exists:', error);
            return null;
        }
    }

    getCurrentFolderId(service) {
        return service === 'google' ? this.state.currentGoogleFolder : this.state.currentOneDriveFolder;
    }

    async areFilesIdentical(file1, file2, service1, service2) {
        try {
            // Basic checks
            if (file1.size !== file2.size) {
                return false;
            }
            
            // Check modification times if available
            const time1 = new Date(file1.modifiedTime || file1.lastModifiedDateTime || 0).getTime();
            const time2 = new Date(file2.modifiedTime || file2.lastModifiedDateTime || 0).getTime();
            const timeDiff = Math.abs(time1 - time2);
            
            // If modification times are very close (within 2 seconds), consider identical
            if (timeDiff < 2000) {
                return true;
            }
            
            // For small files, we could do content comparison, but for now we'll be conservative
            return false;
            
        } catch (error) {
            console.error('Error comparing files:', error);
            return false;
        }
    }

    generateUniqueFileName(originalName, existingName) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const lastDot = originalName.lastIndexOf('.');
        
        if (lastDot === -1) {
            return `${originalName} (${timestamp})`;
        } else {
            const name = originalName.substring(0, lastDot);
            const extension = originalName.substring(lastDot);
            return `${name} (${timestamp})${extension}`;
        }
    }

    async incrementalFolderSync(sourceFolder, destinationFolder, from, to) {
        try {
            this.addTransferLog(`📁 Starting incremental sync for folder: ${this.escapeHtml(sourceFolder.name)}`, 'info');
            
            // Get contents of both folders
            const sourceContents = await this.getFolderContents(sourceFolder.id, from);
            const destContents = await this.getFolderContents(destinationFolder.id, to);
            
            this.addTransferLog(`📊 Source: ${sourceContents.length} items, Destination: ${destContents.length} items`, 'info');
            
            if (sourceContents.length === 0) {
                this.addTransferLog(`📁 Source folder is empty, sync complete`, 'info');
                return 'skipped';
            }
            
            // Create a map of destination items by name for quick lookup
            const destItemMap = new Map();
            destContents.forEach(item => {
                destItemMap.set(item.name, item);
            });
            
            // Save current folder context
            const originalGoogleFolder = this.state.currentGoogleFolder;
            const originalOneDriveFolder = this.state.currentOneDriveFolder;
            
            // Set context to the destination folder for transfers
            if (to === 'google') {
                this.state.currentGoogleFolder = destinationFolder.id;
            } else {
                this.state.currentOneDriveFolder = destinationFolder.id;
            }
            
            let transferredCount = 0;
            let skippedCount = 0;
            
            // Process each item in source folder
            for (const sourceItem of sourceContents) {
                try {
                    const destItem = destItemMap.get(sourceItem.name);
                    
                    if (!destItem) {
                        // Item doesn't exist in destination, transfer it
                        this.addTransferLog(`📄 New item found: ${this.escapeHtml(sourceItem.name)}`, 'info');
                        const result = await this.transferSingleFileWithInfo(sourceItem, from, to);
                        if (result === 'transferred') {
                            transferredCount++;
                        }
                    } else if (this.isFolder(sourceItem, from) && this.isFolder(destItem, to)) {
                        // Both are folders, recurse
                        this.addTransferLog(`📁 Recursing into subfolder: ${this.escapeHtml(sourceItem.name)}`, 'info');
                        const subResult = await this.incrementalFolderSync(sourceItem, destItem, from, to);
                        if (subResult === 'transferred') {
                            transferredCount++;
                        } else {
                            skippedCount++;
                        }
                    } else if (!this.isFolder(sourceItem, from) && !this.isFolder(destItem, to)) {
                        // Both are files, check if identical
                        const areIdentical = await this.areFilesIdentical(sourceItem, destItem, from, to);
                        if (!areIdentical) {
                            // Files differ, transfer with new name
                            const newName = this.generateUniqueFileName(sourceItem.name, destItem.name);
                            this.addTransferLog(`🔄 File differs, transferring as: ${this.escapeHtml(newName)}`, 'info');
                            const result = await this.transferSingleFileWithInfo({...sourceItem, name: newName}, from, to);
                            if (result === 'transferred') {
                                transferredCount++;
                            }
                        } else {
                            this.addTransferLog(`⏭️ Skipping identical file: ${this.escapeHtml(sourceItem.name)}`, 'info');
                            skippedCount++;
                        }
                    } else {
                        // Type mismatch (file vs folder with same name), transfer with new name
                        const newName = this.generateUniqueFileName(sourceItem.name, destItem.name);
                        this.addTransferLog(`🔄 Name conflict (different types), transferring as: ${this.escapeHtml(newName)}`, 'info');
                        const result = await this.transferSingleFileWithInfo({...sourceItem, name: newName}, from, to);
                        if (result === 'transferred') {
                            transferredCount++;
                        }
                    }
                    
                } catch (error) {
                    this.addTransferLog(`❌ Failed to sync item: ${this.escapeHtml(sourceItem.name)} - ${error.message}`, 'error');
                }
            }
            
            // Restore original folder context
            this.state.currentGoogleFolder = originalGoogleFolder;
            this.state.currentOneDriveFolder = originalOneDriveFolder;
            
            this.addTransferLog(`📁 Incremental sync complete for "${this.escapeHtml(sourceFolder.name)}": ${transferredCount} transferred, ${skippedCount} skipped`, 'success');
            return transferredCount > 0 ? 'transferred' : 'skipped';
            
        } catch (error) {
            this.addTransferLog(`❌ Incremental folder sync failed: ${this.escapeHtml(sourceFolder.name)} - ${error.message}`, 'error');
            throw error;
        }
    }

    async transferSingleFileWithInfo(fileInfo, from, to) {
        try {
            if (!fileInfo) {
                throw new Error('File info not provided');
            }
            
            if (this.isFolder(fileInfo, from)) {
                return await this.transferFolder(fileInfo, from, to);
            }
            
            if (fileInfo.size && fileInfo.size > this.config.settings.maxFileSize) {
                const sizeMB = Math.round(fileInfo.size / (1024 * 1024));
                const maxSizeMB = Math.round(this.config.settings.maxFileSize / (1024 * 1024));
                throw new Error(`File too large: ${sizeMB}MB exceeds limit of ${maxSizeMB}MB`);
            }
            
            this.addTransferLog(`📥 Downloading: ${this.escapeHtml(fileInfo.name)}`, 'info');
            
            const fileBlob = await this.downloadFileBlobById(fileInfo.id, from);
            
            this.addTransferLog(`📤 Uploading: ${this.escapeHtml(fileInfo.name)}`, 'info');
            
            const uploadSuccess = await this.uploadFileBlob(fileBlob, fileInfo.name, to);
            
            if (uploadSuccess) {
                this.addTransferLog(`✅ Successfully transferred: ${this.escapeHtml(fileInfo.name)}`, 'success');
                return 'transferred';
            } else {
                throw new Error('Upload failed');
            }
            
        } catch (error) {
            this.addTransferLog(`❌ Failed to transfer: ${this.escapeHtml(fileInfo.name)} - ${error.message}`, 'error');
            throw error;
        }
    }

    async transferFolder(folderInfo, from, to) {
        try {
            this.addTransferLog(`📁 Processing folder: ${this.escapeHtml(folderInfo.name)}`, 'info');
            
            // Check if folder already exists
            const existingFolder = await this.checkIfItemExists(folderInfo.name, to);
            
            let targetFolderId;
            
            if (existingFolder && this.isFolder(existingFolder, to)) {
                this.addTransferLog(`📁 Folder already exists, using existing: ${this.escapeHtml(folderInfo.name)}`, 'info');
                targetFolderId = existingFolder.id;
            } else if (existingFolder && !this.isFolder(existingFolder, to)) {
                // Name conflict with a file, create with unique name
                const uniqueName = this.generateUniqueFileName(folderInfo.name, existingFolder.name);
                this.addTransferLog(`📁 Name conflict with file, creating folder as: ${this.escapeHtml(uniqueName)}`, 'info');
                targetFolderId = await this.createFolder(uniqueName, to);
            } else {
                // Folder doesn't exist, create it
                this.addTransferLog(`📁 Creating new folder: ${this.escapeHtml(folderInfo.name)}`, 'info');
                targetFolderId = await this.createFolder(folderInfo.name, to);
            }
            
            if (!targetFolderId) {
                throw new Error('Failed to create or access folder');
            }
            
            // Get folder contents
            const folderContents = await this.getFolderContents(folderInfo.id, from);
            
            if (folderContents.length === 0) {
                this.addTransferLog(`📁 Empty folder processed: ${this.escapeHtml(folderInfo.name)}`, 'success');
                return 'transferred';
            }
            
            this.addTransferLog(`📁 Found ${folderContents.length} items in folder: ${this.escapeHtml(folderInfo.name)}`, 'info');
            
            // Save current destination context
            const originalGoogleFolder = this.state.currentGoogleFolder;
            const originalOneDriveFolder = this.state.currentOneDriveFolder;
            
            // Set destination context to the target folder
            if (to === 'google') {
                this.state.currentGoogleFolder = targetFolderId;
            } else {
                this.state.currentOneDriveFolder = targetFolderId;
            }
            
            // Transfer folder contents with smart duplicate checking
            let successCount = 0;
            for (const item of folderContents) {
                try {
                    this.addTransferLog(`📄 Processing: ${this.escapeHtml(item.name)}`, 'info');
                    const result = await this.transferSingleFileWithInfo(item, from, to);
                    if (result === 'transferred') {
                        successCount++;
                    }
                } catch (error) {
                    this.addTransferLog(`❌ Failed to transfer folder item: ${this.escapeHtml(item.name)} - ${error.message}`, 'error');
                }
            }
            
            // Restore original destination context
            this.state.currentGoogleFolder = originalGoogleFolder;
            this.state.currentOneDriveFolder = originalOneDriveFolder;
            
            this.addTransferLog(`📁 Folder processing complete: ${this.escapeHtml(folderInfo.name)} (${successCount}/${folderContents.length} items transferred)`, 'success');
            return successCount > 0 ? 'transferred' : 'skipped';
            
        } catch (error) {
            this.addTransferLog(`❌ Failed to transfer folder: ${this.escapeHtml(folderInfo.name)} - ${error.message}`, 'error');
            throw error;
        }
    }

    async createFolder(folderName, service) {
        try {
            const safeFolderName = this.sanitizeInput(folderName);
            if (!safeFolderName) {
                throw new Error('Invalid folder name');
            }
            
            this.checkRateLimit(service);
            
            if (service === 'onedrive') {
                const parentPath = this.state.currentOneDriveFolder === 'root' 
                    ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                    : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;
                    
                const response = await fetch(parentPath, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        name: safeFolderName,
                        folder: {}
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return data.id;
                } else {
                    const errorText = await response.text();
                    throw new Error(`OneDrive folder creation failed: ${response.status} - ${errorText}`);
                }
            } else {
                const response = await fetch(`${this.config.endpoints.google.drive}/files`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        name: safeFolderName,
                        mimeType: 'application/vnd.google-apps.folder',
                        parents: [this.state.currentGoogleFolder]
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return data.id;
                } else {
                    const errorText = await response.text();
                    throw new Error(`Google Drive folder creation failed: ${response.status} - ${errorText}`);
                }
            }
        } catch (error) {
            console.error('Create folder error:', error);
            this.addTransferLog(`❌ Create folder error: ${error.message}`, 'error');
        }
        return null;
    }

    async getFolderContents(folderId, service) {
        try {
            this.checkRateLimit(service);
            
            if (service === 'google') {
                const response = await fetch(
                    `${this.config.endpoints.google.drive}/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents)&pageSize=1000`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.state.googleToken}`,
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    }
                );
                
                if (response.ok) {
                    const data = await response.json();
                    return data.files || [];
                } else {
                    const errorText = await response.text();
                    throw new Error(`Google Drive folder contents failed: ${response.status} - ${errorText}`);
                }
            } else {
                const response = await fetch(`${this.config.endpoints.microsoft.graph}/me/drive/items/${folderId}/children`, {
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return data.value || [];
                } else {
                    const errorText = await response.text();
                    throw new Error(`OneDrive folder contents failed: ${response.status} - ${errorText}`);
                }
            }
        } catch (error) {
            console.error('Get folder contents error:', error);
            this.addTransferLog(`❌ Get folder contents error: ${error.message}`, 'error');
        }
        return [];
    }

    getFileInfo(fileId, service) {
        if (service === 'google') {
            return this.state.googleFiles.find(f => f.id === fileId);
        } else {
            return this.state.oneDriveFiles.find(f => f.id === fileId);
        }
    }

    async fetchFileInfoById(fileId, service) {
        try {
            this.checkRateLimit(service);
            
            if (service === 'google') {
                const response = await fetch(
                    `${this.config.endpoints.google.drive}/files/${fileId}?fields=id,name,size,mimeType,modifiedTime,parents`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.state.googleToken}`,
                            'X-Requested-With': 'XMLHttpRequest'
                        }
                    }
                );
                
                if (response.ok) {
                    return await response.json();
                } else {
                    throw new Error(`Failed to fetch Google file info: ${response.status}`);
                }
            } else {
                const response = await fetch(`${this.config.endpoints.microsoft.graph}/me/drive/items/${fileId}`, {
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.ok) {
                    return await response.json();
                } else {
                    throw new Error(`Failed to fetch OneDrive file info: ${response.status}`);
                }
            }
        } catch (error) {
            console.error('Failed to fetch file info:', error);
            return null;
        }
    }

    async uploadFileBlob(fileBlob, fileName, service) {
        try {
            const safeFileName = this.sanitizeInput(fileName);
            if (!safeFileName) {
                throw new Error('Invalid filename');
            }
            
            this.checkRateLimit(service);
            
            if (service === 'onedrive') {
                const uploadPath = this.state.currentOneDriveFolder === 'root'
                    ? `${this.config.endpoints.microsoft.graph}/me/drive/root:/${encodeURIComponent(safeFileName)}:/content`
                    : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}:/${encodeURIComponent(safeFileName)}:/content`;
                    
                const response = await fetch(uploadPath, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'Content-Type': 'application/octet-stream',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: fileBlob
                });
                
                if (response.status === 401) {
                    this.handleTokenExpiry('onedrive');
                }
                
                return response.ok;
            } else {
                const metadata = {
                    name: safeFileName,
                    parents: [this.state.currentGoogleFolder]
                };
                
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
                form.append('file', fileBlob);
                
                const response = await fetch(`${this.config.endpoints.google.upload}/files?uploadType=multipart`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: form
                });
                
                if (response.status === 401) {
                    this.handleTokenExpiry('google');
                }
                
                return response.ok;
            }
        } catch (error) {
            console.error('Upload error:', error);
            return false;
        }
    }

    getFileIcon(file) {
        if (file.mimeType === 'application/vnd.google-apps.folder' || file.folder) {
            return '📁';
        }
        
        // Google Workspace files
        if (file.mimeType === 'application/vnd.google-apps.document') return '📄';
        if (file.mimeType === 'application/vnd.google-apps.spreadsheet') return '📊';
        if (file.mimeType === 'application/vnd.google-apps.presentation') return '📈';
        if (file.mimeType === 'application/vnd.google-apps.drawing') return '🎨';
        if (file.mimeType === 'application/vnd.google-apps.script') return '⚙️';
        if (file.mimeType === 'application/vnd.google-apps.form') return '📝';
        
        const name = file.name ? file.name.toLowerCase() : '';
        const mimeType = file.mimeType || '';
        
        if (name.match(/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/) || mimeType.startsWith('image/')) return '🖼️';
        if (name.match(/\.(pdf)$/) || mimeType.includes('pdf')) return '📄';
        if (name.match(/\.(doc|docx)$/) || mimeType.includes('document')) return '📝';
        if (name.match(/\.(xls|xlsx|csv)$/) || mimeType.includes('spreadsheet')) return '📊';
        if (name.match(/\.(ppt|pptx)$/) || mimeType.includes('presentation')) return '📈';
        if (name.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/) || mimeType.startsWith('video/')) return '🎥';
        if (name.match(/\.(mp3|wav|flac|aac|ogg|m4a)$/) || mimeType.startsWith('audio/')) return '🎵';
        if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return '🗜️';
        if (name.match(/\.(js|html|css|py|java|cpp|c|php|rb)$/)) return '💻';
        if (name.match(/\.(txt|md|rtf)$/) || mimeType.startsWith('text/')) return '📃';
        
        return '📄';
    }

    formatFileSize(bytes) {
        if (!bytes) return '';
        
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async downloadFile(service, fileId, fileName) {
        try {
            const safeFileName = this.sanitizeInput(fileName);
            this.addTransferLog(`📥 Downloading ${this.escapeHtml(safeFileName)} from ${service}`, 'info');
            
            const fileBlob = await this.downloadFileBlobById(fileId, service);
            
            const url = window.URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = safeFileName;
            a.setAttribute('download', safeFileName);
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
            }, 100);
            
            this.addTransferLog(`✅ Downloaded ${this.escapeHtml(safeFileName)} successfully`, 'success');
            
        } catch (error) {
            console.error('Download failed:', error);
            this.addTransferLog(`❌ Failed to download ${this.escapeHtml(fileName)}: ${error.message}`, 'error');
        }
    }

    async getShareLink(service, fileId, fileName) {
        try {
            const safeFileName = this.sanitizeInput(fileName);
            this.addTransferLog(`🔗 Generating share link for ${this.escapeHtml(safeFileName)}`, 'info');
            
            this.checkRateLimit(service);
            
            let shareUrl = '';
            
            if (service === 'google') {
                await fetch(`${this.config.endpoints.google.drive}/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        role: 'reader',
                        type: 'anyone'
                    })
                });
                
                shareUrl = `https://drive.google.com/file/d/${fileId}/view`;
            } else {
                const response = await fetch(`${this.config.endpoints.microsoft.graph}/me/drive/items/${fileId}/createLink`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({
                        type: 'view',
                        scope: 'anonymous'
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    shareUrl = data.link.webUrl;
                }
            }
            
            if (shareUrl) {
                await navigator.clipboard.writeText(shareUrl);
                this.addTransferLog(`✅ Share link copied to clipboard for ${this.escapeHtml(safeFileName)}`, 'success');
                this.showNotification(`Share link copied to clipboard for ${safeFileName}`, 'success');
            } else {
                throw new Error('Failed to generate share link');
            }
            
        } catch (error) {
            console.error('Share link generation failed:', error);
            this.addTransferLog(`❌ Failed to generate share link for ${this.escapeHtml(fileName)}: ${error.message}`, 'error');
        }
    }

    searchFiles(service, query) {
        const files = service === 'google' ? this.state.googleFiles : this.state.oneDriveFiles;
        
        const safeQuery = this.sanitizeInput(query);
        
        if (!safeQuery.trim()) {
            this.renderFileList(service, files);
            return;
        }
        
        const filteredFiles = files.filter(file => 
            file.name && file.name.toLowerCase().includes(safeQuery.toLowerCase())
        );
        
        this.renderFileList(service, filteredFiles);
        this.addTransferLog(`Search results: ${filteredFiles.length} files found for "${this.escapeHtml(safeQuery)}" in ${service}`, 'info');
    }

    showCreateFolderModal(service) {
        this.currentFolderService = service;
        const modal = document.getElementById('create-folder-modal');
        const overlay = document.getElementById('modal-overlay');
        if (modal && overlay) {
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
            const input = document.getElementById('folder-name-input');
            if (input) {
                input.focus();
                input.select();
            }
        }
    }

    hideCreateFolderModal() {
        const modal = document.getElementById('create-folder-modal');
        const overlay = document.getElementById('modal-overlay');
        if (modal && overlay) {
            modal.classList.add('hidden');
            overlay.classList.add('hidden');
            const input = document.getElementById('folder-name-input');
            if (input) {
                input.value = '';
            }
        }
    }

    async confirmCreateFolder() {
        const folderNameInput = document.getElementById('folder-name-input');
        if (!folderNameInput) return;
        
        const folderName = this.sanitizeInput(folderNameInput.value);
        if (!folderName) {
            this.showNotification('Please enter a valid folder name', 'warning');
            return;
        }

        if (folderName.length > 255) {
            this.showNotification('Folder name too long (maximum 255 characters)', 'warning');
            return;
        }

        try {
            const folderId = await this.createFolder(folderName, this.currentFolderService);
            if (folderId) {
                this.addTransferLog(`✅ Created folder: ${this.escapeHtml(folderName)} in ${this.currentFolderService}`, 'success');
                this.showNotification(`Folder "${folderName}" created successfully`, 'success');
                this.hideCreateFolderModal();
                
                if (this.currentFolderService === 'google') {
                    await this.loadGoogleDriveFiles();
                } else {
                    await this.loadOneDriveFiles();
                }
            } else {
                throw new Error('Failed to create folder');
            }
        } catch (error) {
            this.addTransferLog(`❌ Failed to create folder: ${this.escapeHtml(folderName)} - ${error.message}`, 'error');
            this.showNotification(`Failed to create folder: ${error.message}`, 'error');
        }
    }

    showErrorModal(title, message) {
        const modal = document.getElementById('error-modal');
        const overlay = document.getElementById('modal-overlay');
        const titleElement = document.getElementById('error-modal-title');
        const messageElement = document.getElementById('error-message');
        
        if (modal && overlay && titleElement && messageElement) {
            titleElement.textContent = title;
            messageElement.textContent = message;
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
        }
    }

    hideErrorModal() {
        const modal = document.getElementById('error-modal');
        const overlay = document.getElementById('modal-overlay');
        if (modal && overlay) {
            modal.classList.add('hidden');
            overlay.classList.add('hidden');
        }
    }

    showTransferProgress() {
        const progressPanel = document.getElementById('transfer-progress');
        if (progressPanel) {
            progressPanel.style.display = 'block';
        }
    }

    addTransferLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = {
            timestamp,
            message: this.sanitizeInput(message),
            type,
            id: Date.now()
