# rakuun
This is a chrome extension which selects the DOM based HTML content and generate personalized email.
Clone the directory 
```
git clone 
```
Enter to the root folder
<br>
cd <root_directory_name>
<br> 
Run the commdand to install all the necessary dependencies
```
npm install
```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```
# Email Configuration Setup

## Setting up Gmail SMTP for Email Sending

To use the email sending functionality, you need to configure Gmail SMTP settings.

### 1. Enable 2-Factor Authentication
- Go to your Google Account settings: https://myaccount.google.com/
- Navigate to "Security" section
- Enable "2-Step Verification" if not already enabled

### 2. Generate App Password
- In the Security section, find "App passwords"
- Click "App passwords"
- Select "Other (Custom name)" and enter "followup Extension"
- Click "Generate"
- Copy the 16-character password (without spaces)

### 3. Update Environment Variables
Edit the `.env.local` file in your project root:

```
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password
GEMINI_API_KEY=your-existing-gemini-api-key
```

### 4. Restart the Development Server
After updating the environment variables, restart your Next.js development server:

```bash
npm run dev
```

## Usage

1. **Generate Email**: Select text from any webpage, open the extension popup, and click "Generate and Magic"
2. **Send Email**: After generating an email, the "Send Email" button will be enabled. Click it to send the email via Gmail SMTP

## Security Notes

- Never commit your `.env.local` file to version control
- Use App Passwords instead of your regular Gmail password
- The App Password is only for this specific application

## Troubleshooting

- **"Email configuration not set"**: Make sure your `.env.local` file is properly configured
- **"Authentication failed"**: Double-check your email and app password
- **"Network error"**: Ensure your Next.js server is running on `http://localhost:3000`