import { getGenerativeModel } from "firebase/ai";
import { ai } from "../utils/firebase";

// Gemini model
const model = getGenerativeModel(ai, { model: "gemini-flash-latest" });

// Supportive AI response function
export const getAIResponse = async (message) => {
  try {
    const prompt = `
    You are a supportive mental health assistant. 
    Respond kindly, with empathy and encouragement, 
    but remember you are not a professional therapist."
    
    User message: "${message}"
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return text || "I'm here to listen. Can you tell me more about how you're feeling?";
  } catch (error) {
    console.error("Firebase AI error:", error);
    return "Sorry, I’m having trouble responding right now.";
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