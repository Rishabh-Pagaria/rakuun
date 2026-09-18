import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { authenticateRequest } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A newline in a header value lets the caller append headers of their own
// (Bcc, Reply-To), so reject rather than sanitize.
const hasHeaderInjection = (value: string) => /[\r\n]/.test(value);

const isAscii = (value: string) => /^[\x20-\x7E]*$/.test(value);

// RFC 2047: non-ASCII header values must be encoded or they arrive mangled.
function encodeHeaderValue(value: string): string {
  if (isAscii(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function toBase64Url(value: Buffer | string): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildMimeMessage(to: string, subject: string, body: string): string {
  // Base64 body keeps UTF-8 intact; RFC 2045 caps encoded lines at 76 chars.
  const encodedBody = Buffer.from(body, "utf8")
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");

  return [
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encodedBody
  ].join("\r\n");
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  try {
    const { to, subject, body, userToken } = await req.json();

    if (!to || !subject || !body) {
      return NextResponse.json(
        { error: "Missing required fields: to, subject, or body" },
        { status: 400 }
      );
    }

    if (!userToken) {
      return NextResponse.json(
        { error: "Missing Gmail authorization token" },
        { status: 401 }
      );
    }

    if (!EMAIL_PATTERN.test(to)) {
      return NextResponse.json(
        { error: "Invalid email address format" },
        { status: 400 }
      );
    }

    if (hasHeaderInjection(subject)) {
      return NextResponse.json(
        { error: "Subject may not contain line breaks" },
        { status: 400 }
      );
    }

    const oauthClient = new google.auth.OAuth2();
    oauthClient.setCredentials({ access_token: userToken });

    const gmail = google.gmail({ version: "v1", auth: oauthClient });

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: toBase64Url(buildMimeMessage(to, subject, body)) }
    });

    return NextResponse.json({
      success: true,
      message: "Email sent successfully",
      messageId: result.data.id
    });
  } catch (error) {
    console.error("Error sending email:", error);

    // Gmail rejected the token - the extension clears it and retries once.
    const status = (error as { code?: number }).code;
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: "Gmail authorization failed. Please sign in again." },
        { status: 401 }
      );
    }

    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
