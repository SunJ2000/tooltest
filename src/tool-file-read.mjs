import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import fs from "node:fs/promises";
import { z } from "zod";

const model = new ChatOpenAI({
  modelName: process.env.MODEL_NAME || "qwen-coder-turbo",
  apiKey: process.env.API_KEY,
  configuration: {
    baseURL: process.env.BASE_URL,
  },
});

const readFileTool = tool(
  async (filePath) => {
    const fileContent = await fs.readFile(filePath, "utf8");
    console.log(`【工具调用】Reading file: ${filePath}`);
    return fileContent;
  },

  {
    name: "read_file",
    description: "Reads a file and returns its content",
    schema: z.string().describe("The path of the file to read"),
  }
);

const tools = [readFileTool];

const modelWithTools = model.bindTools(tools);
const messages = [
  new SystemMessage(`你是一个代码助手，可以使用工具读取文件并解释代码。
  
  工作流程：
  1. 用户要求读取文件时，立即调用 read_file 工具
  2. 等待工具返回文件内容
  3. 基于文件内容进行分析和解释
  
  可用工具：
  - read_file: 读取文件内容（使用此工具来获取文件内容）
  `),
  new HumanMessage("请读取 ./src/tool-file-read.mjs 文件内容并解释代码"),
];

let response = await modelWithTools.invoke(messages);
// console.log(response);

messages.push(response);

while (response.tool_calls && response.tool_calls.length > 0) {
  console.log(response.tool_calls.length, "个【工具调用】");
  const toolResults = await Promise.all(
    response.tool_calls.map(async (toolCall) => {
      const tool = tools.find((t) => t.name === toolCall.name);
      if (!tool) {
        throw new Error(`No tool found with name ${toolCall.name}`);
      }
      console.log(
        `  [执行工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`
      );
      try {
        const toolResponse = await tool.invoke(toolCall.args);
        return toolResponse;
      } catch (e) {
        console.log(e);
        return `error: ${e.message}`;
      }
    })
  );

  response.tool_calls.forEach((toolCall, index) => {
    messages.push(
      new ToolMessage({
        content: toolResults[index],
        tool_call_id: toolCall.id,
      })
    );
  });
  response = await modelWithTools.invoke(messages);
  messages.push(response);
}
console.log("【最终回复】");
console.log(response.content);
