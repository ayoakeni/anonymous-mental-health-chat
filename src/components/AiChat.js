import { HfInference } from "@huggingface/inference";

const HF_MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.2";

// Initialize the Hugging Face Inference client
const inference = new HfInference(process.env.REACT_APP_HF_API_KEY);

export const getAIResponse = async (message) => {
  try {
    const response = await inference.chatCompletion({
      model: HF_MODEL_NAME,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful mental health support assistant. Provide empathetic, structured, and action-oriented responses. (Disclaimer: Not a substitute for a professional therapist).",
        },
        { role: "user", content: message },
      ],
      max_tokens: 150,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("Hugging Face AI error:", error);
    return "Sorry, I’m having trouble responding right now.";
  }
};
