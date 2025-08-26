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
            
            // Clear any stuck modals immediately
            this.clearAllModals();
            
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

    clearAllModals() {
        console.log('Clearing all modals and overlays...');
        
        // Force close all modals
        document.querySelectorAll('.modal, .popup, [id*="modal"], [id*="popup"]').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        
        // Clear overlays
        document.querySelectorAll('.modal-backdrop, .overlay, .modal-overlay').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        
        // Reset body
        document.body.style.overflow = 'auto';
        document.body.classList.remove('modal-open');
        
        console.log('✅ All modals cleared');
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
        
        // Search functionality
        const googleSearch = document.getElementById('google-search');
        if (googleSearch) {
            googleSearch.addEventListener('input', (e) => this.searchFiles('google', e.target.value));
        }
        
        const onedriveSearch = document.getElementById('onedrive-search');
        if (onedriveSearch) {
            onedriveSearch.addEventListener('input', (e) => this.searchFiles('onedrive', e.target.value));
        }
        
        console.log('Event listeners setup complete');
    }

    async initializeAPIs() {
        try {
            // Wait for Google Identity Services to load
            await this.waitForGoogleAPI();
            
            // Wait for Microsoft MSAL to load
            await this.waitForMSAL();
            
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
            
            // Timeout after 10 seconds
            setTimeout(() => {
                reject(new Error('Google Identity Services failed to load'));
            }, 10000);
        });
    }

    waitForMSAL() {
        return new Promise((resolve, reject) => {
            const checkMSAL = () => {
                if (typeof msal !== 'undefined' && msal.PublicClientApplication) {
                    try {
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
                        resolve();
                    } catch (error) {
                        console.error('❌ MSAL initialization error:', error);
                        reject(error);
                    }
                } else {
                    setTimeout(checkMSAL, 100);
                }
            };
            
            checkMSAL();
            
            // Timeout after 10 seconds
            setTimeout(() => {
                reject(new Error('MSAL library failed to load'));
            }, 10000);
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
            
            // Clear any existing tokens
            sessionStorage.removeItem('microsoft_token');
            
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
            console.log('Loading Google Drive files...');
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents,webViewLink)&pageSize=1000`,
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
                console.log('✅ Loaded Google Drive files:', this.state.googleFiles.length);
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
            console.log('Loading OneDrive files...');
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
                console.log('✅ Loaded OneDrive files:', this.state.oneDriveFiles.length);
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
            const isSelected = service === 'google' 
                ? this.state.selectedGoogleFiles.has(file.id)
                : this.state.selectedOneDriveFiles.has(file.id);
            
            return `
                <div class="file-item ${isFolder ? 'file-item--folder' : ''} ${isSelected ? 'file-item--selected' : ''}" 
                     data-file-id="${file.id}" data-service="${service}">
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
                            ${isSelected ? 'Deselect' : 'Select'}
                        </button>
                        ${!isFolder ? `<button class="btn btn--ghost btn--small" onclick="app.downloadFile('${service}', '${file.id}', '${file.name}')">Download</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        fileListElement.innerHTML = fileItems;
    }

    getFileIcon(file) {
        // Enhanced file type detection
        if (file.mimeType === 'application/vnd.google-apps.folder' || file.folder) {
            return '📁';
        }
        
        const name = file.name.toLowerCase();
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

    selectFile(service, fileId) {
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedSet.has(fileId)) {
            selectedSet.delete(fileId);
            console.log(`Deselected ${service} file: ${fileId}`);
        } else {
            selectedSet.add(fileId);
            console.log(`Selected ${service} file: ${fileId}`);
        }
        
        // Re-render the file list to show selection changes
        if (service === 'google') {
            this.renderFileList('google', this.state.googleFiles);
        } else {
            this.renderFileList('onedrive', this.state.oneDriveFiles);
        }
        
        // Update transfer button states
        this.updateTransferButtons();
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
        
        console.log(`🚀 Starting transfer of ${selectedFiles.size} files from ${from} to ${to}`);
        this.showNotification(`Starting transfer of ${selectedFiles.size} file(s)...`, 'info');
        
        // Show transfer progress panel
        this.showTransferProgress();
        
        let successCount = 0;
        let failCount = 0;
        
        for (const fileId of selectedFiles) {
            try {
                const success = await this.transferSingleFile(fileId, from, to);
                if (success) {
                    successCount++;
                    this.updateTransferProgress(fileId, from, to, 'completed', 100);
                } else {
                    failCount++;
                    this.updateTransferProgress(fileId, from, to, 'failed', 0);
                }
            } catch (error) {
                console.error(`Failed to transfer file ${fileId}:`, error);
                failCount++;
                this.updateTransferProgress(fileId, from, to, 'failed', 0);
            }
        }
        
        // Clear selections
        selectedFiles.clear();
        this.updateTransferButtons();
        
        // Re-render file lists to clear selections
        this.renderFileList('google', this.state.googleFiles);
        this.renderFileList('onedrive', this.state.oneDriveFiles);
        
        // Show final results
        const message = `Transfer complete! ✅ ${successCount} successful, ❌ ${failCount} failed`;
        this.showNotification(message, successCount > 0 ? 'success' : 'error');
        
        // Refresh file lists to show new files
        setTimeout(() => {
            this.refreshFiles();
        }, 2000);
    }

    async transferSingleFile(fileId, from, to) {
        console.log(`📁 Transferring file ${fileId} from ${from} to ${to}`);
        
        try {
            // Step 1: Get file info
            const fileInfo = await this.getFileInfo(fileId, from);
            if (!fileInfo) {
                throw new Error('File not found');
            }
            
            this.updateTransferProgress(fileId, from, to, 'downloading', 10);
            
            // Step 2: Download file
            const fileBlob = await this.downloadFileBlob(fileId, from);
            this.updateTransferProgress(fileId, from, to, 'downloading', 50);
            
            // Step 3: Upload to destination
            this.updateTransferProgress(fileId, from, to, 'uploading', 75);
            const uploadSuccess = await this.uploadFileBlob(fileBlob, fileInfo.name, to);
            
            if (uploadSuccess) {
                console.log(`✅ Successfully transferred: ${fileInfo.name}`);
                return true;
            } else {
                throw new Error('Upload failed');
            }
            
        } catch (error) {
            console.error(`❌ Transfer failed for ${fileId}:`, error);
            return false;
        }
    }

    async getFileInfo(fileId, service) {
        if (service === 'google') {
            const files = this.state.googleFiles;
            return files.find(f => f.id === fileId);
        } else {
            const files = this.state.oneDriveFiles;
            return files.find(f => f.id === fileId);
        }
    }

    async downloadFileBlob(fileId, service) {
        if (service === 'google') {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${this.state.googleToken}` }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to download from Google Drive: ${response.status}`);
            }
            
            return await response.blob();
        } else {
            const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
                headers: { 'Authorization': `Bearer ${this.state.microsoftToken}` }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to download from OneDrive: ${response.status}`);
            }
            
            return await response.blob();
        }
    }

    async uploadFileBlob(fileBlob, fileName, service) {
        try {
            if (service === 'onedrive') {
                // Upload to OneDrive
                const response = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'Content-Type': 'application/octet-stream'
                    },
                    body: fileBlob
                });
                return response.ok;
            } else {
                // Upload to Google Drive
                const metadata = {
                    name: fileName,
                    parents: [this.state.currentGoogleFolder]
                };
                
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
                form.append('file', fileBlob);
                
                const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`
                    },
                    body: form
                });
                return response.ok;
            }
        } catch (error) {
            console.error('Upload error:', error);
            return false;
        }
    }

    showTransferProgress() {
        const progressPanel = document.getElementById('transfer-progress');
        if (progressPanel) {
            progressPanel.style.display = 'block';
            
            // Auto-hide after 30 seconds of inactivity
            setTimeout(() => {
                if (progressPanel.style.display !== 'none') {
                    progressPanel.style.display = 'none';
                    document.getElementById('transfer-list').innerHTML = '';
                }
            }, 30000);
        }
    }

    updateTransferProgress(fileId, from, to, status, progress = 0) {
        const progressList = document.getElementById('transfer-list');
        if (!progressList) return;
        
        let progressItem = document.getElementById(`transfer-${fileId}`);
        if (!progressItem) {
            progressItem = document.createElement('div');
            progressItem.id = `transfer-${fileId}`;
            progressItem.className = 'transfer-item';
            progressList.appendChild(progressItem);
        }
        
        const statusEmoji = {
            'downloading': '⬇️',
            'uploading': '⬆️',
            'completed': '✅',
            'failed': '❌'
        };
        
        const fileInfo = this.getFileInfo(fileId, from);
        const fileName = fileInfo?.name || `File ${fileId}`;
        
        progressItem.innerHTML = `
            <div class="transfer-item__info">
                <span class="transfer-item__status">${statusEmoji[status] || '📄'}</span>
                <span class="transfer-item__name">${fileName}</span>
                <span class="transfer-item__direction">${from} → ${to}</span>
            </div>
            <div class="transfer-item__progress">
                <div class="progress-bar">
                    <div class="progress-bar__fill" style="width: ${progress}%"></div>
                </div>
                <span class="progress-text">${status} (${progress}%)</span>
            </div>
        `;
        
        // Remove completed/failed items after 10 seconds
        if (status === 'completed' || status === 'failed') {
            setTimeout(() => {
                if (progressItem.parentNode) {
                    progressItem.parentNode.removeChild(progressItem);
                }
            }, 10000);
        }
    }

    async downloadFile(service, fileId, fileName) {
        try {
            console.log(`Downloading ${fileName} from ${service}`);
            this.showNotification(`Downloading ${fileName}...`, 'info');
            
            const fileBlob = await this.downloadFileBlob(fileId, service);
            
            // Create download link
            const url = window.URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            this.showNotification(`Downloaded ${fileName} successfully!`, 'success');
            
        } catch (error) {
            console.error('Download failed:', error);
            this.showNotification(`Failed to download ${fileName}`, 'error');
        }
    }

    searchFiles(service, query) {
        const files = service === 'google' ? this.state.googleFiles : this.state.oneDriveFiles;
        
        if (!query.trim()) {
            this.renderFileList(service, files);
            return;
        }
        
        const filteredFiles = files.filter(file => 
            file.name.toLowerCase().includes(query.toLowerCase())
        );
        
        this.renderFileList(service, filteredFiles);
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
        
        // Hide transfer progress
        const progressPanel = document.getElementById('transfer-progress');
        if (progressPanel) {
            progressPanel.style.display = 'none';
        }
        
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
