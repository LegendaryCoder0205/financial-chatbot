import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PERSONA } from "@/lib/persona";
import {
  createSession,
  getSession,
  upsertSessionFields,
  getAskedFields,
  markFieldAsAsked,
} from "@/lib/db";
import { formatContext, retrieveRelevant } from "@/lib/rag";
import type { ChatMessage } from "@/lib/types";

type Payload = { messages: ChatMessage[]; sessionId?: string };

// Enhanced extraction using regex patterns (fallback)
function extractFieldsIfPresent(
  text: string
): Partial<{ name: string; email: string; income: string }> | null {
  const fields: Partial<{ name: string; email: string; income: string }> = {};
  // Email extraction
  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) fields.email = emailMatch[0];
  // Income extraction - more flexible patterns
  const incomePatterns = [
    /\b(\$?\d{1,3}[,\d]*\s*(?:k|thousand|K))\b/i,
    /\b(income|make|earn|salary|budget).*?\$?(\d{1,3}[,\d]*\s*(?:k|thousand|K)?)\b/i,
    /\b\$?(\d{2,6})\b/i,
  ];
  for (const pattern of incomePatterns) {
    const match = text.match(pattern);
    if (match) {
      fields.income = match[0];
      break;
    }
  }
  // Name extraction - more patterns
  const namePatterns = [
    /\b(I\s*am|I'm|name\s*is|call\s*me|it's)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/i,
    /\b(hi|hey|hello),?\s*I'm\s+([A-Z][a-zA-Z]+)\b/i,
    /\b([A-Z][a-zA-Z]+)\s+here\b/i,
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      fields.name = match[2].trim();
      break;
    }
  }
  return Object.keys(fields).length ? fields : null;
}

