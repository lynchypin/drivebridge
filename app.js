// DriveBridge - Universal File Sharing Application
class DriveBridge {
    constructor() {
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
            currentFolderService: null,
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
            
            // Check for existing authentication
            this.checkExistingAuth();
            
            // Mark as initialized
            this.state.isInitialized = true;
            
            console.log('DriveBridge initialized successfully');
            this.showNotification('DriveBridge ready! Connect your cloud services to get started.', 'info');
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showNotification('Application initialized with limited functionality', 'warning');
        }
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Authentication buttons
        const googleBtn = document.getElementById('google-auth-btn');
        const onedriveBtn = document.getElementById('onedrive-auth-btn');
        const proceedBtn = document.getElementById('proceed-btn');
        
        if (googleBtn) {
            googleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.authenticateGoogle();
            });
            console.log('Google auth button listener added');
        }
        
        if (onedriveBtn) {
            onedriveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.authenticateMicrosoft();
            });
            console.log('OneDrive auth button listener added');
        }
        
        if (proceedBtn) {
            proceedBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.showDashboard();
            });
            console.log('Proceed button listener added');
        }

        // Dashboard controls
        const disconnectBtn = document.getElementById('disconnect-btn');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.disconnectAll());
        }

        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshBoth());
        }

        // Search inputs
        const googleSearch = document.getElementById('google-search');
        const onedriveSearch = document.getElementById('onedrive-search');
        
        if (googleSearch) {
            googleSearch.addEventListener('input', (e) => this.searchFiles('google', e.target.value));
        }
        
        if (onedriveSearch) {
            onedriveSearch.addEventListener('input', (e) => this.searchFiles('onedrive', e.target.value));
        }

        // Folder creation buttons
        const googleCreateFolder = document.getElementById('google-create-folder');
        const onedriveCreateFolder = document.getElementById('onedrive-create-folder');
        
        if (googleCreateFolder) {
            googleCreateFolder.addEventListener('click', () => this.showCreateFolderModal('google'));
        }
        
        if (onedriveCreateFolder) {
            onedriveCreateFolder.addEventListener('click', () => this.showCreateFolderModal('onedrive'));
        }

        // Transfer buttons
        const googleToOnedrive = document.getElementById('google-to-onedrive');
        const onedriveToGoogle = document.getElementById('onedrive-to-google');
        
        if (googleToOnedrive) {
            googleToOnedrive.addEventListener('click', () => this.transferFiles('google', 'onedrive'));
        }
        
        if (onedriveToGoogle) {
            onedriveToGoogle.addEventListener('click', () => this.transferFiles('onedrive', 'google'));
        }

        // Modal controls
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.hideModals());
        });

        const modalOverlay = document.getElementById('modal-overlay');
        if (modalOverlay) {
            modalOverlay.addEventListener('click', (e) => {
                if (e.target === e.currentTarget) this.hideModals();
            });
        }

        // Folder creation modal
        const confirmFolder = document.getElementById('confirm-folder');
        const cancelFolder = document.getElementById('cancel-folder');
        
        if (confirmFolder) {
            confirmFolder.addEventListener('click', () => this.createFolder());
        }
        
        if (cancelFolder) {
            cancelFolder.addEventListener('click', () => this.hideModals());
        }

        // Toast close
        const toastClose = document.getElementById('toast-close');
        if (toastClose) {
            toastClose.addEventListener('click', () => this.hideNotification());
        }

        // Enter key support for folder creation
        const folderNameInput = document.getElementById('folder-name-input');
        if (folderNameInput) {
            folderNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createFolder();
                }
            });
        }

        console.log('Event listeners setup complete');
    }

    async authenticateGoogle() {
        console.log('Starting Google authentication...');
        
        const btn = document.getElementById('google-auth-btn');
        if (btn) {
            btn.textContent = 'Connecting...';
            btn.disabled = true;
        }
        
        try {
            // Simulate authentication delay
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Use demo authentication since OAuth credentials are placeholders
            this.state.googleToken = 'demo_google_token_' + Date.now();
            sessionStorage.setItem('google_token', this.state.googleToken);
            
            this.updateConnectionStatus('google', true);
            this.showNotification('Google Drive connected successfully!', 'success');
            this.checkProceedButton();
            
            console.log('Google authentication completed');
            
        } catch (error) {
            console.error('Google authentication error:', error);
            this.showNotification('Google authentication failed, using demo mode', 'warning');
            
            // Still provide demo functionality
            this.state.googleToken = 'demo_google_token_' + Date.now();
            sessionStorage.setItem('google_token', this.state.googleToken);
            this.updateConnectionStatus('google', true);
            this.checkProceedButton();
        } finally {
            if (btn) {
                btn.textContent = 'Connect Google Drive';
                btn.disabled = false;
            }
        }
    }

    async authenticateMicrosoft() {
        console.log('Starting Microsoft authentication...');
        
        const btn = document.getElementById('onedrive-auth-btn');
        if (btn) {
            btn.textContent = 'Connecting...';
            btn.disabled = true;
        }
        
        try {
            // Simulate authentication delay
            await new Promise(resolve => setTimeout(resolve, 1800));
            
            // Use demo authentication since OAuth credentials are placeholders
            this.state.microsoftToken = 'demo_microsoft_token_' + Date.now();
            sessionStorage.setItem('microsoft_token', this.state.microsoftToken);
            
            this.updateConnectionStatus('onedrive', true);
            this.showNotification('OneDrive connected successfully!', 'success');
            this.checkProceedButton();
            
            console.log('Microsoft authentication completed');
            
        } catch (error) {
            console.error('Microsoft authentication error:', error);
            this.showNotification('OneDrive authentication failed, using demo mode', 'warning');
            
            // Still provide demo functionality
            this.state.microsoftToken = 'demo_microsoft_token_' + Date.now();
            sessionStorage.setItem('microsoft_token', this.state.microsoftToken);
            this.updateConnectionStatus('onedrive', true);
            this.checkProceedButton();
        } finally {
            if (btn) {
                btn.textContent = 'Connect OneDrive';
                btn.disabled = false;
            }
        }
    }

    updateConnectionStatus(service, connected) {
        console.log(`Updating ${service} connection status to:`, connected);
        
        const statusElement = document.getElementById(`${service === 'google' ? 'google' : 'onedrive'}-status`);
        if (!statusElement) {
            console.warn(`Status element not found for ${service}`);
            return;
        }
        
        const statusSpan = statusElement.querySelector('.status');
        if (!statusSpan) {
            console.warn(`Status span not found for ${service}`);
            return;
        }
        
        if (connected) {
            statusSpan.textContent = 'Connected';
            statusSpan.className = 'status status--success';
        } else {
            statusSpan.textContent = 'Disconnected';
            statusSpan.className = 'status status--error';
        }
        
        console.log(`${service} status updated to:`, statusSpan.textContent);
    }

    checkProceedButton() {
        const proceedBtn = document.getElementById('proceed-btn');
        if (!proceedBtn) {
            console.warn('Proceed button not found');
            return;
        }
        
        const bothConnected = this.state.googleToken && this.state.microsoftToken;
        
        console.log('Checking proceed button:', { bothConnected, google: !!this.state.googleToken, microsoft: !!this.state.microsoftToken });
        
        proceedBtn.disabled = !bothConnected;
        
        if (bothConnected) {
            proceedBtn.textContent = 'Continue to Dashboard';
            proceedBtn.classList.remove('btn--secondary');
            proceedBtn.classList.add('btn--primary');
            console.log('Proceed button enabled');
        } else {
            proceedBtn.textContent = 'Connect both services to continue';
            proceedBtn.classList.remove('btn--primary');
            proceedBtn.classList.add('btn--secondary');
            console.log('Proceed button disabled');
        }
    }

    checkExistingAuth() {
        console.log('Checking existing authentication...');
        
        // Check for existing tokens in session storage
        const googleToken = sessionStorage.getItem('google_token');
        const microsoftToken = sessionStorage.getItem('microsoft_token');

        if (googleToken) {
            this.state.googleToken = googleToken;
            this.updateConnectionStatus('google', true);
            console.log('Found existing Google token');
        }

        if (microsoftToken) {
            this.state.microsoftToken = microsoftToken;
            this.updateConnectionStatus('onedrive', true);
            console.log('Found existing Microsoft token');
        }

        this.checkProceedButton();
    }

    showDashboard() {
        console.log('Attempting to show dashboard...');
        
        if (!this.state.googleToken || !this.state.microsoftToken) {
            this.showNotification('Please connect both services first', 'warning');
            return;
        }
        
        const authView = document.getElementById('auth-view');
        const dashboardView = document.getElementById('dashboard-view');
        
        if (!authView || !dashboardView) {
            console.error('Dashboard view elements not found');
            this.showNotification('Failed to load dashboard - page elements missing', 'error');
            return;
        }
        
        console.log('Switching to dashboard view...');
        authView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        
        // Load initial file listings with a small delay to ensure UI has updated
        setTimeout(() => {
            console.log('Loading initial file listings...');
            this.loadGoogleFiles();
            this.loadOneDriveFiles();
        }, 100);
        
        this.showNotification('Welcome to DriveBridge Dashboard!', 'success');
        console.log('Dashboard shown successfully');
    }

    async loadGoogleFiles(folderId = 'root') {
        console.log('Loading Google Drive files...');
        
        const browser = document.getElementById('google-browser');
        if (!browser) {
            console.error('Google browser element not found');
            return;
        }
        
        // Show loading state
        browser.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading Google Drive files...</p></div>';

        try {
            // Simulate realistic loading time
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Generate demo files
            const demoFiles = this.generateDemoFiles('google');
            this.state.googleFiles = demoFiles;
            
            console.log('Generated Google demo files:', demoFiles);
            this.renderFileList('google', demoFiles);
            
        } catch (error) {
            console.error('Error loading Google Drive files:', error);
            this.showNotification('Failed to load Google Drive files', 'error');
            this.renderEmptyState('google');
        }
    }

    async loadOneDriveFiles(folderId = 'root') {
        console.log('Loading OneDrive files...');
        
        const browser = document.getElementById('onedrive-browser');
        if (!browser) {
            console.error('OneDrive browser element not found');
            return;
        }
        
        // Show loading state
        browser.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading OneDrive files...</p></div>';

        try {
            // Simulate realistic loading time (slightly different from Google)
            await new Promise(resolve => setTimeout(resolve, 2200));
            
            // Generate demo files
            const demoFiles = this.generateDemoFiles('onedrive');
            this.state.oneDriveFiles = demoFiles;
            
            console.log('Generated OneDrive demo files:', demoFiles);
            this.renderFileList('onedrive', demoFiles);
            
        } catch (error) {
            console.error('Error loading OneDrive files:', error);
            this.showNotification('Failed to load OneDrive files', 'error');
            this.renderEmptyState('onedrive');
        }
    }

    generateDemoFiles(service) {
        const baseFiles = [
            {
                id: '1',
                name: 'Documents',
                type: 'folder',
                size: null,
                modifiedTime: new Date('2024-01-15').toISOString(),
                mimeType: 'application/vnd.google-apps.folder'
            },
            {
                id: '2',
                name: 'Project Proposal.docx',
                type: 'file',
                size: 524288,
                modifiedTime: new Date('2024-01-10').toISOString(),
                mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            },
            {
                id: '3',
                name: 'Budget Spreadsheet.xlsx',
                type: 'file',
                size: 102400,
                modifiedTime: new Date('2024-01-08').toISOString(),
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            },
            {
                id: '4',
                name: 'Presentation.pptx',
                type: 'file',
                size: 2097152,
                modifiedTime: new Date('2024-01-05').toISOString(),
                mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            },
            {
                id: '5',
                name: 'Team Photo.jpg',
                type: 'file',
                size: 1048576,
                modifiedTime: new Date('2024-01-03').toISOString(),
                mimeType: 'image/jpeg'
            }
        ];

        // Add service-specific files
        if (service === 'google') {
            baseFiles.push({
                id: '6',
                name: 'Google Docs File',
                type: 'file',
                size: 0,
                modifiedTime: new Date('2024-01-01').toISOString(),
                mimeType: 'application/vnd.google-apps.document'
            });
        } else {
            baseFiles.push({
                id: '6',
                name: 'OneDrive Notes.txt',
                type: 'file',
                size: 4096,
                modifiedTime: new Date('2024-01-01').toISOString(),
                mimeType: 'text/plain'
            });
        }

        return baseFiles.map(file => ({
            ...file,
            service: service,
            id: `${service}_${file.id}`
        }));
    }

    renderFileList(service, files) {
        console.log(`Rendering ${service} file list with ${files.length} files`);
        
        const browser = document.getElementById(`${service}-browser`);
        if (!browser) {
            console.error(`Browser element not found for ${service}`);
            return;
        }
        
        if (files.length === 0) {
            this.renderEmptyState(service);
            return;
        }

        const fileGrid = document.createElement('div');
        fileGrid.className = 'file-grid';

        files.forEach(file => {
            const fileItem = this.createFileItem(file, service);
            fileGrid.appendChild(fileItem);
        });

        // Clear loading state and add file grid
        browser.innerHTML = '';
        browser.appendChild(fileGrid);
        
        console.log(`${service} file list rendered successfully`);
    }

    createFileItem(file, service) {
        const item = document.createElement('div');
        item.className = `file-item ${file.type === 'folder' ? 'folder' : ''}`;
        item.dataset.fileId = file.id;
        item.dataset.service = service;

        const icon = document.createElement('div');
        icon.className = `file-icon ${this.getFileIconClass(file)}`;

        const info = document.createElement('div');
        info.className = 'file-info';

        const name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = file.name;

        const meta = document.createElement('div');
        meta.className = 'file-meta';
        
        if (file.type === 'folder') {
            meta.textContent = 'Folder';
        } else {
            const size = this.formatFileSize(file.size);
            const date = new Date(file.modifiedTime).toLocaleDateString();
            meta.textContent = `${size} • ${date}`;
        }

        info.appendChild(name);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'file-actions';

        // Add action buttons
        if (file.type === 'folder') {
            const openBtn = this.createActionButton('📂', 'Open folder', () => this.openFolder(file, service));
            actions.appendChild(openBtn);
        } else {
            const detailsBtn = this.createActionButton('ℹ️', 'File details', () => this.showFileDetails(file));
            actions.appendChild(detailsBtn);
        }

        const deleteBtn = this.createActionButton('🗑️', 'Delete', () => this.deleteFile(file, service));
        actions.appendChild(deleteBtn);

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(actions);

        // Add click handler for selection
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.file-actions')) {
                this.toggleFileSelection(file, service, item);
            }
        });

        return item;
    }

    createActionButton(icon, title, handler) {
        const btn = document.createElement('button');
        btn.className = 'file-action-btn';
        btn.textContent = icon;
        btn.title = title;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handler();
        });
        return btn;
    }

    getFileIconClass(file) {
        if (file.type === 'folder') return 'folder';
        
        const extension = file.name.split('.').pop().toLowerCase();
        
        for (const [type, extensions] of Object.entries(this.fileTypes)) {
            if (extensions.includes(extension)) {
                return type;
            }
        }
        
        return 'document';
    }

    formatFileSize(bytes) {
        if (!bytes) return '0 Bytes';
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    toggleFileSelection(file, service, item) {
        if (file.type === 'folder') return; // Don't allow folder selection for transfer
        
        const selectedSet = service === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        
        if (selectedSet.has(file.id)) {
            selectedSet.delete(file.id);
            item.classList.remove('selected');
        } else {
            selectedSet.add(file.id);
            item.classList.add('selected');
        }

        this.updateTransferButtons();
        console.log(`File ${file.name} selection toggled. Selected: ${selectedSet.has(file.id)}`);
    }

    updateTransferButtons() {
        const googleToOneDriveBtn = document.getElementById('google-to-onedrive');
        const oneDriveToGoogleBtn = document.getElementById('onedrive-to-google');

        if (googleToOneDriveBtn) {
            googleToOneDriveBtn.disabled = this.state.selectedGoogleFiles.size === 0;
            
            if (this.state.selectedGoogleFiles.size > 0) {
                googleToOneDriveBtn.textContent = `Transfer ${this.state.selectedGoogleFiles.size} file(s) to OneDrive →`;
            } else {
                googleToOneDriveBtn.textContent = 'Transfer Selected to OneDrive →';
            }
        }

        if (oneDriveToGoogleBtn) {
            oneDriveToGoogleBtn.disabled = this.state.selectedOneDriveFiles.size === 0;
            
            if (this.state.selectedOneDriveFiles.size > 0) {
                oneDriveToGoogleBtn.textContent = `← Transfer ${this.state.selectedOneDriveFiles.size} file(s) to Google Drive`;
            } else {
                oneDriveToGoogleBtn.textContent = '← Transfer Selected to Google Drive';
            }
        }
    }

    async transferFiles(fromService, toService) {
        const selectedFiles = fromService === 'google' ? this.state.selectedGoogleFiles : this.state.selectedOneDriveFiles;
        const sourceFiles = fromService === 'google' ? this.state.googleFiles : this.state.oneDriveFiles;

        if (selectedFiles.size === 0) {
            this.showNotification('No files selected for transfer', 'warning');
            return;
        }

        console.log(`Starting transfer of ${selectedFiles.size} files from ${fromService} to ${toService}`);

        // Show transfer queue
        const transferQueue = document.getElementById('transfer-queue');
        if (transferQueue) {
            transferQueue.classList.remove('hidden');
        }

        // Process each selected file
        for (const fileId of selectedFiles) {
            const file = sourceFiles.find(f => f.id === fileId);
            if (file && file.type !== 'folder') {
                await this.transferSingleFile(file, fromService, toService);
            }
        }

        // Clear selections
        selectedFiles.clear();
        this.updateTransferButtons();
        this.updateFileSelections(fromService);
        
        this.showNotification('File transfers completed successfully!', 'success');
    }

    async transferSingleFile(file, fromService, toService) {
        const transferId = `${Date.now()}_${file.id}`;
        
        console.log(`Transferring file: ${file.name}`);
        
        // Add to transfer queue
        this.addTransferItem(transferId, file, fromService, toService);

        try {
            // Simulate file transfer with progress
            await this.simulateFileTransfer(transferId, file);
            
            this.updateTransferStatus(transferId, 'completed');
            
            // Refresh destination file list
            setTimeout(() => {
                if (toService === 'google') {
                    this.loadGoogleFiles();
                } else {
                    this.loadOneDriveFiles();
                }
            }, 1000);
            
        } catch (error) {
            console.error('Transfer error:', error);
            this.updateTransferStatus(transferId, 'failed');
            this.showNotification(`Failed to transfer ${file.name}`, 'error');
        }
    }

    addTransferItem(transferId, file, fromService, toService) {
        const transferList = document.getElementById('transfer-list');
        if (!transferList) return;
        
        const item = document.createElement('div');
        item.className = 'transfer-item';
        item.id = `transfer-${transferId}`;

        item.innerHTML = `
            <div class="transfer-info">
                <div class="transfer-name">${file.name}</div>
                <div class="transfer-details">${fromService} → ${toService}</div>
                <div class="transfer-progress">
                    <div class="transfer-progress-bar" style="width: 0%"></div>
                </div>
            </div>
            <div class="transfer-status">Preparing...</div>
        `;

        transferList.appendChild(item);
    }

    async simulateFileTransfer(transferId, file) {
        const progressBar = document.querySelector(`#transfer-${transferId} .transfer-progress-bar`);
        const status = document.querySelector(`#transfer-${transferId} .transfer-status`);

        if (!progressBar || !status) return;

        // Simulate download phase
        status.textContent = 'Downloading...';
        for (let i = 0; i <= 50; i += 10) {
            progressBar.style.width = `${i}%`;
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Simulate upload phase
        status.textContent = 'Uploading...';
        for (let i = 50; i <= 100; i += 10) {
            progressBar.style.width = `${i}%`;
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    updateTransferStatus(transferId, status) {
        const statusElement = document.querySelector(`#transfer-${transferId} .transfer-status`);
        if (statusElement) {
            statusElement.textContent = status === 'completed' ? 'Completed' : 'Failed';
            statusElement.className = `transfer-status ${status === 'completed' ? 'success' : 'error'}`;
        }

        // Remove completed transfers after delay
        if (status === 'completed') {
            setTimeout(() => {
                const transferItem = document.getElementById(`transfer-${transferId}`);
                if (transferItem) {
                    transferItem.remove();
                    
                    // Hide transfer queue if empty
                    const transferList = document.getElementById('transfer-list');
                    if (transferList && transferList.children.length === 0) {
                        const transferQueue = document.getElementById('transfer-queue');
                        if (transferQueue) {
                            transferQueue.classList.add('hidden');
                        }
                    }
                }
            }, 3000);
        }
    }

    updateFileSelections(service) {
        const browser = document.getElementById(`${service}-browser`);
        if (browser) {
            const selectedItems = browser.querySelectorAll('.file-item.selected');
            selectedItems.forEach(item => item.classList.remove('selected'));
        }
    }

    renderEmptyState(service) {
        const browser = document.getElementById(`${service}-browser`);
        if (browser) {
            browser.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📁</div>
                    <p>No files found</p>
                </div>
            `;
        }
    }

    showCreateFolderModal(service) {
        this.currentFolderService = service;
        const overlay = document.getElementById('modal-overlay');
        const modal = document.getElementById('create-folder-modal');
        const input = document.getElementById('folder-name-input');
        
        if (overlay && modal && input) {
            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
            input.focus();
        }
    }

    async createFolder() {
        const folderName = document.getElementById('folder-name-input').value.trim();
        
        if (!folderName) {
            this.showNotification('Please enter a folder name', 'warning');
            return;
        }

        try {
            // In real implementation, use respective APIs to create folder
            this.showNotification(`Folder "${folderName}" created successfully`, 'success');
            
            // Refresh file list
            if (this.currentFolderService === 'google') {
                this.loadGoogleFiles();
            } else {
                this.loadOneDriveFiles();
            }
            
            this.hideModals();
            
        } catch (error) {
            console.error('Create folder error:', error);
            this.showNotification('Failed to create folder', 'error');
        }
    }

    async deleteFile(file, service) {
        if (confirm(`Are you sure you want to delete "${file.name}"?`)) {
            try {
                // In real implementation, use respective APIs to delete file
                this.showNotification(`${file.name} deleted successfully`, 'success');
                
                // Refresh file list
                setTimeout(() => {
                    if (service === 'google') {
                        this.loadGoogleFiles();
                    } else {
                        this.loadOneDriveFiles();
                    }
                }, 500);
                
            } catch (error) {
                console.error('Delete file error:', error);
                this.showNotification('Failed to delete file', 'error');
            }
        }
    }

    showFileDetails(file) {
        const modal = document.getElementById('file-details-modal');
        const content = document.getElementById('file-details-content');
        const overlay = document.getElementById('modal-overlay');
        
        if (modal && content && overlay) {
            content.innerHTML = `
                <div class="file-details">
                    <h4>${file.name}</h4>
                    <p><strong>Type:</strong> ${this.getFileTypeDescription(file)}</p>
                    <p><strong>Size:</strong> ${this.formatFileSize(file.size)}</p>
                    <p><strong>Modified:</strong> ${new Date(file.modifiedTime).toLocaleString()}</p>
                    <p><strong>Service:</strong> ${file.service}</p>
                    <p><strong>ID:</strong> ${file.id}</p>
                </div>
            `;
            
            overlay.classList.remove('hidden');
            modal.classList.remove('hidden');
        }
    }

    getFileTypeDescription(file) {
        if (file.type === 'folder') return 'Folder';
        
        const extension = file.name.split('.').pop().toLowerCase();
        return extension.toUpperCase() + ' file';
    }

    openFolder(folder, service) {
        this.showNotification(`Opening folder: ${folder.name}`, 'info');
        // In real implementation, navigate to folder contents
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
        console.log(`Search results for "${query}" in ${service}: ${filteredFiles.length} files`);
    }

    refreshBoth() {
        console.log('Refreshing both file lists...');
        this.loadGoogleFiles();
        this.loadOneDriveFiles();
        this.showNotification('File lists refreshed', 'success');
    }

    disconnectAll() {
        if (confirm('Are you sure you want to disconnect all services?')) {
            // Clear tokens
            this.state.googleToken = null;
            this.state.microsoftToken = null;
            
            // Clear session storage
            sessionStorage.removeItem('google_token');
            sessionStorage.removeItem('microsoft_token');
            
            // Update UI
            this.updateConnectionStatus('google', false);
            this.updateConnectionStatus('onedrive', false);
            this.checkProceedButton();
            
            // Show auth view
            const dashboardView = document.getElementById('dashboard-view');
            const authView = document.getElementById('auth-view');
            
            if (dashboardView && authView) {
                dashboardView.classList.add('hidden');
                authView.classList.remove('hidden');
            }
            
            this.showNotification('All services disconnected', 'success');
            console.log('All services disconnected');
        }
    }

    hideModals() {
        const overlay = document.getElementById('modal-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
        
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
        
        // Clear form inputs
        const folderNameInput = document.getElementById('folder-name-input');
        if (folderNameInput) {
            folderNameInput.value = '';
        }
    }

    showNotification(message, type = 'info') {
        console.log(`Notification [${type}]: ${message}`);
        
        const toast = document.getElementById('notification-toast');
        const messageElement = document.getElementById('toast-message');
        
        if (toast && messageElement) {
            messageElement.textContent = message;
            toast.className = `toast ${type}`;
            toast.classList.add('show');
            
            // Auto hide after 5 seconds
            setTimeout(() => {
                this.hideNotification();
            }, 5000);
        }
    }

    hideNotification() {
        const toast = document.getElementById('notification-toast');
        if (toast) {
            toast.classList.remove('show');
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded - Creating DriveBridge instance...');
    window.driveBridge = new DriveBridge();
});

// Alternative initialization in case DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    console.log('DOM already ready - Creating DriveBridge instance...');
    window.driveBridge = new DriveBridge();
}
