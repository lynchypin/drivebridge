# DriveBridge - Universal File Sharing

A secure, client-side application for transferring files between Google Drive and OneDrive.

## 🔒 Security Features

- **Client-side only**: No server involved, all operations happen in your browser
- **OAuth 2.0**: Secure authentication with Google and Microsoft
- **HTTPS enforced**: Requires secure connections in production  
- **Input sanitization**: All user inputs are sanitized
- **Rate limiting**: Prevents API abuse
- **Token validation**: Automatic token expiry handling
- **No data persistence**: No sensitive data stored permanently

## 🚀 Setup Instructions

### 1. Configure OAuth Applications

#### Google Drive Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google Drive API
4. Create OAuth 2.0 credentials (Web Application)
5. Add authorized origins: `https://yourusername.github.io`
6. Add redirect URIs: `https://yourusername.github.io/drivebridge`

#### OneDrive Setup  
1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Set platform to "Single-page application"
4. Add redirect URI: `https://yourusername.github.io/drivebridge`
5. Add API permissions: Files.ReadWrite, User.Read

### 2. Update Configuration

Edit `config.js` and replace:
- `YOUR_GOOGLE_CLIENT_ID` with your Google OAuth Client ID
- `YOUR_MICROSOFT_CLIENT_ID` with your Microsoft Application ID

### 3. Deploy to GitHub Pages

1. Push all files to your GitHub repository
2. Enable GitHub Pages in repository settings
3. Access your application at `https://yourusername.github.io/drivebridge`

## 🛡️ Security Notes

- OAuth Client IDs are safe to be public (designed for client-side apps)
- Never commit Client Secrets or API Keys
- Application works entirely in browser - no server-side components
- All authentication tokens are temporary and session-only
- HTTPS is enforced for production deployments

## 🔧 Features

- ✅ Secure OAuth authentication
- ✅ Folder navigation with breadcrumbs
- ✅ Batch file transfers
- ✅ Persistent transfer logs
- ✅ File size validation
- ✅ Retry logic for failed transfers
- ✅ Search functionality
- ✅ Mobile responsive design
- ✅ Keyboard shortcuts
- ✅ Accessibility features
