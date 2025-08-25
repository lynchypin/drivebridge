# DriveBridge Setup Guide

## Overview

DriveBridge is a free, cloud-based file sharing tool that allows seamless transfer of files between Google Drive and OneDrive. This tool leverages the free capabilities available in Google Workspace and Office 365 for nonprofits to provide a comprehensive file management solution.

## Features

### Core Functionality
- **Bidirectional File Transfer**: Move files from Google Drive to OneDrive and vice versa
- **Drag & Drop Interface**: Intuitive file management with drag-and-drop support
- **Progress Tracking**: Real-time transfer progress with detailed status updates
- **File Management**: Create folders, delete files, rename items, and generate share links
- **Search Capabilities**: Search through files in both Google Drive and OneDrive
- **Batch Operations**: Select and transfer multiple files simultaneously

### Security & Privacy
- **Client-Side Only**: All operations happen in your browser - no server storage
- **OAuth 2.0 Authentication**: Secure authentication using industry standards
- **Token Management**: Automatic token refresh and secure storage
- **No Data Persistence**: Files are transferred directly between services

### User Experience
- **Responsive Design**: Works on desktop, tablet, and mobile devices  
- **Modern Interface**: Clean, professional design with smooth animations
- **Error Handling**: Comprehensive error handling with user-friendly messages
- **Accessibility**: Full keyboard navigation and screen reader support

## Prerequisites

To use DriveBridge, you need:

1. **Google Workspace Account** (nonprofit or regular)
2. **Office 365 Account** (nonprofit or regular) 
3. **Admin Access** to create OAuth applications (or IT support)
4. **Web Browser** with JavaScript enabled

## Setup Instructions

### Part 1: Google Drive API Setup

