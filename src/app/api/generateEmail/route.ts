import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  const { selectedText } = await req.json();

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // prompt to generate a personalized outreach email, extracting recipient's email and creating a subject line
  const prompt = `You are a helpful assistant that crafts personalized outreach emails.
                
                The user has selected content from a webpage about a person (professor, hiring manager, etc.):
                """
                ${selectedText}
                """

                Based on this information about the recipient, generate a personalized outreach email that:
                1. A personalized outreach email written FROM the user TO the person described in the selected content
                2. Extract or infer the recipient's email address if mentioned in the content
                3. Create an appropriate subject line for the email
                
                Requirements for the email:
                - Professional, concise, and appropriate for academic/professional outreach
                - Shows the user has researched the recipient's background, interests, or work
                - Includes placeholders like [Your Name], [Your Background], [Specific Reason for Contact]
                - References specific details from the selected content
                
                Return your response only as a JSON format {key:value} pair as per the below exact JSON format:
                {
                  "email": "the email content here",
                  "to": "recipient@email.com or 'Not found' if no email in content",
                  "subject": "Generated subject line here"
                }
                
                Generate now:
                `; 
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try{
    // Parse the JSON response from the model
    const parseResponse = JSON.parse(text);
    console.log(parseResponse);
    
    return NextResponse.json(parseResponse);
  } catch (error) {
    // Parsing fails, return the raw text as a fallback
    console.log(error);
    return NextResponse.json({
      email: text,
      to: "Not found",
      suject: "Colloboration Enquiry"
    });
  }
}