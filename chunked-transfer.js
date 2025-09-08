// DriveBridge Chunked Transfer Engine - ES5 Compatible with proper token handling
function ChunkedTransferEngine(downloadChunkSize, uploadChunkSize, maxConcurrentChunks) {
    this.downloadChunkSize = downloadChunkSize || 32 * 1024 * 1024;
    this.uploadChunkSize = uploadChunkSize || 8 * 1024 * 1024;
    this.maxConcurrentChunks = maxConcurrentChunks || 3;
    
    if (window.Logger && window.logger) {
        window.logger.info('ENGINE', 'Chunked Transfer Engine initialized', {
            downloadChunkSize: this.downloadChunkSize,
            uploadChunkSize: this.uploadChunkSize,
            maxConcurrentChunks: this.maxConcurrentChunks
        });
    }
}

// Get Google Auth Token
ChunkedTransferEngine.prototype.getGoogleToken = function() {
    try {
        var authInstance = gapi.auth2.getAuthInstance();
        if (authInstance && authInstance.isSignedIn.get()) {
            return authInstance.currentUser.get().getAuthResponse().access_token;
        }
    } catch (e) {
        console.warn('Failed to get Google token:', e);
    }
    return null;
};

// Get Microsoft Auth Token
ChunkedTransferEngine.prototype.getMicrosoftToken = function() {
    return new Promise(function(resolve, reject) {
        try {
            if (!window.msalApp) {
                reject(new Error('MSAL app not initialized'));
                return;
            }
            
            var accounts = window.msalApp.getAllAccounts();
            if (accounts.length === 0) {
                reject(new Error('No Microsoft accounts found'));
                return;
            }
            
            var account = accounts[0];
            var tokenRequest = {
                scopes: ['Files.ReadWrite'],
                account: account,
                forceRefresh: false
            };
            
            window.msalApp.acquireTokenSilent(tokenRequest)
                .then(function(response) {
                    resolve(response.accessToken);
                })
                .catch(function(error) {
                    console.warn('Token refresh failed, trying interactive:', error);
                    return window.msalApp.acquireTokenPopup(tokenRequest);
                })
                .then(function(response) {
                    resolve(response.accessToken);
                })
                .catch(function(error) {
                    reject(new Error('Failed to acquire Microsoft token: ' + error.message));
                });
        } catch (e) {
            reject(new Error('Error getting Microsoft token: ' + e.message));
        }
    });
};

ChunkedTransferEngine.prototype.downloadChunk = function(fileId, start, end, fileName) {
    var self = this;
    var googleToken = this.getGoogleToken();
    
    if (!googleToken) {
        return Promise.reject(new Error('No Google access token available'));
    }
    
    var headers = {
        'Authorization': 'Bearer ' + googleToken
    };
    
    if (start !== undefined && end !== undefined) {
        headers['Range'] = 'bytes=' + start + '-' + end;
    }
    
    var startTime = Date.now();
    
    return fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
        method: 'GET',
        headers: headers,
        mode: 'cors'
    }).then(function(response) {
        var duration = Date.now() - startTime;
        
        if (window.logger) {
            window.logger.debug('API_CALL', 'API GET ' + (response.ok ? 'success' : 'failed') + ': drive/v3/files/' + fileId, {
                method: 'GET',
                url: 'drive/v3/files/' + fileId,
                responseStatus: response.status,
                duration: duration,
                success: response.ok,
                error: response.ok ? null : response.statusText
            });
        }
        
        if (!response.ok) {
            throw new Error('Download failed: ' + response.status + ' ' + response.statusText);
        }
        
        return response.arrayBuffer();
    });
};

