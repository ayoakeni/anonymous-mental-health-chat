import { getGenerativeModel } from "firebase/ai";
import { ai } from "../utils/firebase";

  // Gemini model
  const model = getGenerativeModel(ai, {
    model: "gemini-flash-latest",
    systemInstruction: {
      role: "system",
      parts: [{
        text: `You are a supportive assistant for Anonymous Mental Health Support platform. 
        Respond kindly, with empathy and encouragement, 
        but remember you are not a professional therapist. 
        IMPORTANT RULES:
        - Do NOT greet the user with "Hello" or "Hi"
        - Respond naturally and conversationally`.trim()
      }]
    }
  });

// Supportive AI response function
export const getAIResponse = async (userMessage, previousMessages = []) => {
  try {
    const relevantMessages = previousMessages
      .filter(m => m.text && (m.role === "user" || m.role === "ai"))
      .map(m => ({
        role: m.role === "ai" ? "model" : "user",
        parts: [{ text: m.text }],
      }));

    let history = [...relevantMessages];

    // Remove the last message if it's from the user (since we're sending a new one)
    if (history.length > 0 && history[history.length - 1].role === "user") {
      history.pop();
    }

    // Extra safety: remove any consecutive duplicate roles
    history = history.filter((msg, index) => {
      if (index === 0) return true;
      return msg.role !== history[index - 1].role;
    });

    // If empty or doesn't start with user, add a greeting
    if (history.length === 0 || history[0].role !== "user") {
      history.unshift({
        role: "user",
        parts: [{ text: "Hello" }],
      });
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(userMessage || " ");
    return result.response.text();

  } catch (error) {
    console.error("Gemini AI error:", error);

    // FALLBACK HERE
    if (
      error.message?.includes("invalid-content") ||
      error.message?.includes("role") ||
      error.message?.includes("can't follow")
    ) {
      try {
        console.warn("Gemini rejected history. Retrying with minimal context...");

        const chat = model.startChat({ history: [] });

        const result = await chat.sendMessage(
          "You are a warm, empathetic support assistant helping someone who may be feeling distressed. " +
          "Respond kindly and supportively to their latest message: \"" + (userMessage || "").trim() + "\""
        );

        return result.response.text();
      } catch (retryError) {
        console.error("Even retry failed:", retryError);
      }
    }

    // Fallback if everything fails
    return "Sorry, I’m having trouble responding right now. Please try again in a moment.";
  }
};

export const mapMessagesForAI = (messages) => {
  return messages.map((m) => {
    switch (m.role) {
      case "user":
        return { role: "user", content: m.text };
      case "therapist":
        return { role: "therapist", content: m.text };
      case "ai":
        return { role: "assistant", content: m.text };
      case "system":
        return { role: "system", content: m.text };
      default:
        return { role: "user", content: m.text };
    }
  });
};