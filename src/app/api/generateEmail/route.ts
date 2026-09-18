import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { authenticateRequest } from "@/lib/supabase";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const MAX_SELECTED_TEXT = 12000;

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.ok) return auth.response;

  const { selectedText, context } = await req.json();

  if (typeof selectedText !== "string" || !selectedText.trim()) {
    return NextResponse.json(
      { error: "selectedText is required" },
      { status: 400 }
    );
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite-preview-06-17",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          email: { type: SchemaType.STRING },
          to: { type: SchemaType.STRING },
          subject: { type: SchemaType.STRING }
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
                  ${selectedText.slice(0, MAX_SELECTED_TEXT)}
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

  try {
    const result = await model.generateContent(prompt);
    const response = JSON.parse(result.response.text());

    return NextResponse.json({
      ...response,
      _metadata: { context }
    });
  } catch (error) {
    console.error("Email generation failed:", error);
    return NextResponse.json(
      { error: "Could not generate an email. Please try again." },
      { status: 502 }
    );
  }
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