// Use LLM to extract personal info from conversation
async function extractPersonalInfoWithLLM(
  openai: OpenAI,
  messages: ChatMessage[],
  lastUserMessage: string
): Promise<Partial<{ name: string; email: string; income: string }>> {
  try {
    const extractionPrompt = `Extract the full name, email and  income level of user from the following user message. Return ONLY a JSON object with any of these fields if found: name, email, income. If a field is not found, omit it. Be flexible - names can be first names, nicknames, or full names. Income can be mentioned in various ways (e.g., "$50k", "50k", "fifty thousand"). Email should be a valid email format.

User message: "${lastUserMessage}"

Return JSON only, no other text:`;

    const response = await openai.chat.completions.create({
      model: process.env.MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a JSON extraction tool. Return only valid JSON objects.",
        },
        { role: "user", content: extractionPrompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content || "{}";
    const extracted = JSON.parse(content);
    const result: Partial<{ name: string; email: string; income: string }> = {};
    if (extracted.name) result.name = extracted.name.trim();
    if (extracted.email) result.email = extracted.email.trim();
    if (extracted.income) result.income = extracted.income.trim();
    return result;
  } catch (e) {
    // Fallback to regex extraction
    return extractFieldsIfPresent(lastUserMessage) || {};
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Payload;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    let sessionId = body.sessionId;
    if (!sessionId) sessionId = createSession().id;

    // Get current session state
    const session = getSession(sessionId);
    const askedFields = getAskedFields(sessionId);

    // Extract personal info from last user message
    const lastUser = [...body.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUser) {
      // Try regex extraction first (fast), then LLM if needed
      let extractedFields = extractFieldsIfPresent(lastUser.content);
      if (!extractedFields || Object.keys(extractedFields).length === 0) {
        // Only use LLM extraction if regex didn't find anything
        extractedFields = await extractPersonalInfoWithLLM(
          openai,
          body.messages,
          lastUser.content
        );
      }
      if (extractedFields && Object.keys(extractedFields).length > 0) {
        upsertSessionFields(sessionId, extractedFields);
        // Refresh session after update
        const updatedSession = getSession(sessionId);
        if (updatedSession && session) {
          Object.assign(session, updatedSession);
        }
      }
    }

    // Determine what's missing and what's been asked
    const missing: string[] = [];
    if (!session?.name) missing.push("name");
    if (!session?.email) missing.push("email");
    if (!session?.income) missing.push("income");

    // Build context about what we know and what we need
    const userInfoContext = [];
    if (session?.name) userInfoContext.push(`User's name is: ${session.name}`);
    if (session?.email)
      userInfoContext.push(`User's email is: ${session.email}`);
    if (session?.income)
      userInfoContext.push(`User's income level is: ${session.income}`);

    const missingInfo = missing.filter((f) => !askedFields.includes(f));
    if (missingInfo.length > 0 && missingInfo.length <= 1) {
      // Only suggest asking if we haven't asked about it yet and there's only one missing
      userInfoContext.push(
        `You should naturally ask for: ${missingInfo[0]} (but weave it into conversation naturally, don't be direct)`
      );
    }

    // RAG context fetch - run in parallel with other operations if possible
    // Increase k to get more candidates, then we'll prioritize exact matches
    let ragSnippets = lastUser
      ? await retrieveRelevant(lastUser.content, 7)
      : [];

    // Reorder snippets to prioritize the most relevant one for specific queries
    if (lastUser && ragSnippets.length > 0) {
      const queryLower = lastUser.content.toLowerCase();
      if (queryLower.includes("only good information")) {
        // Find the snippet that contains "inside information" and "only good information"
        const relevantIndex = ragSnippets.findIndex(
          (snippet) =>
            snippet.toLowerCase().includes("inside information") &&
            snippet.toLowerCase().includes("only good information")
        );
        if (relevantIndex > 0) {
          // Move the most relevant snippet to the front
          const relevantSnippet = ragSnippets.splice(relevantIndex, 1)[0];
          ragSnippets.unshift(relevantSnippet);
        }
      }
    }

    const contextBlock = formatContext(ragSnippets);

    // Enhanced system prompt with user info context
    let enhancedPersona = SYSTEM_PERSONA;
    if (userInfoContext.length > 0) {
      enhancedPersona += `\n\nCurrent user information:\n${userInfoContext.join(
        "\n"
      )}\n`;
    }
    if (askedFields.length > 0) {
      enhancedPersona += `\nNote: You have already asked about: ${askedFields.join(
        ", "
      )}. Don't ask about these again unless the user brings them up.\n`;
    }

    // CRITICAL: Add explicit RAG context instructions
    let ragInstructions = "";
    if (ragSnippets.length > 0) {
      // Extract key phrases from user query to help identify the right answer
      const lastUserLower = lastUser?.content.toLowerCase() || "";
      const hasOnlyGoodInfo = lastUserLower.includes("only good information");

      ragInstructions = `\n\nCRITICAL RAG CONTEXT INSTRUCTIONS:
- The "Context from knowledge file" section below contains authoritative information from the knowledge base.
- When answering questions, you MUST prioritize and use information from this RAG context above all else.
- If the RAG context contains relevant information, use it as the PRIMARY source for your answer.
- Only use your general knowledge if the RAG context does not contain relevant information.
- When the RAG context directly answers the user's question (especially if it contains exact phrases from the question), base your response EXCLUSIVELY on that context.
- If multiple chunks are provided, prioritize the one that most directly answers the question or contains exact phrase matches.
${
  hasOnlyGoodInfo
    ? `- IMPORTANT: The user asked about "only good information". Look for the chunk that contains the phrase "the only good information is inside information" or mentions "only good information" and "inside information" together. Use THAT chunk as your answer.`
    : ""
}
- Maintain your persona and tone, but ensure your factual content comes from the RAG context when available.
- DO NOT mix RAG context with general knowledge - if RAG has the answer, use ONLY the RAG answer.
- If the RAG context explicitly states an answer to the question, quote or paraphrase that answer directly.`;
    }

    // persona + context
    const system: ChatMessage = {
      role: "system",
      content: enhancedPersona + ragInstructions + contextBlock,
    };
    const messages: ChatMessage[] = [system, ...body.messages];

    // Lower temperature when RAG context is available for more deterministic, context-based responses
    // Even lower temperature for specific queries that need exact answers
    const needsExactAnswer =
      lastUser?.content.toLowerCase().includes("only good information") ||
      false;
    const temperature =
      ragSnippets.length > 0 ? (needsExactAnswer ? 0.1 : 0.3) : 0.6;

    const res = await openai.chat.completions.create({
      model: process.env.MODEL || "gpt-4o-mini",
      messages: messages as any,
      temperature,
    });

    const content = res.choices[0]?.message?.content || "...";

    // Check if the assistant's response asks for missing info, and mark it as asked
    if (missingInfo.length > 0) {
      const askedField = missingInfo[0];
      // Check if the response naturally asks for this field
      const lowerContent = content.toLowerCase();
      const nameIndicators = ["name", "call you", "handle", "who are you"];
      const emailIndicators = ["email", "e-mail", "send you", "contact"];
      const incomeIndicators = [
        "income",
        "capital",
        "budget",
        "working with",
        "trading budget",
        "capital are you",
      ];

      let detectedField: "name" | "email" | "income" | null = null;
      if (
        askedField === "name" &&
        nameIndicators.some((ind) => lowerContent.includes(ind))
      ) {
        detectedField = "name";
      } else if (
        askedField === "email" &&
        emailIndicators.some((ind) => lowerContent.includes(ind))
      ) {
        detectedField = "email";
      } else if (
        askedField === "income" &&
        incomeIndicators.some((ind) => lowerContent.includes(ind))
      ) {
        detectedField = "income";
      }

      if (detectedField) {
        markFieldAsAsked(sessionId, detectedField);
      }
    }

    return NextResponse.json({
      reply: { role: "assistant", content },
      sessionId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
