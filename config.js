/ config.js - Configuration management for DriveBridge for production
        return 'https://lynchypin.github.io/drivebridge';
    }
    
    static getApiEndpoints() {
        return {
            google: {
                drive: 'https://www.googleapis.com/drive/v3',
                upload: 'https://www.googleapis('input', handler);
        }
    }

    async initializeAPIs() {
        try {
            await this.waitForGoogleAPI();
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
            
            setTimeout(() => reject(new Error('Google API timeout')), 10000);
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
            setTimeout(() => reject(new Error('MSAL timeout')), 10000);
        });
    }

    async authenticateGoogle() {
        try {
            console.log('Starting Google authentication...');
            sessionStorage.removeItem('google_token');
            
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.clientId,
                scope: 'https://www.googleapis.com/auth/drive',
                callback: (response) => {
                    if (response.access_token) {
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
                        console.error('Google authentication failed - no access token');
                        this.showNotification('Google authentication failed. Please try again.', 'error');
                    }
                },
                error_callback: (error) => {
                    console.error('Google OAuth error:', error);
                    this.showNotification('Google authentication failed. Please try again.', 'error');
                }
            });
            
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
            
            sessionStorage.removeItem('microsoft_token');
            
            const loginRequest = {
                scopes: this.config.microsoft.scopes
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
        return Date.now() < expirationTime;
    }

    initTransferLogSystem() {
        this.showTransferProgress();
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
            const response = await fetch(
                `${this.config.endpoints.google.drive}/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents,webViewLink)&pageSize=1000`,
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
                this.renderFolderNavigation('google');
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
        if (!this.state.microsoftToken) return;

        try {
            const endpoint = this.state.currentOneDriveFolder === 'root' 
                ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;

            const response = await fetch(endpoint, {
                headers: {
                    'Authorization': `Bearer ${this.state.microsoftToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.state.oneDriveFiles = data.value || [];
                this.renderFileList('onedrive', this.state.oneDriveFiles);
                this.renderFolderNavigation('onedrive');
                console.log('✅ Loaded OneDrive files:', this.state.oneDriveFiles.length);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to load OneDrive files:', error);
            this.showNotification('Failed to load OneDrive files', 'error');
        }
    }

    renderFolderNavigation(service) {
        const breadcrumbElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-breadcrumb`);
        if (!breadcrumbElement) return;
        
        const folderPath = service === 'google' ? this.state.googleFolderPath : this.state.onedriveFolderPath;
        
        const breadcrumbHTML = folderPath.map((folder, index) => {
            const isLast = index === folderPath.length - 1;
            return `
                <span class="breadcrumb__item ${isLast ? 'breadcrumb__item--active' : ''}" 
                      ${!isLast ? `onclick="app.navigateToFolder('${service}', '${folder.id}', ${index})"` : ''}>
                    ${folder.name}
                </span>
                ${!isLast ? '<span class="breadcrumb__separator">></span>' : ''}
            `;
        }).join('');
        
        breadcrumbElement.innerHTML = breadcrumbHTML;
    }

    async navigateToFolder(service, folderId, pathIndex) {
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
        this.addTransferLog(`Navigated to folder: ${folderName} in ${service}`, 'info');
    }

    async openFolder(service, folderId, folderName) {
        if (service === 'google') {
            this.state.currentGoogleFolder = folderId;
            this.state.googleFolderPath.push({ id: folderId, name: folderName });
            await this.loadGoogleDriveFiles();
            this.state.selectedGoogleFiles.clear();
        } else {
            this.state.currentOneDriveFolder = folderId;
            this.state.onedriveFolderPath.push({ id: folderId, name: folderName });
            await this.loadOneDriveFiles();
            this.state.selectedOneDriveFiles.clear();
        }
        
        this.updateTransferButtons();
        this.addTransferLog(`Opened folder: ${folderName} in ${service}`, 'info');
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
            
            return `
                <div class="file-item ${isFolder ? 'file-item--folder' : ''} ${isSelected ? 'file-item--selected' : ''}" 
                     data-file-id="${file.id}" data-service="${service}">
                    <div class="file-checkbox">
                        <input type="checkbox" 
                               id="file-${service}-${file.id}" 
                               ${isSelected ? 'checked' : ''}
                               onchange="app.toggleFileSelection('${service}', '${file.id}')">
                    </div>
                    <div class="file-icon" ${isFolder ? `onclick="app.openFolder('${service}', '${file.id}', '${this.escapeHtml(file.name)}')"` : ''}>
                        ${this.getFileIcon(file)}
                    </div>
                    <div class="file-info" ${isFolder ? `onclick="app.openFolder('${service}', '${file.id}', '${this.escapeHtml(file.name)}')"` : ''}>
                        <div class="file-name" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</div>
                        <div class="file-meta">
                            ${fileSize} ${modifiedDate ? '• ' + new Date(modifiedDate).toLocaleDateString() : ''}
                        </div>
                    </div>
                    <div class="file-actions">
                        ${!isFolder ? `<button class="btn btn--ghost btn--small" onclick="app.downloadFile('${service}', '${file.id}', '${this.escapeHtml(file.name)}')" title="Download">⬇️</button>` : ''}
                        <button class="btn btn--ghost btn--small" onclick="app.getShareLink('${service}', '${file.id}', '${this.escapeHtml(file.name)}')" title="Share">🔗</button>
                    </div>
                </div>
            `;
        }).join('');

        fileListElement.innerHTML = fileItems;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
                    this.addTransferLog(`❌ Failed to transfer: ${fileInfo?.name || fileId} - ${result.reason || 'Unknown error'}`, 'error');
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
            
            this.addTransferLog(`📥 Downloading: ${fileInfo.name}`, 'info');
            
            // Download file
            const fileBlob = await this.downloadFileBlob(fileId, from);
            
            this.addTransferLog(`📤 Uploading: ${fileInfo.name}`, 'info');
            
            // Upload to destination
            const uploadSuccess = await this.uploadFileBlob(fileBlob, fileInfo.name, to);
            
            if (uploadSuccess) {
                this.addTransferLog(`✅ Successfully transferred: ${fileInfo.name}`, 'success');
                return true;
            } else {
                throw new Error('Upload failed');
            }
            
        } catch (error) {
            const fileInfo = this.getFileInfo(fileId, from);
            this.addTransferLog(`❌ Failed to transfer: ${fileInfo?.name || fileId} - ${error.message}`, 'error');
            throw error;
        }
    }

    async transferFolder(folderInfo, from, to) {
        try {
            this.addTransferLog(`📁 Creating folder: ${folderInfo.name}`, 'info');
            
            // Create folder in destination
            const newFolderId = await this.createFolder(folderInfo.name, to);
            if (!newFolderId) {
                throw new Error('Failed to create folder');
            }
            
            this.addTransferLog(`📁 Folder created: ${folderInfo.name}`, 'success');
            
            // Get folder contents
            const folderContents = await this.getFolderContents(folderInfo.id, from);
            
            if (folderContents.length === 0) {
                this.addTransferLog(`📁 Empty folder transferred: ${folderInfo.name}`, 'success');
                return true;
            }
            
            this.addTransferLog(`📁 Found ${folderContents.length} items in folder: ${folderInfo.name}`, 'info');
            
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
                    this.addTransferLog(`❌ Failed to transfer folder item: ${item.name} - ${error.message}`, 'error');
                }
            }
            
            // Restore original destination context
            this.state.currentGoogleFolder = originalGoogleFolder;
            this.state.currentOneDriveFolder = originalOneDriveFolder;
            
            this.addTransferLog(`📁 Folder transfer complete: ${folderInfo.name} (${successCount}/${folderContents.length} items)`, 'success');
            return true;
            
        } catch (error) {
            this.addTransferLog(`❌ Failed to transfer folder: ${folderInfo.name} - ${error.message}`, 'error');
            return false;
        }
    }

    async createFolder(folderName, service) {
        try {
            if (service === 'onedrive') {
                const parentPath = this.state.currentOneDriveFolder === 'root' 
                    ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                    : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;
                    
                const response = await fetch(parentPath, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.microsoftToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: folderName,
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
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: folderName,
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
            if (service === 'google') {
                const response = await fetch(
                    `${this.config.endpoints.google.drive}/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,size,mimeType,modifiedTime,parents)&pageSize=1000`,
                    {
                        headers: {
                            'Authorization': `Bearer ${this.state.googleToken}`
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
                        'Authorization': `Bearer ${this.state.microsoftToken}`
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
        if (service === 'google') {
            const response = await fetch(`${this.config.endpoints.google.drive}/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${this.state.googleToken}` }
            });
            
            if (!response.ok) {
                throw new Error(`Failed to download from Google Drive: ${response.status}`);
            }
            
            return await response.blob();
        } else {
            const response = await fetch(`${this.config.endpoints.microsoft.graph}/me/drive/items/${fileId}/content`, {
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
                const uploadPath = this.state.currentOneDriveFolder === 'root'
                    ? `${this.config.endpoints.microsoft.graph}/me/drive/root:/${encodeURIComponent(fileName)}:/content`
                    : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}:/${encodeURIComponent(fileName)}:/content`;
                    
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
                    name: fileName,
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
        } catch (error) {
            console.error('Upload error:', error);
            return false;
        }
    }

    getFileIcon(file) {
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

    async downloadFile(service, fileId, fileName) {
        try {
            this.addTransferLog(`📥 Downloading ${fileName} from ${service}`, 'info');
            
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
            
            this.addTransferLog(`✅ Downloaded ${fileName} successfully`, 'success');
            
        } catch (error) {
            console.error('Download failed:', error);
            this.addTransferLog(`❌ Failed to download ${fileName}: ${error.message}`, 'error');
        }
    }

    async getShareLink(service, fileId, fileName) {
        try {
            this.addTransferLog(`🔗 Generating share link for ${fileName}`, 'info');
            
            let shareUrl = '';
            
            if (service === 'google') {
                // Make file public and get share link
                await fetch(`${this.config.endpoints.google.drive}/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.state.googleToken}`,
                        'Content-Type': 'application/json'
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
                // Copy to clipboard
                await navigator.clipboard.writeText(shareUrl);
                this.addTransferLog(`✅ Share link copied to clipboard for ${fileName}`, 'success');
                this.showNotification(`Share link copied to clipboard for ${fileName}`, 'success');
            } else {
                throw new Error('Failed to generate share link');
            }
            
        } catch (error) {
            console.error('Share link generation failed:', error);
            this.addTransferLog(`❌ Failed to generate share link for ${fileName}: ${error.message}`, 'error');
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
        this.addTransferLog(`Search results: ${filteredFiles.length} files found for "${query}" in ${service}`, 'info');
    }

    showCreateFolderModal(service) {
        this.currentFolderService = service;
        const modal = document.getElementById('create-folder-modal');
        const overlay = document.getElementById('modal-overlay');
        if (modal && overlay) {
            modal.classList.remove('hidden');
            overlay.classList.remove('hidden');
            document.getElementById('folder-name-input').focus();
        }
    }

    hideCreateFolderModal() {
        const modal = document.getElementById('create-folder-modal');
        const overlay = document.getElementById('modal-overlay');
        if (modal && overlay) {
            modal.classList.add('hidden');
            overlay.classList.add('hidden');
            document.getElementById('folder-name-input').value = '';
        }
    }

    async confirmCreateFolder() {
        const folderName = document.getElementById('folder-name-input').value.trim();
        if (!folderName) {
            this.showNotification('Please enter a folder name', 'warning');
            return;
        }

        try {
            const folderId = await this.createFolder(folderName, this.currentFolderService);
            if (folderId) {
                this.addTransferLog(`✅ Created folder: ${folderName} in ${this.currentFolderService}`, 'success');
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
            this.addTransferLog(`❌ Failed to create folder: ${folderName} - ${error.message}`, 'error');
            this.showNotification(`Failed to create folder: ${error.message}`, 'error');
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
            message,
            type,
            id: Date.now() + Math.random()
        };
        
        this.state.transferLogs.push(logEntry);
        
        // Keep only recent logs
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
                <span class="log-timestamp">${log.timestamp}</span>
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
            toggleBtn.textContent = isVisible ? 'Show' : 'Hide';
        }
    }

    refreshFiles() {
        this.loadGoogleDriveFiles();
        this.loadOneDriveFiles();
        this.addTransferLog('File lists refreshed', 'info');
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
        this.state.currentGoogleFolder = 'root';
        this.state.currentOneDriveFolder = 'root';
        this.state.googleFolderPath = [{ id: 'root', name: 'Root' }];
        this.state.onedriveFolderPath = [{ id: 'root', name: 'Root' }];
        
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
        
        this.addTransferLog('Disconnected from all services', 'info');
        this.showNotification('Disconnected from all services', 'info');
    }

    showNotification(message, type = 'info') {
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
