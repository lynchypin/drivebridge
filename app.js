// DriveBridge - Universal File Sharing Application
// Security: All operations happen client-side, no data sent to external servers

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
            rateLimiter: new Map() // Track API request rates
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
        // Check for secure context in production
        if (typeof window !== 'undefined') {
            const isProduction = window.location.hostname.includes('.github.io') || 
                                window.location.hostname.includes('drivebridge');
            const isSecure = window.location.protocol === 'https:' || 
                           window.location.hostname === 'localhost';
            
            if (isProduction && !isSecure) {
                throw new Error('🔒 SECURITY ERROR: Production environment requires HTTPS');
            }
            
            // Validate OAuth client IDs are configured
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
        if (recentRequests.length >= this.config.settings.maxRequestsPerMinute) {
            throw new Error(`Rate limit exceeded for ${service}. Please wait before making more requests.`);
        }
        
        // Add current request
        recentRequests.push(now);
        this.state.rateLimiter.set(rateLimitKey, recentRequests);
    }

    async init() {
        try {
            console.log('🚀 Initializing DriveBridge...');
            
            // Clear any stuck modals immediately
            this.clearAllModals();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Initialize APIs
            await this.initializeAPIs();
            
            // Check for existing authentication
            this.checkExistingAuth();
            
            // Initialize transfer log system
            this.initTransferLogSystem();
            
            console.log('✅ DriveBridge initialized successfully');
            this.showNotification('DriveBridge ready! Connect your cloud services to get started.', 'info');
            
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showNotification('Failed to initialize DriveBridge. Please refresh the page.', 'error');
        }
    }

    clearAllModals() {
        // Force close all modals and overlays
        document.querySelectorAll('.modal, .popup, [id*="modal"], [id*="popup"]').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        
        document.querySelectorAll('.modal-backdrop, .overlay, .modal-overlay').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        
        // Reset body
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
        // Security: Only handle shortcuts when not in input fields
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case 'r':
                    event.preventDefault();
                    this.refreshFiles();
                    break;
                case 'a':
                    event.preventDefault();
                    // Select all in focused panel
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
    }

    secureCleanup() {
        // Clear sensitive data on page unload
        if (this.state.googleToken) {
            this.state.googleToken = null;
        }
        if (this.state.microsoftToken) {
            this.state.microsoftToken = null;
        }
        
        // Clear session storage
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
                                storeAuthStateInCookie: false // Security: don't store in cookies
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
            
            // Security: Clear any existing tokens
            sessionStorage.removeItem('google_token');
            this.state.googleToken = null;
            
            // Rate limiting
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
                        
                        // Store token securely in session storage only
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
            
            // Security: Clear any existing tokens
            sessionStorage.removeItem('microsoft_token');
            this.state.microsoftToken = null;
            
            // Rate limiting
            this.checkRateLimit('microsoft');
            
            const loginRequest = {
                scopes: this.config.microsoft.scopes,
                prompt: 'select_account' // Security: always show account picker
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
                
                // Store token securely in session storage only
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
        // Check for stored tokens
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
        const isValid = Date.now() < (expirationTime - 60000); // 1 minute buffer
        
        if (!isValid) {
            console.log('🔒 Token expired, will need re-authentication');
        }
        
        return isValid;
    }

    initTransferLogSystem() {
        this.showTransferProgress();
        this.addTransferLog('Transfer log system initialized', 'info');
    }

    showDashboard() {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';
        
        // Load files from both services
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        
        this.addTransferLog('Dashboard loaded - both services connected', 'info');
    }

    async loadGoogleDriveFiles() {
        if (!this.state.googleToken) return;

        try {
            // Rate limiting
            this.checkRateLimit('google');
            
            const response = await fetch(
                `${this.config.endpoints.google.drive}/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents,webViewLink)&pageSize=1000`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest' // Security header
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
                // Token expired
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
            // Rate limiting
            this.checkRateLimit('microsoft');
            
            const endpoint = this.state.currentOneDriveFolder === 'root' 
                ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;

            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.state.microsoftToken}`,
                    'X-Requested-With': 'XMLHttpRequest' // Security header
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.state.oneDriveFiles = data.value || [];
                this.renderFileList('onedrive', this.state.oneDriveFiles);
                this.renderFolderNavigation('onedrive');
                console.log('✅ Loaded OneDrive files:', this.state.oneDriveFiles.length);
            } else if (response.status === 401) {
                // Token expired
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
        
        // Clear expired token
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

        // Separate folders and files, then sort
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
            
            return `
                <div class="file-item ${isFolder ? 'file-item--folder' : ''} ${isSelected ? 'file-item--selected' : ''}" 
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
                        <div class="file-name" title="${safeFileName}">${safeFileName}</div>
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
        // Remove potentially dangerous characters
        return input.replace(/[<>'"&]/g, '').trim();
    }

    isFolder(file, service) {
        if (service === 'google') {
            return file.mimeType === 'application/vnd.google-apps.folder';
        } else {
            return file.folder !== undefined;
        }
    }

    toggleFileSelection(service, fileId) {
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedSet.has(fileId)) {
            selectedSet.delete(fileId);
        } else {
            selectedSet.add(fileId);
        }
        
        // Update file item appearance
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
        
        // Update checkboxes
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
        
        // Update checkboxes
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

    async transferSelectedFiles(from, to) {
        const selectedFiles = from === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedFiles.size === 0) {
            this.showNotification('No files selected for transfer', 'warning');
            return;
        }
        
        // Security: Validate tokens before starting transfer
        if (!this.validateTokens(from, to)) {
            this.showNotification('Authentication required. Please reconnect your services.', 'error');
            return;
        }
        
        this.addTransferLog(`🚀 Starting transfer of ${selectedFiles.size} files from ${from} to ${to}`, 'info');
        this.showNotification(`Starting transfer of ${selectedFiles.size} file(s)...`, 'info');
        
        // Process files in batches
        const fileArray = Array.from(selectedFiles);
        const batches = this.createBatches(fileArray, this.config.settings.batchSize);
        
        let totalSuccess = 0;
        let totalFailed = 0;
        
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            this.addTransferLog(`📦 Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} files)`, 'info');
            
            // Process batch files with retry logic
            const batchPromises = batch.map(fileId => this.transferSingleFileWithRetry(fileId, from, to));
            const results = await Promise.allSettled(batchPromises);
            
            // Count results
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    totalSuccess++;
                } else {
                    totalFailed++;
                    const fileId = batch[index];
                    const fileInfo = this.getFileInfo(fileId, from);
                    const fileName = fileInfo?.name || fileId;
                    this.addTransferLog(`❌ Failed to transfer: ${this.escapeHtml(fileName)} - ${result.reason || 'Unknown error'}`, 'error');
                }
            });
            
            // Add delay between batches to avoid rate limiting
            if (batchIndex < batches.length - 1) {
                await this.delay(this.config.settings.retryDelay);
            }
        }
        
        // Clear selections
        selectedFiles.clear();
        this.updateTransferButtons();
        
        // Re-render file lists to clear selections
        this.renderFileList('google', this.state.googleFiles);
        this.renderFileList('onedrive', this.state.oneDriveFiles);
        
        // Show final results
        const message = `Transfer complete! ✅ ${totalSuccess} successful, ❌ ${totalFailed} failed`;
        this.addTransferLog(message, totalSuccess > 0 ? 'success' : 'error');
        this.showNotification(message, totalSuccess > 0 ? 'success' : 'error');
        
        // Refresh file lists to show new files
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

    async transferSingleFileWithRetry(fileId, from, to, retryCount = 0) {
        try {
            return await this.transferSingleFile(fileId, from, to);
        } catch (error) {
            if (retryCount < this.config.settings.retryAttempts) {
                this.addTransferLog(`🔄 Retrying transfer (attempt ${retryCount + 1}/${this.config.settings.retryAttempts})`, 'warning');
                await this.delay(this.config.settings.retryDelay * (retryCount + 1));
                return this.transferSingleFileWithRetry(fileId, from, to, retryCount + 1);
            } else {
                throw error;
            }
        }
    }

    async transferSingleFile(fileId, from, to) {
        try {
            // Get file info
            const fileInfo = this.getFileInfo(fileId, from);
            if (!fileInfo) {
                throw new Error('File not found');
            }
            
            // Check if it's a folder
            if (this.isFolder(fileInfo, from)) {
                return await this.transferFolder(fileInfo, from, to);
            }
            
            // Check file size
            if (fileInfo.size && fileInfo.size > this.config.settings.maxFileSize) {
                const sizeMB = Math.round(fileInfo.size / (1024 * 1024));
                const maxSizeMB = Math.round(this.config.settings.maxFileSize / (1024 * 1024));
                throw new Error(`File too large: ${sizeMB}MB exceeds limit of ${maxSizeMB}MB`);
            }
            
            this.addTransferLog(`📥 Downloading: ${this.escapeHtml(fileInfo.name)}`, 'info');
            
            // Download file
            const fileBlob = await this.downloadFileBlob(fileId, from);
            
            this.addTransferLog(`📤 Uploading: ${this.escapeHtml(fileInfo.name)}`, 'info');
            
            // Upload to destination
            const uploadSuccess = await this.uploadFileBlob(fileBlob, fileInfo.name, to);
            
            if (uploadSuccess) {
                this.addTransferLog(`✅ Successfully transferred: ${this.escapeHtml(fileInfo.name)}`, 'success');
                return true;
            } else {
                throw new Error('Upload failed');
            }
            
        } catch (error) {
            const fileInfo = this.getFileInfo(fileId, from);
            const fileName = fileInfo?.name || fileId;
            this.addTransferLog(`❌ Failed to transfer: ${this.escapeHtml(fileName)} - ${error.message}`, 'error');
            throw error;
        }
    }

    async transferFolder(folderInfo, from, to) {
        try {
            this.addTransferLog(`📁 Creating folder: ${this.escapeHtml(folderInfo.name)}`, 'info');
            
            // Create folder in destination
            const newFolderId = await this.createFolder(folderInfo.name, to);
            if (!newFolderId) {
                throw new Error('Failed to create folder');
            }
            
            this.addTransferLog(`📁 Folder created: ${this.escapeHtml(folderInfo.name)}`, 'success');
            
            // Get folder contents
            const folderContents = await this.getFolderContents(folderInfo.id, from);
            
            if (folderContents.length === 0) {
                this.addTransferLog(`📁 Empty folder transferred: ${this.escapeHtml(folderInfo.name)}`, 'success');
                return true;
            }
            
            this.addTransferLog(`📁 Found ${folderContents.length} items in folder: ${this.escapeHtml(folderInfo.name)}`, 'info');
            
            // Save current destination context
            const originalGoogleFolder = this.state.currentGoogleFolder;
            const originalOneDriveFolder = this.state.currentOneDriveFolder;
            
            // Set destination context to the new folder
            if (to === 'google') {
                this.state.currentGoogleFolder = newFolderId;
            } else {
                this.state.currentOneDriveFolder = newFolderId;
            }
            
            // Transfer folder contents recursively
            let successCount = 0;
            for (const item of folderContents) {
                try {
                    const success = await this.transferSingleFileWithRetry(item.id, from, to);
                    if (success) {
                        successCount++;
                    }
                } catch (error) {
                    this.addTransferLog(`❌ Failed to transfer folder item: ${this.escapeHtml(item.name)} - ${error.message}`, 'error');
                }
            }
            
            // Restore original destination context
            this.state.currentGoogleFolder = originalGoogleFolder;
            this.state.currentOneDriveFolder = originalOneDriveFolder;
            
            this.addTransferLog(`📁 Folder transfer complete: ${this.escapeHtml(folderInfo.name)} (${successCount}/${folderContents.length} items)`, 'success');
            return true;
            
        } catch (error) {
            this.addTransferLog(`❌ Failed to transfer folder: ${this.escapeHtml(folderInfo.name)} - ${error.message}`, 'error');
            return false;
        }
    }

    async createFolder(folderName, service) {
        try {
            // Security: Sanitize folder name
            const safeFolderName = this.sanitizeInput(folderName);
            if (!safeFolderName) {
                throw new Error('Invalid folder name');
            }
            
            // Rate limiting
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
            // Rate limiting
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

    async downloadFileBlob(fileId, service) {
        // Rate limiting
        this.checkRateLimit(service);
        
        if (service === 'google') {
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
                throw new Error(`Failed to download from Google Drive: ${response.status}`);
            }
            
            return await response.blob();
        } else {
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
                throw new Error(`Failed to download from OneDrive: ${response.status}`);
            }
            
            return await response.blob();
        }
    }

    async uploadFileBlob(fileBlob, fileName, service) {
        try {
            // Security: Sanitize filename
            const safeFileName = this.sanitizeInput(fileName);
            if (!safeFileName) {
                throw new Error('Invalid filename');
            }
            
            // Rate limiting
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
        
        const name = file.name ? file.name.toLowerCase() : '';
        const mimeType = file.mimeType || '';
        
        // Images
        if (name.match(/\.(jpg|jpeg|png|gif|bmp|svg|webp)$/) || mimeType.startsWith('image/')) return '🖼️';
        
        // Documents
        if (name.match(/\.(pdf)$/) || mimeType.includes('pdf')) return '📄';
        if (name.match(/\.(doc|docx)$/) || mimeType.includes('document')) return '📝';
        if (name.match(/\.(xls|xlsx|csv)$/) || mimeType.includes('spreadsheet')) return '📊';
        if (name.match(/\.(ppt|pptx)$/) || mimeType.includes('presentation')) return '📈';
        
        // Media
        if (name.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)$/) || mimeType.startsWith('video/')) return '🎥';
        if (name.match(/\.(mp3|wav|flac|aac|ogg|m4a)$/) || mimeType.startsWith('audio/')) return '🎵';
        
        // Archives
        if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return '🗜️';
        
        // Code files
        if (name.match(/\.(js|html|css|py|java|cpp|c|php|rb)$/)) return '💻';
        
        // Text files
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
            
            const fileBlob = await this.downloadFileBlob(fileId, service);
            
            // Create download link
            const url = window.URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = safeFileName;
            a.setAttribute('download', safeFileName); // Security: explicit download attribute
            document.body.appendChild(a);
            a.click();
            
            // Security: Clean up immediately
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
            
            // Rate limiting
            this.checkRateLimit(service);
            
            let shareUrl = '';
            
            if (service === 'google') {
                // Make file public and get share link
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
                // Get OneDrive sharing link
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
                // Copy to clipboard
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
        
        // Security: Sanitize search query
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

        // Security: Validate folder name
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
                
                // Refresh the file list
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
            message: this.sanitizeInput(message), // Security: sanitize log messages
            type,
            id: Date.now() + Math.random()
        };
        
        this.state.transferLogs.push(logEntry);
        
        // Keep only recent logs to prevent memory issues
        if (this.state.transferLogs.length > this.config.settings.logRetentionCount) {
            this.state.transferLogs = this.state.transferLogs.slice(-50);
        }
        
        this.renderTransferLogs();
    }

    renderTransferLogs() {
        const logContainer = document.getElementById('transfer-list');
        if (!logContainer) return;
        
        const logsHTML = this.state.transferLogs.slice(-20).map(log => `
            <div class="log-entry log-entry--${log.type}">
                <span class="log-timestamp">${this.escapeHtml(log.timestamp)}</span>
                <span class="log-message">${this.escapeHtml(log.message)}</span>
            </div>
        `).join('');
        
        logContainer.innerHTML = logsHTML;
        
        // Auto-scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    clearTransferLogs() {
        this.state.transferLogs = [];
        const logContainer = document.getElementById('transfer-list');
        if (logContainer) {
            logContainer.innerHTML = '<div class="log-entry log-entry--info"><span class="log-message">Logs cleared</span></div>';
        }
        this.addTransferLog('Transfer logs cleared', 'info');
    }

    toggleTransferLogs() {
        const progressPanel = document.getElementById('transfer-progress');
        const toggleBtn = document.getElementById('toggle-logs-btn');
        
        if (progressPanel && toggleBtn) {
            const isVisible = progressPanel.style.display !== 'none';
            progressPanel.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? '👁️ Show' : '👁️ Hide';
        }
    }

    refreshFiles() {
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        this.addTransferLog('File lists refreshed', 'info');
        this.showNotification('Files refreshed', 'success');
    }

    disconnectAll() {
        // Security: Complete cleanup
        this.secureCleanup();
        
        // Reset state
        this.state.selectedGoogleFiles.clear();
        this.state.selectedOneDriveFiles.clear();
        this.state.currentGoogleFolder = 'root';
        this.state.currentOneDriveFolder = 'root';
        this.state.googleFolderPath = [{ id: 'root', name: 'Root' }];
        this.state.onedriveFolderPath = [{ id: 'root', name: 'Root' }];
        this.state.rateLimiter.clear();
        
        // Update UI
        this.updateConnectionStatus('google', false);
        this.updateConnectionStatus('onedrive', false);
        this.checkProceedButton();
        
        // Go back to auth view
        document.getElementById('dashboard-view').style.display = 'none';
        document.getElementById('auth-view').style.display = 'block';
        
        // Hide transfer progress
        const progressPanel = document.getElementById('transfer-progress');
        if (progressPanel) {
            progressPanel.style.display = 'none';
        }
        
        this.addTransferLog('Disconnected from all services - session data cleared', 'info');
        this.showNotification('Disconnected from all services', 'info');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.className = `notification notification--${type}`;
        notification.textContent = this.sanitizeInput(message);
        notification.setAttribute('role', 'alert');
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// Security: Initialize only when DOM is ready and environment is secure
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🚀 DOM loaded - Creating DriveBridge instance...');
        try {
            app = new DriveBridge();
        } catch (error) {
            console.error('❌ Failed to initialize DriveBridge:', error);
            document.body.innerHTML = `
                <div style="padding: 20px; text-align: center; font-family: Arial, sans-serif;">
                    <h1>🔒 Security Error</h1>
                    <p>${error.message}</p>
                    <p>Please ensure you're accessing this application over HTTPS and have configured your OAuth credentials properly.</p>
                </div>
            `;
        }
    });
} else {
    console.log('🚀 DOM already loaded - Creating DriveBridge instance...');
    try {
        app = new DriveBridge();
    } catch (error) {
        console.error('❌ Failed to initialize DriveBridge:', error);
    }
}
