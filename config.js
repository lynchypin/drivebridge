const Config = {
  getGoogleClientId() {
    return "1033605194367-56gkf6mgcm3sqfrdkopfco4bfikq8h7n.apps.googleusercontent.com";
  },
  getMicrosoftClientId() {
    return "db78149b-9098-4898-b5b5-567fa03f75f0";
  },
  getRedirectUri() {
    return "https://lynchypin.github.io/drivebridge";
  },
  getApiEndpoints() {
    return {
      google: {
        drive: "https://www.googleapis.com/drive/v3",
        upload: "https://www.googleapis.com/upload/drive/v3"
      },
      microsoft: {
        graph: "https://graph.microsoft.com/v1.0"
      }
    };
  },
  getAppSettings() {
    return {
      downloadChunkSize: 64 * 1024 * 1024,
      uploadChunkSize: 16 * 1024 * 1024,
      maxConcurrentChunks: 5
    };
  },
  getSecuritySettings() {
    return {
      maxRequestsPerMinute: 100
    };
  },
  getMsalConfig() {
    return {
      auth: {
        clientId: Config.getMicrosoftClientId(),
        authority: "https://login.microsoftonline.com/common",
        redirectUri: Config.getRedirectUri()
      },
      cache: {
        cacheLocation: "sessionStorage",
        storeAuthStateInCookie: false
      }
    };
  }
};

export default Config;
