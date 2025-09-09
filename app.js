// DriveBridge - Main Application
// Production-ready application with chunked transfers and comprehensive logging

class DriveBridge {
    constructor() {
        // Validate environment before initialization
        this.validateEnvironment();
        
        // Initialize core components
        this.logger = new Logger();
        this.uiManager = new UIManager(this.logger);
        this.errorHandler = new ErrorHandler(this.logger, this.uiManager);
        this.transferEngine = new ChunkedTransferEngine();
        
        // Configuration
        this.config = {
            google: {
                clientId: Config.getGoogleClientId(),
                scopes: ['https://www.googleapis.com/auth/drive']
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

        // Application state
        this.state = {
            googleToken: null,
            microsoftToken: null,
            msalInstance: null,
            currentGoogleFolder: 'root',
            currentOneDriveFolder: 'root',
            googleFolderPath: [{ id: 'root', name: 'Root' }],
            onedriveFolderPath: [{ id: 'root', name: 'Root' }],
            selectedGoogleFiles: new Set(),
            selectedOneDriveFiles: new Set(),
            googleFiles: [],
            oneDriveFiles: [],
            activeTransfers: new Map(),
            rateLimiter: new Map(),
            transferCache: new Map(),
            currentExportFile: null,
            selectedExportFormat: null,
            isInitialized: false
        };

        // Initialize when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    // Security and environment validation
    validateEnvironment() {
        if (typeof window !== 'undefined') {
            const isProduction = window.location.hostname.includes('.github.io') || 
                                window.location.hostname.includes('drivebridge');
            const isSecure = window.location.protocol === 'https:' || 
                           window.location.hostname === 'localhost';
            
            if (isProduction && !isSecure) {
                throw new Error('🔒 SECURITY ERROR: Production environment requires HTTPS');
            }
        }
    }

    async init() {
        try {
            this.logger.info('Initializing DriveBridge application', {
                version: '2.0.0',
                chunkedTransfers: true,
                verboseLogging: true
            });
            
            // Make instances globally available
            window.app = this;
            window.logger = this.logger;
            window.uiManager = this.uiManager;
            window.errorHandler = this.errorHandler;
            
            this.clearAllModals();
            this.setupEventListeners();
            await this.initializeAPIs();
            this.checkExistingAuth();
            this.initTransferSystem();
            
            this.state.isInitialized = true;
            
            this.logger.info('DriveBridge initialization completed successfully');
            this.uiManager.showNotification('DriveBridge ready! Connect your cloud services to get started.', 'info');
            
        } catch (error) {
            this.logger.error('Initialization failed', { error: error.message, stack: error.stack });
            this.errorHandler.handleGlobalError({ message: error.message, error });
            this.uiManager.showNotification('Failed to initialize DriveBridge. Please refresh the page.', 'error');
        }
    }

    // FIXED Modal management functions
    clearAllModals() {
        // Hide all modal elements
        document.querySelectorAll('.modal, .popup, [id*="modal"], [id*="popup"]').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
            el.setAttribute('aria-hidden', 'true');
        });
        
        // Hide all overlay elements
        document.querySelectorAll('.modal-backdrop, .overlay, .modal-overlay').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
            
            // Clear backdrop filter effects
            el.style.backdropFilter = '';
            el.style.webkitBackdropFilter = '';
            el.style.filter = '';
        });
        
        // Reset body state completely
        document.body.style.overflow = '';
        document.body.style.filter = '';
        document.body.style.backdropFilter = '';
        document.body.style.webkitBackdropFilter = '';
        document.body.style.pointerEvents = '';
        document.body.style.userSelect = '';
        document.body.style.transform = '';
        document.body.classList.remove('modal-open');
        
        // Reset html state
        document.documentElement.style.filter = '';
        document.documentElement.style.backdropFilter = '';
        document.documentElement.style.webkitBackdropFilter = '';
        
        // Clear any modal tracking
        if (this.uiManager) {
            this.uiManager.activeModals.clear();
        }
        
        this.logger?.debug('All modals and overlays cleared', {}, 'UI');
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
        this.addClickListener('download-logs-btn', () => this.downloadLogs());
        