ChunkedTransferEngine.prototype.downloadFileInChunks = function(fileId, fileSize, fileName) {
    var self = this;
    var chunks = Math.ceil(fileSize / this.downloadChunkSize);
    var downloadedChunks = [];
    
    if (window.logger) {
        window.logger.debug('DOWNLOAD', 'Planning chunked download', {
            fileId: fileId,
            totalSize: fileSize,
            chunkSize: this.downloadChunkSize,
            totalChunks: chunks
        });
    }
    
    var activeDownloads = 0;
    var chunkIndex = 0;
    
    function processNextChunk() {
        if (chunkIndex >= chunks || activeDownloads >= self.maxConcurrentChunks) {
            return Promise.resolve();
        }
        
        var currentIndex = chunkIndex++;
        var start = currentIndex * self.downloadChunkSize;
        var end = Math.min(start + self.downloadChunkSize - 1, fileSize - 1);
        
        activeDownloads++;
        
        return self.downloadChunk(fileId, start, end, fileName)
            .then(function(arrayBuffer) {
                downloadedChunks[currentIndex] = arrayBuffer;
                activeDownloads--;
                
                if (window.logger) {
                    window.logger.chunkTransfer(fileId, fileName, currentIndex, chunks, true, 0, null);
                }
                
                return processNextChunk();
            })
            .catch(function(error) {
                activeDownloads--;
                
                if (window.logger) {
                    window.logger.chunkTransfer(fileId, fileName, currentIndex, chunks, false, 0, error);
                }
                
                throw error;
            });
    }
    
    var concurrentPromises = [];
    for (var i = 0; i < this.maxConcurrentChunks && i < chunks; i++) {
        concurrentPromises.push(processNextChunk());
    }
    
    return Promise.all(concurrentPromises).then(function() {
        var totalSize = downloadedChunks.reduce(function(acc, chunk) {
            return acc + (chunk ? chunk.byteLength : 0);
        }, 0);
        
        var combinedBuffer = new ArrayBuffer(totalSize);
        var combinedView = new Uint8Array(combinedBuffer);
        var offset = 0;
        
        downloadedChunks.forEach(function(chunk) {
            if (chunk) {
                var chunkView = new Uint8Array(chunk);
                combinedView.set(chunkView, offset);
                offset += chunk.byteLength;
            }
        });
        
        if (window.logger) {
            window.logger.info('DOWNLOAD', 'Chunked download completed', {
                fileId: fileId,
                expectedSize: fileSize,
                actualSize: totalSize,
                chunksDownloaded: downloadedChunks.length
            });
        }
        
        return combinedBuffer;
    });
};

ChunkedTransferEngine.prototype.createUploadSession = function(fileName, fileSize, destinationFolderId) {
    var self = this;
    
    // Ensure we have a valid OneDrive folder ID, not a Google token
    if (!destinationFolderId || destinationFolderId.startsWith('ya29.') || destinationFolderId.includes('google')) {
        return Promise.reject(new Error('Invalid OneDrive folder ID: ' + destinationFolderId));
    }
    
    return this.getMicrosoftToken().then(function(msToken) {
        var url = 'https://graph.microsoft.com/v1.0/me/drive/items/' + destinationFolderId + ':/' + encodeURIComponent(fileName) + ':/createUploadSession';
        
        var startTime = Date.now();
        
        return fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + msToken,
                'Content-Type': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify({
                item: {
                    '@microsoft.graph.conflictBehavior': 'replace',
                    name: fileName
                }
            })
        }).then(function(response) {
            var duration = Date.now() - startTime;
            
            if (window.logger) {
                window.logger.debug('API_CALL', 'API POST ' + (response.ok ? 'success' : 'failed') + ': graph/createUploadSession', {
                    method: 'POST',
                    url: 'graph/createUploadSession',
                    responseStatus: response.status,
                    duration: duration,
                    success: response.ok,
                    error: response.ok ? null : response.statusText
                });
            }
            
            if (!response.ok) {
                return response.text().then(function(text) {
                    throw new Error('Failed to create upload session: ' + response.status + ' ' + response.statusText + ' - ' + text);
                });
            }
            
            return response.json();
        });
    }).then(function(data) {
        if (window.logger) {
            window.logger.info('UPLOAD', 'Upload session created for ' + fileName, {
                uploadUrl: 'received',
                fileSize: fileSize
            });
        }
        
        return data.uploadUrl;
    });
};

