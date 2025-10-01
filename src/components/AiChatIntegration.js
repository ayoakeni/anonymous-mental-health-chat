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
            "You are a supportive mental health assistant. Respond kindly, with empathy and encouragement, but remember you are not a professional therapist.",
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