        // Folder creation
        this.addClickListener('google-new-folder', () => this.showCreateFolderModal('google'));
        this.addClickListener('onedrive-new-folder', () => this.showCreateFolderModal('onedrive'));
        this.addClickListener('create-folder-confirm', () => this.confirmCreateFolder());
        this.addClickListener('create-folder-cancel', () => this.hideCreateFolderModal());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
        
        // Security: Clear tokens on page unload
        window.addEventListener('beforeunload', () => this.secureCleanup());
        
        this.logger.info('Event listeners configured');
    }

    addClickListener(id, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('click', handler);
        } else {
            this.logger.warn(`Element not found: ${id}`, {}, 'UI');
        }
    }

    addInputListener(id, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', handler);
        } else {
            this.logger.warn(`Element not found: ${id}`, {}, 'UI');
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
                case 'l':
                    event.preventDefault();
                    this.downloadLogs();
                    break;
            }
        }
        
        if (event.key === 'Escape') {
            // Force close all modals on Escape
            this.forceCloseAllModals();
        }
    }

    // Force close all modals - emergency cleanup
    forceCloseAllModals() {
        try {
            // Close specific modals
            this.uiManager?.closeModal('export-format-modal');
            this.uiManager?.closeModal('create-folder-modal');
            this.uiManager?.closeModal('transfer-errors-modal');
            
            // Force clear all modal states
            this.clearAllModals();
            
            // Additional cleanup
            setTimeout(() => {
                this.clearAllModals();
            }, 100);
            
            this.logger?.info('Force closed all modals', {}, 'UI');
            
        } catch (error) {
            this.logger?.error('Error force closing modals', { error: error.message }, 'UI');
            
            // Ultimate fallback - reload page if modals won't close
            if (confirm('Modal system appears stuck. Reload the page?')) {
                window.location.reload();
            }
        }
    }

    secureCleanup() {
        this.logger.info('Performing security cleanup');
        
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
            this.logger.info('APIs initialized successfully');
        } catch (error) {
            this.logger.error('API initialization failed', { error: error.message });
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
                    this.logger.info('Google Identity Services loaded');
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
                        this.logger.info('Microsoft MSAL initialized');
                        resolve();
                    } catch (error) {
                        this.logger.error('MSAL initialization error', { error: error.message });
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
            this.logger.info('Starting Google authentication');
            
            sessionStorage.removeItem('google_token');
            this.state.googleToken = null;
            
            this.checkRateLimit('google');
            
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.clientId,
                scope: this.config.google.scopes.join(' '),
                callback: (response) => {
                    if (response.access_token && !response.error) {
                        this.logger.info('Google authentication successful');
                        
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
                        this.uiManager.showNotification('Google Drive connected successfully!', 'success');
                        this.checkProceedButton();
                    } else {
                        const error = new Error(response.error_description || 'Authentication failed');
                        this.errorHandler.handleAuthError('Google Drive', error, response);
                    }
                },
                error_callback: (error) => {
                    this.errorHandler.handleAuthError('Google Drive', error);
                }
            });
            
            client.requestAccessToken();
            
        } catch (error) {
            this.errorHandler.handleAuthError('Google Drive', error);
        }
    }

    async authenticateMicrosoft() {
        try {
            this.logger.info('Starting Microsoft authentication');
            
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
                this.logger.info('Microsoft authentication successful');
                
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
                this.uiManager.showNotification('OneDrive connected successfully!', 'success');
                this.checkProceedButton();
            } else {
                throw new Error('No access token received');
            }
            
        } catch (error) {
            this.errorHandler.handleAuthError('OneDrive', error);
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
        
        this.logger.info(`Connection status updated: ${service} = ${connected}`);
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
                    this.logger.info('Restored Google Drive session');
                }
            } catch (e) {
                sessionStorage.removeItem('google_token');
                this.logger.warn('Invalid stored Google token, removed');
            }
        }
        
        if (microsoftToken && !microsoftToken.includes('demo_')) {
            try {
                const tokenData = JSON.parse(microsoftToken);
                if (this.isTokenValid(tokenData)) {
                    this.state.microsoftToken = tokenData.access_token;
                    this.updateConnectionStatus('onedrive', true);
                    this.logger.info('Restored OneDrive session');
                }
            } catch (e) {
                sessionStorage.removeItem('microsoft_token');
                this.logger.warn('Invalid stored Microsoft token, removed');
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
            this.logger.info('Token expired, will need re-authentication');
        }
        
        return isValid;
    }

    initTransferSystem() {
        this.showTransferProgress();
        this.logger.info('Transfer system initialized with chunked transfers enabled');
    }

    showDashboard() {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';
        
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        
        this.logger.info('Dashboard displayed - both services connected');
    }

    async loadGoogleDriveFiles() {
        if (!this.state.googleToken) return;

        try {
            this.checkRateLimit('google');
            
            const startTime = Date.now();
            const response = await fetch(
                `${this.config.endpoints.google.drive}/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents,webViewLink)&pageSize=1000`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                }
            );
            
            const duration = Date.now() - startTime;

            if (response.ok) {
                const data = await response.json();
                this.state.googleFiles = data.files || [];
                this.renderFileList('google', this.state.googleFiles);
                this.renderFolderNavigation('google');
                
                this.logger.apiCall('GET', 'drive/v3/files', true, response.status, duration);
                this.logger.info(`Loaded Google Drive files: ${this.state.googleFiles.length}`);
            } else if (response.status === 401) {
                this.handleTokenExpiry('google');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.logger.error('Failed to load Google Drive files', { error: error.message });
            this.uiManager.showNotification('Failed to load Google Drive files', 'error');
        }
    }

    async loadOneDriveFiles() {
        if (!this.state.microsoftToken) return;

        try {
            this.checkRateLimit('microsoft');
            
            const endpoint = this.state.currentOneDriveFolder === 'root' 
                ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;

            const startTime = Date.now();
            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.state.microsoftToken}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            const duration = Date.now() - startTime;

            if (response.ok) {
                const data = await response.json();
                this.state.oneDriveFiles = data.value || [];
                this.renderFileList('onedrive', this.state.oneDriveFiles);
                this.renderFolderNavigation('onedrive');
                
                this.logger.apiCall('GET', 'graph/me/drive', true, response.status, duration);
                this.logger.info(`Loaded OneDrive files: ${this.state.oneDriveFiles.length}`);
            } else if (response.status === 401) {
                this.handleTokenExpiry('onedrive');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.logger.error('Failed to load OneDrive files', { error: error.message });
            this.uiManager.showNotification('Failed to load OneDrive files', 'error');
        }
    }

    handleTokenExpiry(service) {
        this.logger.warn(`${service} token expired`);
        
        if (service === 'google') {
            this.state.googleToken = null;
            sessionStorage.removeItem('google_token');
            this.updateConnectionStatus('google', false);
        } else {
            this.state.microsoftToken = null;
            sessionStorage.removeItem('microsoft_token');
            this.updateConnectionStatus('onedrive', false);
        }
        
        this.uiManager.showNotification(`${service} session expired. Please reconnect.`, 'warning');
    }

    checkRateLimit(service) {
        const now = Date.now();
        const rateLimitKey = `${service}_requests`;
        
        if (!this.state.rateLimiter.has(rateLimitKey)) {
            this.state.rateLimiter.set(rateLimitKey, []);
        }
        
        const requests = this.state.rateLimiter.get(rateLimitKey);
        const oneMinuteAgo = now - 60000;
        
        const recentRequests = requests.filter(timestamp => timestamp > oneMinuteAgo);
        this.state.rateLimiter.set(rateLimitKey, recentRequests);
        
        if (recentRequests.length >= this.config.security.maxRequestsPerMinute) {
            throw new Error(`Rate limit exceeded for ${service}. Please wait before making more requests.`);
        }
        
        recentRequests.push(now);
        this.state.rateLimiter.set(rateLimitKey, recentRequests);
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
            this.logger.info(`Navigated to folder: ${folderName} in ${service}`);
        } catch (error) {
            this.logger.error('Navigation failed', { error: error.message, service, folderId });
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
            this.logger.info(`Opened folder: ${safeFolderName} in ${service}`);
        } catch (error) {
            this.logger.error('Failed to open folder', { error: error.message, service, folderId });
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
            
            const isGoogleWorkspace = service === 'google' && this.isGoogleWorkspaceFile(file);
            const workspaceIndicator = isGoogleWorkspace ? '<span class="workspace-badge" title="Google Workspace file">📄*</span>' : '';
            
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
                        ${!isFolder ? `<button class="btn btn--ghost btn--small" onclick="app.downloadFile('${service}', '${safeFileId}', '${safeFileName}')" title="Download">⬇️</button>` : ''}
                        <button class="btn btn--ghost btn--small" onclick="app.getShareLink('${service}', '${safeFileId}', '${safeFileName}')" title="Share">🔗</button>
                    </div>
                </div>
            `;
        }).join('');

        fileListElement.innerHTML = fileItems;
    }

    isFolder(file, service) {
        if (service === 'google') {
            return file.mimeType === 'application/vnd.google-apps.folder';
        } else {
            return file.folder !== undefined;
        }
    }

    isGoogleWorkspaceFile(fileInfo) {
        if (!fileInfo || !fileInfo.mimeType) return false;
        
        const workspaceMimeTypes = [
            'application/vnd.google-apps.document',
            'application/vnd.google-apps.spreadsheet',
            'application/vnd.google-apps.presentation',
            'application/vnd.google-apps.drawing',
            'application/vnd.google-apps.form',
            'application/vnd.google-apps.script',
            'application/vnd.google-apps.site'
        ];
        
        return workspaceMimeTypes.includes(fileInfo.mimeType);
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
        
        files.forEach(file => {
            if (!this.isFolder(file, service)) {
                selectedSet.add(file.id);
            }
        });
        
        files.forEach(file => {
            const checkbox = document.getElementById(`file-${service}-${file.id}`);
            if (checkbox && !this.isFolder(file, service)) checkbox.checked = true;
        });
        
        this.renderFileList(service, files);
        this.updateTransferButtons();
        this.logger.info(`Selected all files in ${service}: ${files.filter(f => !this.isFolder(f, service)).length} items`);
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
        this.logger.info(`Cleared all selections in ${service}`);
    }

    updateTransferButtons() {
        const transferToOneDriveBtn = document.getElementById('transfer-to-onedrive');
        const transferToGoogleBtn = document.getElementById('transfer-to-google');
        
        if (transferToOneDriveBtn) {
            const count = this.state.selectedGoogleFiles.size;
            transferToOneDriveBtn.disabled = count === 0;
            transferToOneDriveBtn.innerHTML = count > 0 
                ? `Transfer ${count} Selected to OneDrive → <span class="chunked-badge">CHUNKED</span>`
                : 'Transfer Selected to OneDrive → <span class="chunked-badge">CHUNKED</span>';
        }
        
        if (transferToGoogleBtn) {
            const count = this.state.selectedOneDriveFiles.size;
            transferToGoogleBtn.disabled = count === 0;
            transferToGoogleBtn.textContent = count > 0
                ? `← Transfer ${count} Selected to Google Drive`
                : '← Transfer Selected to Google Drive';
        }
    }

    // Main transfer method with folder handling
    async transferSelectedFiles(from, to) {
        const selectedFiles = from === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedFiles.size === 0) {
            this.uiManager.showNotification('No files selected for transfer', 'warning');
            return;
        }
        
        if (!this.validateTokens(from, to)) {
            this.uiManager.showNotification('Authentication required. Please reconnect your services.', 'error');
            return;
        }
        
        const transferId = 'batch_' + Date.now();
        const fileArray = Array.from(selectedFiles);
        
        this.logger.transferStart(transferId, fileArray.length, from, to);
        this.uiManager.showNotification(`Starting transfer of ${fileArray.length} selected item(s)...`, 'info');
        
        const results = [];
        let successCount = 0;
        let failedCount = 0;
        
        // Separate files and folders
        const filesToTransfer = [];
        const foldersToProcess = [];
        
        for (let i = 0; i < fileArray.length; i++) {
            const fileId = fileArray[i];
            const fileInfo = this.getFileInfo(fileId, from) || await this.fetchFileInfoById(fileId, from);
            
            if (!fileInfo) {
                const error = new Error(`File not found: ${fileId}`);
                results.push({ success: false, fileId, fileName: 'Unknown', error });
                failedCount++;
                continue;
            }
            
            if (this.isFolder(fileInfo, from)) {
                foldersToProcess.push(fileInfo);
                this.logger.info(`Folder detected: ${fileInfo.name}. Will process contents.`);
            } else {
                filesToTransfer.push(fileInfo);
            }
        }
        
        // Handle folders by getting their contents
        for (const folder of foldersToProcess) {
            try {
                this.uiManager.showNotification(`Processing folder: ${folder.name}...`, 'info');
                const folderContents = await this.getFolderContents(folder.id, from);
                
                if (folderContents.length > 0) {
                    // Create destination folder
                    const destFolderId = await this.createFolder(folder.name, to);
                    this.logger.info(`Created destination folder: ${folder.name}`);
                    
                    // Add all files from folder to transfer list
                    folderContents.forEach(file => {
                        if (!this.isFolder(file, from)) {
                            file._destinationFolder = destFolderId;
                            file._originalFolder = folder.name;
                            filesToTransfer.push(file);
                        }
                    });
                }
            } catch (error) {
                this.logger.error(`Failed to process folder: ${folder.name}`, { error: error.message });
                results.push({ success: false, fileId: folder.id, fileName: folder.name, error });
                failedCount++;
            }
        }
        
        if (filesToTransfer.length === 0) {
            this.uiManager.showNotification('No transferable files found (folders may be empty)', 'warning');
            return;
        }
        
        this.uiManager.showNotification(`Transferring ${filesToTransfer.length} file(s)...`, 'info');
        
        // Process files one by one
        for (let i = 0; i < filesToTransfer.length; i++) {
            const fileInfo = filesToTransfer[i];
            
            try {
                // Create progress bar
                const expectedChunks = fileInfo.size ? Math.ceil(fileInfo.size / Config.getChunkSettings().downloadChunkSize) : 1;
                this.uiManager.createProgressBar(fileInfo.id, fileInfo.name, expectedChunks);
                
                let success = false;
                
                if (from === 'google' && to === 'onedrive') {
                    if (this.isGoogleWorkspaceFile(fileInfo)) {
                        success = await this.transferGoogleWorkspaceFile(fileInfo);
                    } else {
                        const result = await this.transferEngine.transferFileChunked(
                            fileInfo,                                  // ✅ File info
                            fileInfo._destinationFolder || this.state.currentOneDriveFolder,  // ✅ Destination folder ID
                            (progressData) => this.uiManager.updateProgressBar(fileInfo.id, progressData)
                        );

                        success = result;
                    }
                } else {
                    // For other directions, use simpler transfer
                    success = await this.transferFileSimple(fileInfo, from, to);
                }
                
                this.uiManager.completeProgressBar(fileInfo.id, success.success !== false);
                
                if (success.success !== false) {
                    results.push({ success: true, fileId: fileInfo.id, fileName: fileInfo.name });
                    successCount++;
                } else {
                    results.push({ success: false, fileId: fileInfo.id, fileName: fileInfo.name, error: success.error || new Error('Transfer failed') });
                    failedCount++;
                }
                
            } catch (error) {
                this.logger.error(`Transfer failed for ${fileInfo.name}`, { error: error.message });
                this.uiManager.completeProgressBar(fileInfo.id, false);
                
                results.push({ 
                    success: false, 
                    fileId: fileInfo.id, 
                    fileName: fileInfo.name, 
                    error 
                });
                failedCount++;
            }
        }
        
        // Clear selections and refresh
        selectedFiles.clear();
        this.updateTransferButtons();
        this.renderFileList('google', this.state.googleFiles);
        this.renderFileList('onedrive', this.state.oneDriveFiles);
        
        // Show results
        this.logger.transferComplete(transferId, { total: filesToTransfer.length, successful: successCount, failed: failedCount });
        this.errorHandler.showTransferSummary(results);
        
        // Refresh file lists
        setTimeout(() => {
            this.refreshFiles();
        }, 2000);
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
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } else {
                const endpoint = `${this.config.endpoints.microsoft.graph}/me/drive/items/${folderId}/children`;
                const response = await fetch(endpoint, {
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    return data.value || [];
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
        } catch (error) {
            this.logger.error('Failed to get folder contents', { error: error.message, folderId, service });
            throw error;
        }
    }

    async transferGoogleWorkspaceFile(fileInfo) {
        return new Promise((resolve, reject) => {
            const formats = Config.getWorkspaceExportFormats()[fileInfo.mimeType] || {};
            
            // Create export format modal
            const modal = this.uiManager.createModal('export-format-modal', 'Choose Export Format');
            const content = modal.querySelector('.modal-content');
            
            content.innerHTML = `
                <p class="export-info">Select format to export "${this.escapeHtml(fileInfo.name)}":</p>
                <div class="export-format-grid">
                    ${Object.entries(formats).map(([mimeType, formatInfo]) => `
                        <div class="export-format-option" data-mime-type="${mimeType}" onclick="app.selectExportFormat(this, '${mimeType}')">
                            <div class="format-icon">${this.getFileIcon({ mimeType })}</div>
                            <div class="format-name">${this.escapeHtml(formatInfo.name)}</div>
                            <div class="format-description">Standard format</div>
                        </div>
                    `).join('')}
                </div>
                <div class="modal-actions">
                    <button class="btn btn--primary" onclick="app.confirmExportFormat('${fileInfo.id}')">Export & Transfer</button>
                    <button class="btn btn--secondary" onclick="app.cancelExportFormat()">Cancel</button>
                </div>
            `;
            
            // Store callbacks
            this.state.currentExportFile = {
                fileInfo,
                resolve,
                reject
            };
            this.state.selectedExportFormat = null;
            
            this.uiManager.showModal('export-format-modal');
            
            // Auto-select first format
            const firstOption = content.querySelector('.export-format-option');
            if (firstOption) {
                this.selectExportFormat(firstOption, firstOption.dataset.mimeType);
            }
        });
    }

    selectExportFormat(element, mimeType) {
        // Clear previous selection
        document.querySelectorAll('.export-format-option').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Select current
        element.classList.add('selected');
        this.state.selectedExportFormat = mimeType;
    }

    async confirmExportFormat(fileId) {
        if (this.state.selectedExportFormat && this.state.currentExportFile) {
            try {
                // Export the file
                const exportedBlob = await this.transferEngine.exportGoogleWorkspaceFile(
                    this.state.currentExportFile.fileInfo.id, 
                    this.state.googleToken, 
                    this.state.selectedExportFormat
                );
                
                // Update filename with correct extension
                const formats = Config.getWorkspaceExportFormats()[this.state.currentExportFile.fileInfo.mimeType] || {};
                const formatInfo = formats[this.state.selectedExportFormat];
                if (formatInfo && formatInfo.extension) {
                    const baseName = this.state.currentExportFile.fileInfo.name.replace(/\.[^/.]+$/, "");
                    this.state.currentExportFile.fileInfo.name = baseName + formatInfo.extension;
                }
                
                // Upload using chunked engine
                const result = await this.transferEngine.uploadFileInChunks(
                    exportedBlob,
                    this.state.currentExportFile.fileInfo.name,
                    this.state.microsoftToken,
                    this.state.currentOneDriveFolder,
                    'workspace_' + Date.now(),
                    (progressData) => this.uiManager.updateProgressBar(this.state.currentExportFile.fileInfo.id, progressData)
                );
                
                this.state.currentExportFile.resolve({ success: true, result });
                this.uiManager.closeModal('export-format-modal');
                
            } catch (error) {
                this.state.currentExportFile.reject(error);
            }
        }
    }

    cancelExportFormat() {
        if (this.state.currentExportFile) {
            this.state.currentExportFile.reject(new Error('Export cancelled by user'));
            this.uiManager.closeModal('export-format-modal');
        }
    }

    async transferFileSimple(fileInfo, from, to) {
        try {
            const blob = await this.downloadFileBlob(fileInfo.id, from);
            const success = await this.uploadFileBlob(blob, fileInfo.name, to);
            return { success };
        } catch (error) {
            return { success: false, error };
        }
    }

    validateTokens(from, to) {
        const fromToken = from === 'google' ? this.state.googleToken : this.state.microsoftToken;
        const toToken = to === 'google' ? this.state.googleToken : this.state.microsoftToken;
        return fromToken && toToken;
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
                }
            }
        } catch (error) {
            this.logger.error('Failed to fetch file info', { error: error.message, fileId, service });
        }
        return null;
    }

    async downloadFileBlob(fileId, service) {
        this.checkRateLimit(service);
        
        if (service === 'google') {
            const response = await fetch(`${this.config.endpoints.google.drive}/files/${fileId}?alt=media`, {
                headers: { 
                    'Authorization': `Bearer ${this.state.googleToken}`,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!response.ok) {
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
                throw new Error(`Failed to download from OneDrive: ${response.status}`);
            }
            
            return await response.blob();
        }
    }

    async uploadFileBlob(fileBlob, fileName, service) {
        const safeFileName = this.sanitizeInput(fileName);
        this.checkRateLimit(service);
        
        if (service === 'onedrive') {
            const uploadPath = this.state.currentOneDriveFolder === 'root'
                ? `${this.config.endpoints.microsoft.graph}/me/drive/root:/${encodeURIComponent(safeFileName)}:/content`
                : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}:/${encodeURIComponent(safeFileName)}:/content`;
                
            const response = await fetch(uploadPath, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.state.microsoftToken}`,
                    'Content-Type': 'application/octet-stream'
                },
                body: fileBlob
            });
            
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
                    'Authorization': `Bearer ${this.state.googleToken}`
                },
                body: form
            });
            
            return response.ok;
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
        this.logger.info(`Search results: ${filteredFiles.length} files found for "${safeQuery}" in ${service}`);
    }

    async downloadFile(service, fileId, fileName) {
        try {
            this.logger.info(`Downloading ${fileName} from ${service}`);
            const fileBlob = await this.downloadFileBlob(fileId, service);
            
            const url = window.URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }, 100);
            
            this.logger.info(`Downloaded ${fileName} successfully`);
            
        } catch (error) {
            this.logger.error(`Failed to download ${fileName}`, { error: error.message });
        }
    }

    async getShareLink(service, fileId, fileName) {
        try {
            this.logger.info(`Generating share link for ${fileName}`);
            this.checkRateLimit(service);
            
            let shareUrl = '';
            
            if (service === 'google') {
                shareUrl = `https://drive.google.com/file/d/${fileId}/view`;
            } else {
                const response = await fetch(`${this.config.endpoints.microsoft.graph}/me/drive/items/${fileId}/createLink`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'Content-Type': 'application/json'
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
                this.uiManager.showNotification(`Share link copied to clipboard for ${fileName}`, 'success');
                this.logger.info(`Share link copied for ${fileName}`);
            }
            
        } catch (error) {
            this.logger.error(`Failed to generate share link for ${fileName}`, { error: error.message });
        }
    }

    showCreateFolderModal(service) {
        this.currentFolderService = service;
        const modal = this.uiManager.createModal('create-folder-modal', 'Create New Folder');
        const content = modal.querySelector('.modal-content');
        
        content.innerHTML = `
            <input type="text" id="folder-name-input" placeholder="Folder name" class="input" maxlength="255" autocomplete="off">
            <div class="modal-actions">
                <button id="create-folder-confirm" class="btn btn--primary" onclick="app.confirmCreateFolder()">Create</button>
                <button id="create-folder-cancel" class="btn btn--secondary" onclick="app.hideCreateFolderModal()">Cancel</button>
            </div>
        `;
        
        this.uiManager.showModal('create-folder-modal');
        
        const input = document.getElementById('folder-name-input');
        if (input) {
            input.focus();
        }
    }

    hideCreateFolderModal() {
        this.uiManager.closeModal('create-folder-modal');
    }

    async confirmCreateFolder() {
        const folderNameInput = document.getElementById('folder-name-input');
        if (!folderNameInput) return;
        
        const folderName = this.sanitizeInput(folderNameInput.value);
        if (!folderName) {
            this.uiManager.showNotification('Please enter a valid folder name', 'warning');
            return;
        }

        if (folderName.length > 255) {
            this.uiManager.showNotification('Folder name too long (maximum 255 characters)', 'warning');
            return;
        }

        try {
            const folderId = await this.createFolder(folderName, this.currentFolderService);
            if (folderId) {
                this.logger.info(`Created folder: ${folderName} in ${this.currentFolderService}`);
                this.uiManager.showNotification(`Folder "${folderName}" created successfully`, 'success');
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
            this.logger.error(`Failed to create folder: ${folderName}`, { error: error.message });
            this.uiManager.showNotification(`Failed to create folder: ${error.message}`, 'error');
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
                    throw new Error(`OneDrive folder creation failed: ${response.status}`);
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
                    throw new Error(`Google Drive folder creation failed: ${response.status}`);
                }
            }
        } catch (error) {
            this.logger.error('Create folder error', { error: error.message });
            throw error;
        }
    }

    refreshFiles() {
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        this.logger.info('File lists refreshed');
        this.uiManager.showNotification('Files refreshed', 'success');
    }

    disconnectAll() {
        this.secureCleanup();
        
        this.state.selectedGoogleFiles.clear();
        this.state.selectedOneDriveFiles.clear();
        this.state.currentGoogleFolder = 'root';
        this.state.currentOneDriveFolder = 'root';
        this.state.googleFolderPath = [{ id: 'root', name: 'Root' }];
        this.state.onedriveFolderPath = [{ id: 'root', name: 'Root' }];
        this.state.rateLimiter.clear();
        
        this.updateConnectionStatus('google', false);
        this.updateConnectionStatus('onedrive', false);
        this.checkProceedButton();
        
        document.getElementById('dashboard-view').style.display = 'none';
        document.getElementById('auth-view').style.display = 'block';
        
        this.logger.info('Disconnected from all services');
        this.uiManager.showNotification('Disconnected from all services', 'info');
    }

    showTransferProgress() {
        const progressPanel = document.getElementById('transfer-progress');
        if (progressPanel) {
            progressPanel.style.display = 'block';
        }
    }

    clearTransferLogs() {
        this.logger.clearLogs();
        this.uiManager.showNotification('Transfer logs cleared', 'info');
    }

    toggleTransferLogs() {
        const progressPanel = document.getElementById('transfer-progress');
        const toggleBtn = document.getElementById('toggle-logs-btn');
        const logContainer = document.getElementById('transfer-list');
        const header = progressPanel?.querySelector('.transfer-header');
        
        if (progressPanel && toggleBtn && logContainer && header) {
            const isVisible = logContainer.style.display !== 'none';
            
            if (isVisible) {
                logContainer.style.display = 'none';
                toggleBtn.textContent = '👁️ Show';
                header.style.cursor = 'pointer';
                header.title = 'Click to show logs';
                header.onclick = () => this.toggleTransferLogs();
            } else {
                logContainer.style.display = 'block';
                toggleBtn.textContent = '👁️ Hide';
                header.style.cursor = 'default';
                header.title = '';
                header.onclick = null;
            }
        }
    }

    downloadLogs() {
        const success = this.logger.downloadLogFile();
        if (success) {
            this.uiManager.showNotification('Verbose log file downloaded successfully', 'success');
        } else {
            this.uiManager.showNotification('Failed to download log file', 'error');
        }
    }

    // Utility methods
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

    formatFileSize(bytes) {
        if (!bytes) return '';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    getFileIcon(file) {
        const icons = {
            'folder': '📁',
            'pdf': '📄',
            'doc': '📝',
            'sheet': '📊',
            'slide': '📊',
            'image': '🖼️',
            'video': '🎥',
            'audio': '🎵',
            'zip': '📦',
            'txt': '📄',
            'default': '📄'
        };
        
        if (file.mimeType) {
            if (file.mimeType === 'application/vnd.google-apps.folder') return icons.folder;
            if (file.mimeType.includes('pdf')) return icons.pdf;
            if (file.mimeType.includes('document')) return icons.doc;
            if (file.mimeType.includes('spreadsheet')) return icons.sheet;
            if (file.mimeType.includes('presentation')) return icons.slide;
            if (file.mimeType.includes('image')) return icons.image;
            if (file.mimeType.includes('video')) return icons.video;
            if (file.mimeType.includes('audio')) return icons.audio;
            if (file.mimeType.includes('zip')) return icons.zip;
            if (file.mimeType.includes('text')) return icons.txt;
        }
        
        if (file.folder !== undefined) return icons.folder;
        
        return icons.default;
    }
}

// Initialize the application
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
                    <h1>🔒 Initialization Error</h1>
                    <p>${error.message}</p>
                    <p>Please ensure you're accessing this application over HTTPS and have proper OAuth configuration.</p>
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
