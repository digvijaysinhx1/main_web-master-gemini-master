import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI("YOUR_API_KEY");

async function listModels() {
  try {
    const models = await genAI.listModelNames();
    console.log("Available models:", models);
  } catch (error) {
    console.error("Error listing models:", error);
  }
}

listModels();
