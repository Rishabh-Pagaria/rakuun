import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "console";

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
  const { selectedText, context } = await req.json();

  const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite-preview-06-17",
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

  // prompt to generate a personalized outreach email, extracting recipient's email and creating a subject line with context
  const prompt = `You are a helpful assistant that crafts personalized outreach emails.
                  
                  CONTEXT: The user wants to write a ${context || 'general outreach'} email.
                  
                  RECIPIENT INFORMATION from selected webpage content:
                  """
                  ${selectedText}
                  """

                  Based on the context "${context}" and recipient information, generate a personalized email that:
                  
                  ${getContextSpecificInstructions(context)}
                  
                  GENERAL REQUIREMENTS:
                  - Professional tone appropriate for ${context || 'professional outreach'}
                  - Reference specific details from the recipient's background
                  - Include placeholders: [Your Name], [Your Background], [Your Institution/Company]
                  - Extract recipient's email if mentioned in content
                  - Create compelling subject line for ${context || 'outreach'}
                  - Keep concise (under 250 words for email body)
                  `;
  const result = await model.generateContent(prompt);
  // const text = result.response.text();
  const response = JSON.parse(result.response.text());
  return NextResponse.json({
    ...response,
    _metadata: {
      context: context
    }
  });

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

function getContextSpecificInstructions(context: string): string {
  const instructions: Record<string, string> = {
    'job_application': `
      - Express interest in specific job opportunities or roles
      - Highlight relevant skills and experience alignment
      - Request informational interview or application guidance
      - Show knowledge of their company/organization
      - Professional closing with resume attachment mention`,
      
    'research_collaboration': `
      - Express interest in their research work or publications
      - Propose potential collaboration opportunities
      - Mention relevant research background or interests
      - Request meeting to discuss research synergies
      - Academic/research-focused tone`,
      
    'ta_application': `
      - Express interest in Teaching Assistant position
      - Mention relevant course knowledge or teaching experience
      - Reference specific courses they teach
      - Show enthusiasm for helping students learn
      - Request application process information`,
      
    'internship_inquiry': `
      - Express interest in internship opportunities
      - Highlight relevant coursework and projects
      - Show knowledge of their work/company
      - Request guidance on application process
      - Student-professional tone`,
      
    'networking': `
      - Express admiration for their professional journey
      - Request brief informational chat or coffee meeting
      - Show genuine interest in their expertise
      - Keep casual but professional
      - Focus on learning and connection`,
      
    'phd_inquiry': `
      - Express interest in PhD opportunities under their supervision
      - Reference their research papers or projects
      - Highlight relevant academic background
      - Request information about admission process
      - Academic and formal tone`,
      
    'conference_meeting': `
      - Reference upcoming conference or event
      - Express interest in meeting during the event
      - Mention shared research interests or sessions
      - Propose specific meeting time/location
      - Conference networking tone`,
      
    'guest_lecture': `
      - Invite for guest lecture or talk
      - Mention specific course or event details
      - Reference their expertise relevance
      - Provide event logistics and compensation info
      - Formal invitation tone`
  };
  
  return instructions[context] || `
    - Write a professional outreach email
    - Show genuine interest in their work
    - Request appropriate follow-up action
    - Maintain professional courtesy`;
}