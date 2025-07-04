import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const cleanJsonResponse = (text: string) => {
  let cleaned = text.trim();

  // Remove various markdown code block formats
  cleaned = cleaned.replace(/^```(?:json|javascript|js)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```\s*$/i, '');

  // Remove any leading or trailing non-JSON characters
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  return cleaned.trim();
}

export async function POST(req: NextRequest) {
  const { selectedText } = await req.json();

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig:{
      responseMimeType: "application/json",
      responseSchema: { 
        type: "object",
        properties: {
          email: {type: "string"},
          to: {type: "string"},
          subject: {type: "string"}
        },
        required: ["email", "to", "subject"]
      }
    }
  });

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
                `; 
  const result = await model.generateContent(prompt);
  // const text = result.response.text();
  const response = JSON.parse(result.response.text());
  return NextResponse.json(response);

  // try{
  //   // Parse the JSON response from the model
  //   const cleanedText = cleanJsonResponse(text);
  //   const parseResponse = JSON.parse(cleanedText);
  //   return NextResponse.json(parseResponse);
  // } catch (error) {
  //   // Parsing fails, return the raw text as a fallback
  //   return NextResponse.json({
  //     email: text,
  //     to: "Not found",
  //     suject: "Colloboration Enquiry"
  //   });
  // }
}