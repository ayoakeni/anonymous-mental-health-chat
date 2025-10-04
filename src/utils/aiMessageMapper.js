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
