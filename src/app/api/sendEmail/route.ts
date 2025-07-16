import { NextRequest, NextResponse } from "next/server";
import {google} from "googleapis";

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body, userToken } = await req.json();

    // Validate required fields
    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, or body" },
        { status: 400 }
      );
    }

    // checks if user token is provided
    if(!userToken) {
        return NextResponse.json(
            { error: "Missing user authentication token" },
            { status: 401 }
        );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json(
        { error: "Invalid email address format" },
        { status: 400 }
      );
    }

    // create oauth2 client
    const oauthClient = new google.auth.OAuth2();
    oauthClient.setCredentials({ access_token: userToken });

    // create gmail api instance
    const gmail = google.gmail({ version: 'v1', auth: oauthClient });

    // create email structure
    const emailMessage = [
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
    ].join('\n');

    // Encode the email message
    const encodedMessage = Buffer.from(emailMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    // send the email using gmail api
    const result = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedMessage,
        },
    });

    return NextResponse.json({
      success: true,
      message: "Email sent successfully",
      messageId: result.data.id,
    });
  } catch (error) {
    console.error('Error sending email:', error);

    // specific error handling
    if (error.code === 401) {
        return NextResponse.json(
            { error: "Authentication Failed, Sign in Again" },
            { status: 401 }
        );
    }
    return NextResponse.json(
      { error: "Failed to send email: " + (error as Error).message },
      { status: 500 }
    );
  }
}