ChunkedTransferEngine.prototype.uploadChunkWithRetry = function(uploadUrl, chunkData, chunkIndex, totalChunks, attempt, fileName) {
    attempt = attempt || 1;
    var maxAttempts = 5;
    var self = this;
    
    return fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Range': 'bytes ' + chunkData.start + '-' + chunkData.end + '/' + chunkData.total,
            'Content-Type': 'application/octet-stream'
        },
        mode: 'cors',
        body: chunkData.buffer
    })
    .then(function(response) {
        if (response.ok || response.status === 202) {
            if (window.logger) {
                window.logger.chunkTransfer(fileName, fileName, chunkIndex, totalChunks, true, attempt - 1, null);
            }
            return response.status === 202 ? null : response.json();
        } else {
            return response.text().then(function(text) {
                throw new Error('HTTP ' + response.status + ': ' + response.statusText + ' - ' + text);
            });
        }
    })
    .catch(function(error) {
        if (window.logger) {
            window.logger.chunkTransfer(fileName, fileName, chunkIndex, totalChunks, false, attempt - 1, { message: error.message });
        }
        
        if (attempt < maxAttempts) {
            var delay = Math.pow(2, attempt - 1) * 1000;
            
            if (window.logger) {
                window.logger.debug('RETRY', 'Retrying upload chunk ' + (chunkIndex + 1) + ' in ' + delay + 'ms', {
                    attempt: attempt,
                    maxAttempts: maxAttempts
                });
            }
            
            return new Promise(function(resolve) {
                setTimeout(function() {
                    resolve(self.uploadChunkWithRetry(uploadUrl, chunkData, chunkIndex, totalChunks, attempt + 1, fileName));
                }, delay);
            });
        } else {
            throw new Error('Upload chunk ' + (chunkIndex + 1) + ' failed after ' + maxAttempts + ' attempts: ' + error.message);
        }
    });
};

ChunkedTransferEngine.prototype.uploadFileInChunks = function(fileBuffer, fileName, uploadUrl) {
    var self = this;
    var fileSize = fileBuffer.byteLength;
    var totalChunks = Math.ceil(fileSize / this.uploadChunkSize);
    
    if (window.logger) {
        window.logger.debug('UPLOAD', 'Planning chunked upload', {
            fileName: fileName,
            totalSize: fileSize,
            chunkSize: this.uploadChunkSize,
            totalChunks: totalChunks,
            destinationFolderId: arguments[3] || 'unknown'
        });
    }
    
    var activeUploads = 0;
    var chunkIndex = 0;
    
    function processNextChunk() {
        if (chunkIndex >= totalChunks || activeUploads >= self.maxConcurrentChunks) {
            return Promise.resolve();
        }
        
        var currentIndex = chunkIndex++;
        var start = currentIndex * self.uploadChunkSize;
        var end = Math.min(start + self.uploadChunkSize, fileSize) - 1;
        var chunkBuffer = fileBuffer.slice(start, end + 1);
        
        var chunkData = {
            start: start,
            end: end,
            total: fileSize,
            buffer: chunkBuffer
        };
        
        activeUploads++;
        
        return self.uploadChunkWithRetry(uploadUrl, chunkData, currentIndex, totalChunks, 1, fileName)
            .then(function(result) {
                activeUploads--;
                return processNextChunk();
            })
            .catch(function(error) {
                activeUploads--;
                throw error;
            });
    }
    
    var concurrentPromises = [];
    for (var i = 0; i < this.maxConcurrentChunks && i < totalChunks; i++) {
        concurrentPromises.push(processNextChunk());
    }
    
    return Promise.all(concurrentPromises);
};

