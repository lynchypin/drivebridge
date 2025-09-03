// DriveBridge - Main Application
// Production-ready application with chunked transfers, folder handling, and comprehensive logging

class DriveBridge {
    constructor() {
        this.validateEnvironment();

        this.logger = new Logger();
        this.uiManager = new UIManager(this.logger);
        this.errorHandler = new ErrorHandler(this.logger, this.uiManager);
        this.transferEngine = new ChunkedTransferEngine(this.logger);

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
            rateLimiter: new Map(),
            currentExportFile: null,
            selectedExportFormat: null,
            isInitialized: false
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    validateEnvironment() {
        if (typeof window !== 'undefined') {
            const isProd = window.location.hostname.includes('.github.io');
            const secure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
            if (isProd && !secure) {
                throw new Error('🔒 SECURITY ERROR: Production requires HTTPS');
            }
        }
    }

    async init() {
        try {
            this.logger.info('Initializing DriveBridge application');
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
            this.logger.info('Initialization completed successfully');
            this.uiManager.showNotification('DriveBridge ready! Connect your cloud services to get started.', 'info');
        } catch (error) {
            this.logger.error('Initialization failed', { error: error.message });
            this.errorHandler.handleGlobalError({ message: error.message, error });
            this.uiManager.showNotification('Failed to initialize DriveBridge. Please refresh the page.', 'error');
        }
    }

    clearAllModals() {
        document.querySelectorAll('.modal, [id*="modal"]').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
        });
        document.querySelectorAll('.modal-overlay').forEach(el => {
            el.style.display = 'none';
            el.classList.add('hidden');
            el.style.backdropFilter = '';
        });
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
        if (this.uiManager) this.uiManager.activeModals.clear();
        this.logger.debug('All modals and overlays cleared');
    }

    setupEventListeners() {
        this.addClick('google-auth-btn', () => this.authenticateGoogle());
        this.addClick('onedrive-auth-btn', () => this.authenticateMicrosoft());
        this.addClick('proceed-btn', () => this.showDashboard());
        this.addClick('refresh-btn', () => this.refreshFiles());
        this.addClick('disconnect-all-btn', () => this.disconnectAll());
        this.addClick('transfer-to-onedrive', () => this.transferSelectedFiles('google', 'onedrive'));
        this.addClick('transfer-to-google', () => this.transferSelectedFiles('onedrive', 'google'));
        this.addClick('google-select-all', () => this.selectAllFiles('google'));
        this.addClick('google-clear-all', () => this.clearAllSelections('google'));
        this.addClick('onedrive-select-all', () => this.selectAllFiles('onedrive'));
        this.addClick('onedrive-clear-all', () => this.clearAllSelections('onedrive'));
        this.addClick('clear-logs-btn', () => this.clearTransferLogs());
        this.addClick('toggle-logs-btn', () => this.toggleTransferLogs());
        this.addClick('download-logs-btn', () => this.downloadLogs());
        this.addClick('google-new-folder', () => this.showCreateFolderModal('google'));
        this.addClick('onedrive-new-folder', () => this.showCreateFolderModal('onedrive'));
        this.addClick('create-folder-confirm', () => this.confirmCreateFolder());
        this.addClick('create-folder-cancel', () => this.hideCreateFolderModal());
        this.addInput('google-search', e => this.searchFiles('google', e.target.value));
        this.addInput('onedrive-search', e => this.searchFiles('onedrive', e.target.value));
        document.addEventListener('keydown', e => this.handleKeyboard(e));
        window.addEventListener('beforeunload', () => this.secureCleanup());
        this.logger.info('Event listeners configured');
    }

    addClick(id, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', fn);
    }

    addInput(id, fn) {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', fn);
    }

    handleKeyboard(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'r') { e.preventDefault(); this.refreshFiles(); }
            if (e.key === 'l') { e.preventDefault(); this.downloadLogs(); }
        }
        if (e.key === 'Escape') this.clearAllModals();
    }

    async initializeAPIs() {
        await this.waitForGoogle();
        await this.waitForMSAL();
    }

    waitForGoogle() {
        return new Promise((res, rej) => {
            let attempts = 0;
            const check = () => {
                if (window.google && google.accounts) res();
                else if (attempts++ > 50) rej(new Error('Google API load timeout'));
                else setTimeout(check, 100);
            };
            check();
        });
    }

    waitForMSAL() {
        return new Promise((res, rej) => {
            let attempts = 0;
            const check = () => {
                if (window.msal && msal.PublicClientApplication) {
                    this.state.msalInstance = new msal.PublicClientApplication({
                        auth: {
                            clientId: this.config.microsoft.clientId,
                            authority: this.config.microsoft.authority,
                            redirectUri: this.config.microsoft.redirectUri
                        },
                        cache: { cacheLocation: 'sessionStorage' }
                    });
                    res();
                } else if (attempts++ > 50) rej(new Error('MSAL load timeout'));
                else setTimeout(check, 100);
            };
            check();
        });
    }

    async authenticateGoogle() {
        try {
            sessionStorage.removeItem('google_token');
            this.state.googleToken = null;
            this.checkRateLimit('google');
            const client = google.accounts.oauth2.initTokenClient({
                client_id: this.config.google.clientId,
                scope: this.config.google.scopes.join(' '),
                callback: resp => {
                    if (resp.access_token) {
                        this.state.googleToken = resp.access_token;
                        sessionStorage.setItem('google_token', JSON.stringify(resp));
                        this.updateConnection('google', true);
                        this.uiManager.showNotification('Google Drive connected!', 'success');
                        this.checkProceed();
                    }
                }
            });
            client.requestAccessToken();
        } catch (err) {
            this.errorHandler.handleAuthError('Google Drive', err);
        }
    }

    async authenticateMicrosoft() {
        try {
            sessionStorage.removeItem('microsoft_token');
            this.state.microsoftToken = null;
            this.checkRateLimit('microsoft');
            const resp = await this.state.msalInstance.loginPopup({ scopes: this.config.microsoft.scopes });
            if (resp.accessToken) {
                this.state.microsoftToken = resp.accessToken;
                sessionStorage.setItem('microsoft_token', JSON.stringify(resp));
                this.updateConnection('onedrive', true);
                this.uiManager.showNotification('OneDrive connected!', 'success');
                this.checkProceed();
            }
        } catch (err) {
            this.errorHandler.handleAuthError('OneDrive', err);
        }
    }

    updateConnection(service, ok) {
        const id = service === 'google' ? 'google-status' : 'onedrive-status';
        const el = document.getElementById(id).querySelector('.status');
        if (el) {
            el.textContent = ok ? 'Connected' : 'Disconnected';
            el.className = ok ? 'status status--success' : 'status status--error';
        }
    }

    checkProceed() {
        const ok = this.state.googleToken && this.state.microsoftToken;
        const btn = document.getElementById('proceed-btn');
        if (btn) btn.disabled = !ok;
    }

    checkExistingAuth() {
        const g = sessionStorage.getItem('google_token');
        const m = sessionStorage.getItem('microsoft_token');
        if (g) this.state.googleToken = JSON.parse(g).access_token;
        if (m) this.state.microsoftToken = JSON.parse(m).accessToken;
        this.updateConnection('google', !!this.state.googleToken);
        this.updateConnection('onedrive', !!this.state.microsoftToken);
        this.checkProceed();
    }

    initTransferSystem() {
        document.getElementById('transfer-progress').style.display = 'block';
    }

    showDashboard() {
        document.getElementById('auth-view').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'flex';
        this.loadGoogleFiles();
        this.loadOneDriveFiles();
    }

    async loadGoogleFiles() {
        if (!this.state.googleToken) return;
        this.checkRateLimit('google');
        const resp = await fetch(`${this.config.endpoints.google.drive}/files?q='${this.state.currentGoogleFolder}' in parents and trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`, {
            headers: { Authorization: `Bearer ${this.state.googleToken}` }
        });
        if (!resp.ok) { this.errorHandler.handleGlobalError({ message: 'Google files load failed' }); return; }
        const data = await resp.json();
        this.state.googleFiles = data.files || [];
        this.renderFileList('google', this.state.googleFiles);
    }

    async loadOneDriveFiles() {
        if (!this.state.microsoftToken) return;
        this.checkRateLimit('microsoft');
        const url = this.state.currentOneDriveFolder === 'root'
            ? `${this.config.endpoints.microsoft.graph}/me/drive/root/children`
            : `${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${this.state.microsoftToken}` } });
        if (!resp.ok) { this.errorHandler.handleGlobalError({ message: 'OneDrive files load failed' }); return; }
        const data = await resp.json();
        this.state.oneDriveFiles = data.value || [];
        this.renderFileList('onedrive', this.state.oneDriveFiles);
    }

    renderFileList(service, files) {
        const el = document.getElementById(`${service}-file-list`);
        if (!el) return;
        if (files.length === 0) { el.innerHTML = '<div class="empty-state">No files</div>'; return; }
        const html = files.map(f => {
            const isFolder = (service === 'google'
                ? f.mimeType === 'application/vnd.google-apps.folder'
                : f.folder !== undefined);
            return `
                <div class="file-item${isFolder?' file-item--folder':''}" data-id="${f.id}" data-svc="${service}">
                  <input type="checkbox" onchange="app.toggleFile('${service}','${f.id}')" ${service==='google'? (this.state.selectedGoogleFiles.has(f.id)?'checked':'') : (this.state.selectedOneDriveFiles.has(f.id)?'checked':'')} />
                  <span>${f.name}</span>
                </div>`;
        }).join('');
        el.innerHTML = html;
    }

    toggleFile(svc, id) {
        const set = svc==='google'?this.state.selectedGoogleFiles:this.state.selectedOneDriveFiles;
        set.has(id)? set.delete(id): set.add(id);
    }

    selectAllFiles(svc) {
        const list = svc==='google'?this.state.googleFiles:this.state.oneDriveFiles;
        const set = svc==='google'?this.state.selectedGoogleFiles:this.state.selectedOneDriveFiles;
        list.forEach(f=>set.add(f.id));
        this.renderFileList(svc,list);
    }

    clearAllSelections(svc) {
        const set = svc==='google'?this.state.selectedGoogleFiles:this.state.selectedOneDriveFiles;
        set.clear();
        this.renderFileList(svc, svc==='google'?this.state.googleFiles:this.state.oneDriveFiles);
    }

    async transferSelectedFiles(from, to) {
        const sel = from==='google'? this.state.selectedGoogleFiles: this.state.selectedOneDriveFiles;
        if (sel.size===0) { this.uiManager.showNotification('No files selected','warning'); return; }
        if (!this.validateTokens(from,to)) { this.uiManager.showNotification('Reconnect services','error'); return; }
        const transferId = 'batch_'+Date.now();
        const arr = Array.from(sel);
        const files = [], folders = [];
        for (const id of arr) {
            const info = this.getFileInfo(id,from);
            if (!info) continue;
            if (this.isFolder(info,from)) folders.push(info);
            else files.push(info);
        }
        for (const fld of folders) {
            this.logger.info(`Folder detected: ${fld.name}`);
            const contents = await this.getFolderContents(fld.id,from);
            const destId = await this.createFolder(fld.name,to);
            for (const f of contents) {
                if (!this.isFolder(f,from)) {
                    f._destinationFolder = destId;
                    files.push(f);
                }
            }
        }
        if (files.length===0) { this.uiManager.showNotification('No files to transfer','warning'); return; }
        this.logger.transferStart(transferId,files.length,from,to);
        this.uiManager.showNotification(`Starting transfer of ${files.length} files`, 'info');
        const results=[], successCount=0, failedCount=0;
        for (const fileInfo of files) {
            this.uiManager.createProgressBar(fileInfo.id,fileInfo.name, Math.max(1,Math.ceil((fileInfo.size||1)/this.config.settings.batchSize)));
            try {
                let result;
                if (from==='google' && to==='onedrive') {
                    if (this.isGoogleWorkspaceFile(fileInfo)) {
                        result = await this.transferGoogleWorkspaceFile(fileInfo);
                    } else {
                        result = await this.transferEngine.transferFileChunked(
                            fileInfo, this.state.googleToken, this.state.microsoftToken,
                            fileInfo._destinationFolder||this.state.currentOneDriveFolder,
                            p=>this.uiManager.updateProgressBar(fileInfo.id,p)
                        );
                    }
                } else {
                    const blob = await this.downloadFileBlob(fileInfo.id,from);
                    const ok = await this.uploadFileBlob(blob,fileInfo.name,to);
                    result={success:ok};
                }
                this.uiManager.completeProgressBar(fileInfo.id, result.success!==false);
                results.push({success:true,fileId:fileInfo.id,fileName:fileInfo.name});
            } catch (err) {
                this.uiManager.completeProgressBar(fileInfo.id,false);
                results.push({success:false,fileId:fileInfo.id,fileName:fileInfo.name,error:err});
            }
        }
        this.errorHandler.showTransferSummary(results);
        sel.clear();
        this.renderFileList('google',this.state.googleFiles);
        this.renderFileList('onedrive',this.state.oneDriveFiles);
    }

    async getFolderContents(folderId, svc) {
        this.checkRateLimit(svc);
        if (svc==='google') {
            const resp=await fetch(`${this.config.endpoints.google.drive}/files?q='${folderId}' in parents and trashed=false&fields=files(id,name,size,mimeType)&pageSize=1000`,{
                headers:{Authorization:`Bearer ${this.state.googleToken}`}
            });
            if (!resp.ok) throw new Error('Google folder contents load failed');
            const data=await resp.json();
            return data.files||[];
        } else {
            const url=`${this.config.endpoints.microsoft.graph}/me/drive/items/${folderId}/children`;
            const resp=await fetch(url,{headers:{Authorization:`Bearer ${this.state.microsoftToken}`}});
            if (!resp.ok) throw new Error('OneDrive folder contents load failed');
            const data=await resp.json();
            return data.value||[];
        }
    }

    async createFolder(name, svc) {
        const safe= this.sanitizeInput(name);
        if (svc==='google') {
            const resp=await fetch(`${this.config.endpoints.google.drive}/files`,{
                method:'POST',
                headers:{Authorization:`Bearer ${this.state.googleToken}`, 'Content-Type':'application/json'},
                body: JSON.stringify({name:safe,mimeType:'application/vnd.google-apps.folder',parents:[this.state.currentGoogleFolder]})
            });
            const data=await resp.json();
            return data.id;
        } else {
            const parent=this.state.currentOneDriveFolder==='root'
                ?`${this.config.endpoints.microsoft.graph}/me/drive/root/children`
                :`${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}/children`;
            const resp=await fetch(parent,{
                method:'POST',
                headers:{Authorization:`Bearer ${this.state.microsoftToken}`, 'Content-Type':'application/json'},
                body:JSON.stringify({name:safe,folder:{}})
            });
            const data=await resp.json();
            return data.id;
        }
    }

    validateTokens(from,to){
        const t1=from==='google'?this.state.googleToken:this.state.microsoftToken;
        const t2=to==='google'?this.state.googleToken:this.state.microsoftToken;
        return !!t1&&!!t2;
    }

    getFileInfo(id,svc){
        return svc==='google'
            ? this.state.googleFiles.find(f=>f.id===id)
            : this.state.oneDriveFiles.find(f=>f.id===id);
    }

    isFolder(file,svc){
        return svc==='google'
            ? file.mimeType==='application/vnd.google-apps.folder'
            : file.folder!==undefined;
    }

    isGoogleWorkspaceFile(file){
        return ['application/vnd.google-apps.document','application/vnd.google-apps.spreadsheet','application/vnd.google-apps.presentation'].includes(file.mimeType);
    }

    async downloadFileBlob(id,svc){
        this.checkRateLimit(svc);
        const url=svc==='google'
            ?`${this.config.endpoints.google.drive}/files/${id}?alt=media`
            :`${this.config.endpoints.microsoft.graph}/me/drive/items/${id}/content`;
        const resp=await fetch(url,{headers:{Authorization:`Bearer ${svc==='google'?this.state.googleToken:this.state.microsoftToken}`}});
        if (!resp.ok) throw new Error('Download failed');
        return await resp.blob();
    }

    async uploadFileBlob(blob,name,svc){
        const safe=this.sanitizeInput(name);
        if (svc==='onedrive'){
            const path=this.state.currentOneDriveFolder==='root'
                ?`${this.config.endpoints.microsoft.graph}/me/drive/root:/${encodeURIComponent(safe)}:/content`
                :`${this.config.endpoints.microsoft.graph}/me/drive/items/${this.state.currentOneDriveFolder}:/${encodeURIComponent(safe)}:/content`;
            const resp=await fetch(path,{method:'PUT',headers:{Authorization:`Bearer ${this.state.microsoftToken}`},body:blob});
            return resp.ok;
        } else {
            const meta={name:safe,parents:[this.state.currentGoogleFolder]};
            const form=new FormData();form.append('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));form.append('file',blob);
            const resp=await fetch(`${this.config.endpoints.google.upload}/files?uploadType=multipart`,{method:'POST',headers:{Authorization:`Bearer ${this.state.googleToken}`},body:form});
            return resp.ok;
        }
    }

    searchFiles(svc,q){
        const arr=svc==='google'?this.state.googleFiles:this.state.oneDriveFiles;
        const ql=q.trim().toLowerCase();
        const fil=ql?arr.filter(f=>f.name.toLowerCase().includes(ql)):arr;
        this.renderFileList(svc,fil);
    }

    refreshFiles(){ this.loadGoogleFiles(); this.loadOneDriveFiles(); this.uiManager.showNotification('Files refreshed','success'); }
    disconnectAll(){
        sessionStorage.removeItem('google_token');
        sessionStorage.removeItem('microsoft_token');
        this.state.googleToken=null; this.state.microsoftToken=null;
        this.updateConnection('google',false); this.updateConnection('onedrive',false);
        document.getElementById('dashboard-view').style.display='none';
        document.getElementById('auth-view').style.display='flex';
    }

    clearTransferLogs(){ this.logger.clearLogs(); this.uiManager.showNotification('Logs cleared','info'); }
    toggleTransferLogs(){
        const list=document.getElementById('transfer-list');
        list.style.display = list.style.display==='none'?'block':'none';
    }
    downloadLogs(){ this.logger.downloadLogFile(); }
    
    checkRateLimit(svc){
        const now=Date.now(),key=svc+'_req';
        if (!this.state.rateLimiter.has(key)) this.state.rateLimiter.set(key,[]);
        const arr=this.state.rateLimiter.get(key).filter(t=>t>now-60000);
        if (arr.length>=this.config.security.maxRequestsPerMinute) throw new Error('Rate limit');
        arr.push(now); this.state.rateLimiter.set(key,arr);
    }

    sanitizeInput(s){return s.replace(/[<>&"'`]/g,'').trim();}
}

// Initialize app
let app;
if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded',()=>app=new DriveBridge());
} else {
    app=new DriveBridge();
}
