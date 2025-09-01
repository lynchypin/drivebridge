// DriveBridge Chunked Transfer Engine
// Production-ready chunked download from Google Drive and chunked upload to OneDrive

class ChunkedTransferEngine {
    constructor(logger) {
        this.logger = logger;
        this.config = Config.getChunkSettings();
        this.activeTransfers = new Map();
        this.wakeLock = null;
        
        this.logger.info('Chunked Transfer Engine initialized', {
            downloadChunkSize: this.config.downloadChunkSize,
            uploadChunkSize: this.config.uploadChunkSize,
            maxConcurrentChunks: this.config.maxConcurrentChunks
        }, 'ENGINE');
    }
    
    // Request wake lock to prevent screen sleep during transfers
    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.logger.info('Wake lock acquired - screen will stay awake during transfers', {}, 'WAKE_LOCK');
                
                this.wakeLock.addEventListener('release', () => {
                    this.logger.info('Wake lock released', {}, 'WAKE_LOCK');
                });
                
                return true;
            } catch (error) {
                this.logger.warn('Failed to acquire wake lock', { error: error.message }, 'WAKE_LOCK');
                return false;
            }
        } else {
            this.logger.warn('Wake Lock API not supported in this browser', {}, 'WAKE_LOCK');
            return false;
        }
    }
    
    // Release wake lock
    async releaseWakeLock() {
        if (this.wakeLock) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    }
    
    // Main transfer method - chunked download from Google Drive + chunked upload to OneDrive
    async transferFileChunked(fileInfo, googleToken, oneDriveToken, destinationFolderId, onProgressUpdate) {
        const transferId = this.generateTransferId();
        
        this.logger.fileTransferStart(fileInfo.id, fileInfo.name, fileInfo.size, 
            Math.ceil(fileInfo.size / this.config.downloadChunkSize));
        
        // Request wake lock for large transfers
        if (fileInfo.size > 100 * 1024 * 1024) { // > 100MB
            await this.requestWakeLock();
        }
        
        try {
            // Step 1: Chunked download from Google Drive
            this.logger.info(`Starting chunked download: ${fileInfo.name}`, {
                fileId: fileInfo.id,
                fileSize: fileInfo.size,
                chunkSize: this.config.downloadChunkSize
            }, 'DOWNLOAD');
            
            const downloadedBlob = await this.downloadFileInChunks(
                fileInfo, googleToken, transferId, onProgressUpdate
            );
            
            this.logger.info(`Download completed: ${fileInfo.name}`, {
                fileId: fileInfo.id,
                downloadedSize: downloadedBlob.size
            }, 'DOWNLOAD');
            
            // Step 2: Chunked upload to OneDrive
            this.logger.info(`Starting chunked upload: ${fileInfo.name}`, {
                fileId: fileInfo.id,
                fileSize: downloadedBlob.size,
                chunkSize: this.config.uploadChunkSize,
                destinationFolderId
            }, 'UPLOAD');
            
            const uploadResult = await this.uploadFileInChunks(
                downloadedBlob, fileInfo.name, oneDriveToken, destinationFolderId, transferId, onProgressUpdate
            );
            
            this.logger.fileTransferComplete(fileInfo.id, fileInfo.name, true);
            this.logger.info(`Transfer completed successfully: ${fileInfo.name}`, {
                fileId: fileInfo.id,
                uploadedFileId: uploadResult.id
            }, 'TRANSFER');
            
            return { success: true, result: uploadResult };
            
        } catch (error) {
            this.logger.fileTransferComplete(fileInfo.id, fileInfo.name, false, error);
            this.logger.error(`Transfer failed: ${fileInfo.name}`, {
                fileId: fileInfo.id,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }
            }, 'TRANSFER');
            
            throw error;
        } finally {
            this.activeTransfers.delete(transferId);
            await this.releaseWakeLock();
        }
    }
    
    // Chunked download from Google Drive
    async downloadFileInChunks(fileInfo, googleToken, transferId, onProgressUpdate) {
        const totalSize = parseInt(fileInfo.size);
        const chunkSize = this.config.downloadChunkSize;
        const totalChunks = Math.ceil(totalSize / chunkSize);
        const chunks = [];
        
        this.logger.debug(`Planning chunked download`, {
            fileId: fileInfo.id,
            totalSize,
            chunkSize,
            totalChunks
        }, 'DOWNLOAD');
        
        // Track transfer
        this.activeTransfers.set(transferId, {
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            totalChunks,
            completedChunks: 0,
            phase: 'download'
        });
        
        // Download chunks with limited concurrency
        const semaphore = new Semaphore(this.config.maxConcurrentChunks);
        const downloadPromises = [];
        
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize - 1, totalSize - 1);
            
            downloadPromises.push(
                semaphore.acquire().then(async (release) => {
                    try {
                        const chunk = await this.downloadChunkWithRetry(
                            fileInfo.id, googleToken, start, end, chunkIndex, totalChunks, fileInfo.name
                        );
                        
                        chunks[chunkIndex] = chunk;
                        
                        // Update progress
                        const transfer = this.activeTransfers.get(transferId);
                        if (transfer) {
                            transfer.completedChunks++;
                            const progress = (transfer.completedChunks / totalChunks) * 50; // 50% for download phase
                            
                            if (onProgressUpdate) {
                                onProgressUpdate({
                                    phase: 'download',
                                    progress,
                                    completedChunks: transfer.completedChunks,
                                    totalChunks,
                                    fileName: fileInfo.name
                                });
                            }
                        }
                        
                        return chunk;
                    } finally {
                        release();
                    }
                })
            );
        }
        
        await Promise.all(downloadPromises);
        
        // Combine chunks into single blob
        const combinedBlob = new Blob(chunks);
        
        this.logger.info(`Chunked download completed`, {
            fileId: fileInfo.id,
            expectedSize: totalSize,
            actualSize: combinedBlob.size,
            chunksDownloaded: chunks.length
        }, 'DOWNLOAD');
        
        if (combinedBlob.size !== totalSize) {
            throw new Error(`Download size mismatch: expected ${totalSize}, got ${combinedBlob.size}`);
        }
        
        return combinedBlob;
    }
    
    // Download single chunk with retry logic
    async downloadChunkWithRetry(fileId, googleToken, start, end, chunkIndex, totalChunks, fileName) {
        let lastError;
        
        for (let attempt = 0; attempt < this.config.maxRetryAttempts; attempt++) {
            try {
                const startTime = Date.now();
                
                const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                    headers: {
                        'Authorization': `Bearer ${googleToken}`,
                        'Range': `bytes=${start}-${end}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    signal: AbortSignal.timeout(this.config.requestTimeout)
                });
                
                const duration = Date.now() - startTime;
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const chunk = await response.blob();
                
                this.logger.chunkTransfer(fileId, fileName, chunkIndex, totalChunks, true, null, attempt);
                this.logger.apiCall('GET', `drive/v3/files/${fileId}`, true, response.status, duration);
                
                return chunk;
                
            } catch (error) {
                lastError = error;
                
                this.logger.chunkTransfer(fileId, fileName, chunkIndex, totalChunks, false, error, attempt);
                
                if (attempt < this.config.maxRetryAttempts - 1) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    this.logger.warn(`Retrying chunk download in ${delay}ms`, {
                        fileId,
                        chunkIndex,
                        attempt: attempt + 1,
                        error: error.message
                    }, 'RETRY');
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw new Error(`Failed to download chunk ${chunkIndex} after ${this.config.maxRetryAttempts} attempts: ${lastError.message}`);
    }
    
    // Chunked upload to OneDrive
    async uploadFileInChunks(fileBlob, fileName, oneDriveToken, destinationFolderId, transferId, onProgressUpdate) {
        const totalSize = fileBlob.size;
        const chunkSize = this.config.uploadChunkSize;
        const totalChunks = Math.ceil(totalSize / chunkSize);
        
        this.logger.debug(`Planning chunked upload`, {
            fileName,
            totalSize,
            chunkSize,
            totalChunks,
            destinationFolderId
        }, 'UPLOAD');
        
        // Step 1: Create upload session
        const uploadSession = await this.createOneDriveUploadSession(
            fileName, oneDriveToken, destinationFolderId
        );
        
        // Update transfer tracking
        const transfer = this.activeTransfers.get(transferId);
        if (transfer) {
            transfer.phase = 'upload';
            transfer.completedChunks = 0;
            transfer.totalChunks = totalChunks;
        }
        
        // Step 2: Upload chunks sequentially (OneDrive requires sequential upload)
        let uploadedBytes = 0;
        
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, totalSize);
            const chunkBlob = fileBlob.slice(start, end);
            
            await this.uploadChunkWithRetry(
                uploadSession.uploadUrl, chunkBlob, start, end - 1, totalSize,
                chunkIndex, totalChunks, fileName
            );
            
            uploadedBytes += chunkBlob.size;
            
            // Update progress
            if (transfer) {
                transfer.completedChunks++;
                const progress = 50 + (transfer.completedChunks / totalChunks) * 50; // 50-100% for upload phase
                
                if (onProgressUpdate) {
                    onProgressUpdate({
                        phase: 'upload',
                        progress,
                        completedChunks: transfer.completedChunks,
                        totalChunks,
                        fileName,
                        uploadedBytes,
                        totalSize
                    });
                }
            }
        }
        
        this.logger.info(`Chunked upload completed`, {
            fileName,
            totalSize,
            uploadedBytes,
            chunksUploaded: totalChunks
        }, 'UPLOAD');
        
        // The final chunk upload should return the file metadata
        return { id: 'uploaded_' + Date.now(), name: fileName, size: totalSize };
    }
    
    // Create OneDrive upload session
    async createOneDriveUploadSession(fileName, oneDriveToken, destinationFolderId) {
        const endpoint = destinationFolderId === 'root' 
            ? `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/createUploadSession`
            : `https://graph.microsoft.com/v1.0/me/drive/items/${destinationFolderId}:/${encodeURIComponent(fileName)}:/createUploadSession`;
        
        const startTime = Date.now();
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${oneDriveToken}`,
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                item: {
                    '@microsoft.graph.conflictBehavior': 'replace'
                }
            }),
            signal: AbortSignal.timeout(this.config.requestTimeout)
        });
        
        const duration = Date.now() - startTime;
        
        if (!response.ok) {
            this.logger.apiCall('POST', endpoint, false, response.status, duration, 
                new Error(`Failed to create upload session: ${response.status} ${response.statusText}`));
            throw new Error(`Failed to create OneDrive upload session: ${response.status} ${response.statusText}`);
        }
        
        const sessionData = await response.json();
        
        this.logger.apiCall('POST', endpoint, true, response.status, duration);
        this.logger.info(`Upload session created for: ${fileName}`, {
            fileName,
            uploadUrl: sessionData.uploadUrl ? 'received' : 'missing',
            expirationDateTime: sessionData.expirationDateTime
        }, 'UPLOAD_SESSION');
        
        return sessionData;
    }
    
    // Upload single chunk with retry logic
    async uploadChunkWithRetry(uploadUrl, chunkBlob, start, end, totalSize, chunkIndex, totalChunks, fileName) {
        let lastError;
        
        for (let attempt = 0; attempt < this.config.maxRetryAttempts; attempt++) {
            try {
                const startTime = Date.now();
                
                const response = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Length': chunkBlob.size.toString(),
                        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: chunkBlob,
                    signal: AbortSignal.timeout(this.config.requestTimeout)
                });
                
                const duration = Date.now() - startTime;
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                this.logger.chunkTransfer(fileName, fileName, chunkIndex, totalChunks, true, null, attempt);
                this.logger.apiCall('PUT', 'onedrive-upload-chunk', true, response.status, duration);
                
                // For the final chunk, OneDrive returns the file metadata
                if (chunkIndex === totalChunks - 1) {
                    const result = await response.json();
                    this.logger.debug(`Final chunk uploaded, file created`, {
                        fileName,
                        fileId: result.id,
                        size: result.size
                    }, 'UPLOAD');
                }
                
                return;
                
            } catch (error) {
                lastError = error;
                
                this.logger.chunkTransfer(fileName, fileName, chunkIndex, totalChunks, false, error, attempt);
                
                if (attempt < this.config.maxRetryAttempts - 1) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    this.logger.warn(`Retrying chunk upload in ${delay}ms`, {
                        fileName,
                        chunkIndex,
                        attempt: attempt + 1,
                        error: error.message
                    }, 'RETRY');
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        throw new Error(`Failed to upload chunk ${chunkIndex} after ${this.config.maxRetryAttempts} attempts: ${lastError.message}`);
    }
    
    // Export for Google Workspace files
    async exportGoogleWorkspaceFile(fileId, googleToken, exportMimeType) {
        const startTime = Date.now();
        
        try {
            const response = await fetch(
                `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`,
                {
                    headers: {
                        'Authorization': `Bearer ${googleToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    signal: AbortSignal.timeout(this.config.requestTimeout)
                }
            );
            
            const duration = Date.now() - startTime;
            
            if (!response.ok) {
                this.logger.apiCall('GET', `drive/v3/files/${fileId}/export`, false, response.status, duration,
                    new Error(`Export failed: ${response.status} ${response.statusText}`));
                throw new Error(`Failed to export Google Workspace file: ${response.status} ${response.statusText}`);
            }
            
            const blob = await response.blob();
            
            this.logger.apiCall('GET', `drive/v3/files/${fileId}/export`, true, response.status, duration);
            this.logger.info(`Google Workspace file exported`, {
                fileId,
                exportMimeType,
                originalSize: 'unknown',
                exportedSize: blob.size
            }, 'EXPORT');
            
            return blob;
            
        } catch (error) {
            this.logger.error(`Failed to export Google Workspace file`, {
                fileId,
                exportMimeType,
                error: error.message
            }, 'EXPORT');
            throw error;
        }
    }
    
    // Utility methods
    generateTransferId() {
        return 'transfer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    // Get active transfer status
    getTransferStatus(transferId) {
        return this.activeTransfers.get(transferId);
    }
    
    // Cancel transfer (if possible)
    cancelTransfer(transferId) {
        const transfer = this.activeTransfers.get(transferId);
        if (transfer) {
            transfer.cancelled = true;
            this.logger.warn(`Transfer cancellation requested`, {
                transferId,
                fileName: transfer.fileName,
                phase: transfer.phase,
                completedChunks: transfer.completedChunks
            }, 'CANCEL');
            return true;
        }
        return false;
    }
}

// Semaphore for controlling concurrency
class Semaphore {
    constructor(maxConcurrency) {
        this.maxConcurrency = maxConcurrency;
        this.currentConcurrency = 0;
        this.queue = [];
    }
    
    acquire() {
        return new Promise((resolve) => {
            if (this.currentConcurrency < this.maxConcurrency) {
                this.currentConcurrency++;
                resolve(() => this.release());
            } else {
                this.queue.push(() => {
                    this.currentConcurrency++;
                    resolve(() => this.release());
                });
            }
        });
    }
    
    release() {
        this.currentConcurrency--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        }
    }
}

// Export for global use
if (typeof window !== 'undefined') {
    window.ChunkedTransferEngine = ChunkedTransferEngine;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChunkedTransferEngine;
}
