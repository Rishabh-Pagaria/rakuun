import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { selectedText } = await req.json();

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

//   Here an extra feature can be added where a user can specify if they want to reach out to a professor or hiring manager, and the email can be tailored accordingly.
  const prompt = `You are a helpful assistant that crafts personalized outreach emails.
                Use the following selected content from a webpage:
                """
                ${selectedText}
                """
                Generate a concise, polite, and personalized outreach email to a professor or hiring manager.
                `; 
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return NextResponse.json({ email: text });
}