1. **Go to Google Cloud Console**
   - Visit [Google Cloud Console](https://console.cloud.google.com/)
   - Sign in with your Google Workspace account

2. **Create a New Project**
   - Click "Select a project" → "New Project"
   - Name it "DriveBridge" or similar
   - Click "Create"

3. **Enable Google Drive API**
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click on it and press "Enable"

4. **Configure OAuth Consent Screen**
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External" for user type
   - Fill in required fields:
     - App name: "DriveBridge"
     - User support email: your email
     - Developer contact: your email
   - Add scopes: `https://www.googleapis.com/auth/drive`
   - Add test users if needed

5. **Create OAuth Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Name: "DriveBridge Web Client"
   - Authorized JavaScript origins: `https://yourdomain.com`
   - Authorized redirect URIs: `https://yourdomain.com`
   - Copy the **Client ID** (you'll need this later)

### Part 2: OneDrive API Setup

1. **Go to Azure Portal**
   - Visit [Azure Portal](https://portal.azure.com/)
   - Sign in with your Office 365 account

2. **Register Application**
   - Go to "Azure Active Directory" → "App registrations"
   - Click "New registration"
   - Name: "DriveBridge"
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Web, `https://yourdomain.com`

3. **Configure API Permissions**
   - Go to your app → "API permissions"
   - Click "Add a permission" → "Microsoft Graph"
   - Select "Delegated permissions"
   - Add these permissions:
     - `Files.ReadWrite` (Read and write user files)
     - `User.Read` (Sign in and read user profile)
   - Click "Grant admin consent" (if you have admin rights)

4. **Get Application ID**
   - In your app overview, copy the **Application (client) ID**

### Part 3: Configure DriveBridge

1. **Download the Application Files**
   - Extract the DriveBridge files to your web server
   - Or host on a free service like Netlify, Vercel, or GitHub Pages

2. **Update Configuration**
   - Open `app.js` in a text editor
   - Find the configuration section at the top:

```javascript
this.config = {
    google: {
        clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive'],
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
    },
    microsoft: {
        clientId: 'YOUR_MICROSOFT_CLIENT_ID',
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
        scopes: ['https://graph.microsoft.com/Files.ReadWrite', 'https://graph.microsoft.com/User.Read']
    }
};
```

3. **Replace Placeholder Values**
   - Replace `YOUR_GOOGLE_CLIENT_ID` with your Google OAuth Client ID
   - Replace `YOUR_MICROSOFT_CLIENT_ID` with your Azure Application ID

4. **Deploy Application**
   - Upload files to your web hosting service
   - Ensure HTTPS is enabled (required for OAuth)
   - Test the authentication flows

## Usage Instructions

### Getting Started

1. **Open DriveBridge**
   - Navigate to your deployed application URL
   - You'll see the authentication screen

2. **Connect Google Drive**
   - Click "Connect Google Drive"
   - Sign in with your Google account
   - Authorize the application to access your Drive
   - You'll be redirected back to DriveBridge

3. **Connect OneDrive**
   - Click "Connect OneDrive" 
   - Sign in with your Microsoft account
   - Authorize the application to access your OneDrive
   - You'll be redirected back to DriveBridge

4. **Start Using DriveBridge**
   - Once both services are connected, you'll see the main dashboard
   - Browse files in both services using the split-pane interface

### File Operations

#### Transferring Files
- **Drag & Drop**: Drag files from one pane to the other
- **Select & Transfer**: Select files and click transfer buttons
- **Batch Transfer**: Select multiple files for bulk operations

#### File Management
- **Create Folders**: Click the "New Folder" button in either pane
- **Delete Files**: Select files and click the delete button
- **Rename Files**: Right-click files to access rename option
- **Generate Share Links**: Right-click files to create shareable links

#### Navigation
- **Folder Navigation**: Click folders to browse contents
- **Breadcrumbs**: Use breadcrumb navigation to go back to parent folders
- **Search**: Use search boxes to find specific files
- **Refresh**: Click refresh buttons to reload file lists

### Troubleshooting

#### Common Issues

1. **Authentication Fails**
   - Check that OAuth credentials are correctly configured
   - Ensure redirect URIs match exactly
   - Verify HTTPS is enabled

2. **Files Won't Transfer**
   - Check file size limits (100MB default)
   - Verify you have storage space in destination
   - Check network connection

3. **Application Doesn't Load**
   - Ensure JavaScript is enabled
   - Check browser console for errors
   - Verify all API libraries are loading

#### Error Messages
- **"Authentication failed"**: Re-check OAuth setup
- **"File too large"**: File exceeds size limits
- **"Network error"**: Check internet connection
- **"Quota exceeded"**: Free up storage space

## Security Considerations

### Data Privacy
- **No Server Storage**: Files are transferred directly between services
- **Temporary Access**: Tokens are stored only for the session
- **Minimal Permissions**: Only requests necessary permissions
- **Client-Side Processing**: All operations happen in your browser

### Best Practices
- **Regular Token Refresh**: Application automatically refreshes expired tokens
- **Secure Origins**: Always use HTTPS for OAuth flows
- **Permission Review**: Regularly review application permissions
- **Access Monitoring**: Monitor application access in security settings

## Cost Analysis

DriveBridge leverages free tools and services:

### Free Components
- **Google Drive API**: Free quota sufficient for most users
- **Microsoft Graph API**: Free tier with generous limits  
- **Google Workspace**: Free tools like Apps Script (if needed for automation)
- **Office 365**: Free tools like Power Automate (if needed for workflows)
- **Web Hosting**: Can use free services like Netlify or Vercel

### No Additional Costs
- **No Server Infrastructure**: Pure client-side application
- **No Database**: No persistent storage requirements
- **No Third-Party Services**: Direct API integration only

## Advanced Features

### Automation (Optional)
If you want to add automation capabilities, you can leverage:

1. **Google Apps Script**: Automate Google Drive operations
2. **Microsoft Power Automate**: Automate OneDrive workflows  
3. **Webhooks**: Set up notifications for file changes
4. **Scheduled Transfers**: Use cron jobs with headless browsers

### Customization
The application can be customized for specific needs:

1. **Branding**: Update colors, logos, and styling
2. **File Filters**: Add custom file type restrictions
3. **User Interface**: Modify layout and functionality
4. **Integration**: Add support for other cloud services

## Support and Maintenance

### Regular Maintenance
- **Monitor API Changes**: Google and Microsoft occasionally update APIs
- **Update Dependencies**: Keep OAuth libraries up to date
- **Security Reviews**: Regularly review permissions and access
- **User Feedback**: Collect feedback for improvements

### Getting Help
- **Google Drive API Documentation**: [developers.google.com/drive](https://developers.google.com/drive)
- **Microsoft Graph Documentation**: [docs.microsoft.com/graph](https://docs.microsoft.com/graph)
- **OAuth 2.0 Specification**: [oauth.net/2](https://oauth.net/2)
- **Community Forums**: Stack Overflow, Reddit, GitHub

## Conclusion

DriveBridge provides a comprehensive, free solution for file sharing between Google Drive and OneDrive. By leveraging the free tools available in Google Workspace and Office 365 nonprofit programs, organizations can implement a professional-grade file management system without additional costs.

The application is designed to be:
- **Secure**: Uses industry-standard OAuth 2.0 authentication
- **Private**: No server-side storage or data persistence
- **Scalable**: Can handle large files and multiple users
- **User-Friendly**: Intuitive interface with comprehensive error handling

For additional features or customization, the application can be extended using the free automation tools available in both Google Workspace and Office 365.