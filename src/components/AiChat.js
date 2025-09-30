import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

export const getAIResponse = async (message) => {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a supportive mental health chatbot.",
        },
        { role: "user", content: message },
      ],
      max_tokens: 150
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("AI error:", error);
    return "Sorry, I’m having trouble responding right now.";
  }
};