ChunkedTransferEngine.prototype.transferFileChunked = function(fileMeta, destinationFolderId) {
    var self = this;
    var fileId = fileMeta.id || fileMeta.fileId;
    var fileName = fileMeta.name || fileMeta.fileName;
    var fileSize = parseInt(fileMeta.size || fileMeta.fileSize, 10);
    
    // Validate inputs
    if (!fileId) {
        return Promise.reject(new Error('File ID is required'));
    }
    if (!fileName) {
        return Promise.reject(new Error('File name is required'));
    }
    if (!destinationFolderId || destinationFolderId.startsWith('ya29.')) {
        return Promise.reject(new Error('Invalid OneDrive destination folder ID: ' + destinationFolderId));
    }
    
    if (window.logger) {
        window.logger.info('FILE_TRANSFER', 'File transfer started: ' + fileName, {
            fileId: fileId,
            fileName: fileName,
            fileSize: fileSize.toString(),
            expectedChunks: Math.ceil(fileSize / this.downloadChunkSize)
        });
    }
    
    // Acquire wake lock if available
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(function(wakeLock) {
            if (window.logger) {
                window.logger.info('WAKE_LOCK', 'Wake lock acquired - screen will stay awake during transfers');
            }
        }).catch(function(error) {
            if (window.logger) {
                window.logger.warn('WAKE_LOCK', 'Failed to acquire wake lock', { error: error.message });
            }
        });
    }
    
    // Step 1: Download file in chunks
    if (window.logger) {
        window.logger.info('DOWNLOAD', 'Starting chunked download: ' + fileName, {
            fileId: fileId,
            fileSize: fileSize.toString(),
            chunkSize: this.downloadChunkSize
        });
    }
    
    return this.downloadFileInChunks(fileId, fileSize, fileName)
        .then(function(fileBuffer) {
            if (window.logger) {
                window.logger.info('DOWNLOAD', 'Download completed: ' + fileName, {
                    fileId: fileId,
                    downloadedSize: fileBuffer.byteLength
                });
            }
            
            // Step 2: Create upload session
            if (window.logger) {
                window.logger.info('UPLOAD', 'Starting chunked upload: ' + fileName, {
                    fileId: fileId,
                    fileSize: fileBuffer.byteLength,
                    chunkSize: self.uploadChunkSize,
                    destinationFolderId: destinationFolderId
                });
            }
            
            return self.createUploadSession(fileName, fileBuffer.byteLength, destinationFolderId)
                .then(function(uploadUrl) {
                    // Step 3: Upload file in chunks
                    return self.uploadFileInChunks(fileBuffer, fileName, uploadUrl, destinationFolderId);
                });
        })
        .then(function() {
            if (window.logger) {
                window.logger.info('FILE_TRANSFER', 'File transfer completed: ' + fileName, {
                    fileId: fileId,
                    fileName: fileName,
                    success: true
                });
            }
            
            // Release wake lock
            if ('wakeLock' in navigator) {
                if (window.logger) {
                    window.logger.info('WAKE_LOCK', 'Wake lock released');
                }
            }
            
            return { success: true, fileName: fileName };
        })
        .catch(function(error) {
            if (window.logger) {
                window.logger.error('FILE_TRANSFER', 'File transfer failed: ' + fileName, {
                    fileId: fileId,
                    fileName: fileName,
                    success: false,
                    error: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    }
                });
                
                window.logger.error('TRANSFER', 'Transfer failed: ' + fileName, {
                    fileId: fileId,
                    error: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    }
                });
                
                window.logger.error('ERROR', 'Transfer failed for ' + fileName, {
                    error: error.message
                });
            }
            
            // Release wake lock on error
            if ('wakeLock' in navigator) {
                if (window.logger) {
                    window.logger.info('WAKE_LOCK', 'Wake lock released');
                }
            }
            
            throw error;
        });
};

if (typeof window !== 'undefined') {
    window.ChunkedTransferEngine = ChunkedTransferEngine;
}
