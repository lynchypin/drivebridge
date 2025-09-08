// DriveBridge Chunked Transfer Engine – ES5 Compatible with CORS support

function ChunkedTransferEngine(downloadChunkSize, uploadChunkSize, maxConcurrentChunks) {
  this.downloadChunkSize = downloadChunkSize;
  this.uploadChunkSize = uploadChunkSize;
  this.maxConcurrentChunks = maxConcurrentChunks;
}

ChunkedTransferEngine.prototype.downloadChunk = function(fileId, start, end) {
  var url = 'https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media';
  return fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + window.googleAuthToken },
    mode: 'cors'           // Enable CORS
  })
    .then(function(response) {
      if (!response.ok && response.status !== 206) {
        throw new Error('Download chunk failed: ' + response.status);
      }
      return response.arrayBuffer();
    });
};

ChunkedTransferEngine.prototype.uploadChunkWithRetry = function(uploadUrl, chunkData, attempt) {
  attempt = attempt || 1;
  return fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Range': 'bytes ' + chunkData.start + '-' + chunkData.end + '/' + chunkData.total,
      'Content-Type': 'application/octet-stream'
    },
    mode: 'cors',            // Enable CORS
    body: chunkData.buffer
  })
    .then(function(response) {
      if (!response.ok && response.status !== 202) {
        throw new Error('Upload chunk failed: ' + response.status);
      }
      return response.json();
    })
    .catch(function(error) {
      if (attempt < 5) {
        return new Promise(function(resolve) {
          setTimeout(function() {
            resolve(this.uploadChunkWithRetry(uploadUrl, chunkData, attempt + 1));
          }.bind(this), Math.pow(2, attempt) * 500);
        }.bind(this));
      }
      throw error;
    }.bind(this));
};

ChunkedTransferEngine.prototype.transferFileChunked = function(fileMeta, destinationFolderId) {
  var self = this;
  var total = parseInt(fileMeta.fileSize, 10);
  var chunks = Math.ceil(total / this.uploadChunkSize);
  var uploadSessionUrl;

  return fetch('https://graph.microsoft.com/v1.0/me/drive/items/' + destinationFolderId + '/createUploadSession', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + window.msAuthToken,
      'Content-Type': 'application/json'
    },
    mode: 'cors',            // Enable CORS
    body: JSON.stringify({
      item: { '@microsoft.graph.conflictBehavior': 'replace', name: fileMeta.fileName }
    })
  })
    .then(function(res) { return res.json(); })
    .then(function(json) {
      uploadSessionUrl = json.uploadUrl;
      var promises = [];
      for (var i = 0; i < chunks; i++) {
        (function(index) {
          var start = index * self.uploadChunkSize;
          var end = Math.min(start + self.uploadChunkSize, total) - 1;
          promises.push(
            self.downloadChunk(fileMeta.fileId, start, end)
              .then(function(buffer) {
                return self.uploadChunkWithRetry(uploadSessionUrl, {
                  start: start,
                  end: end,
                  total: total,
                  buffer: buffer
                });
              })
          );
        })(i);
      }
      return Promise.all(promises);
    });
};

// Export globally
if (typeof window !== 'undefined') {
  window.ChunkedTransferEngine = ChunkedTransferEngine;
}
