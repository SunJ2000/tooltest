import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import path from "node:path";
import { FileSystemChatMessageHistory } from "@langchain/community/stores/message/file_system";

const model = new ChatOpenAI({
  model: "qwen-plus",
  apiKey: process.env.API_KEY,
  configuration: {
    baseURL: process.env.BASE_URL,
  },
});

async function main() {
  const filePath = path.join(process.cwd(), "chat_history.json");
  const sessionId = "user_session_001";
  const history = new FileSystemChatMessageHistory({
    filePath: filePath,
    sessionId: sessionId,
  });

  const systemMessage = new SystemMessage("你是一个烹饪助手，爱好烹饪和分享");
  const firstQuestion = new HumanMessage("你今天吃什么?");

  await history.addMessage(firstQuestion);

  const response = await model.invoke([
    systemMessage,
    ...(await history.getMessages()),
  ]);

  await history.addMessage(response);
  console.log("------------第一次问答------------");
  console.log("问：", firstQuestion.content);
  console.log("答：", response.content);

  const secondQuestion = new HumanMessage("好吃吗?");

  await history.addMessage(secondQuestion);

  const secondResponse = await model.invoke([
    systemMessage,
    ...(await history.getMessages()),
  ]);

  await history.addMessage(secondResponse);

  console.log("------------第二次问答------------");
  console.log("问：", secondQuestion.content);
  console.log("答：", secondResponse.content);

  console.log("------------历史记录------------");
  const allMessages = await history.getMessages();
  console.log("历史记录条数：", allMessages.length);
  allMessages.forEach((msg, index) => {
    const type = msg.type;
    const prefix = type === "human" ? "用户" : "助手";
    console.log(
      `  ${index + 1}. [${prefix}]: ${msg.content.substring(0, 50)}...`
    );
  });
}

await main().catch(console.error);
