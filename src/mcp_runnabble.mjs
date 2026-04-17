import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import chalk from "chalk";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import {
  RunnableBranch,
  RunnableLambda,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";

import { tool } from "@langchain/core/tools";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";

const model = new ChatOpenAI({
  modelName: "qwen-plus",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "amap-maps-streamableHTTP": {
      url: "https://mcp.amap.com/mcp?key=" + process.env.AMAP_MAPS_API_KEY,
    },
    "chrome-devtools": {
      command: "npx",
      args: ["-y", "chrome-devtools-mcp@latest"],
    },
  },
});

const writeFileTool = tool(
  async ({ filePath, content }) => {
    try {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content);
      console.log(
        ` [工具调用] write_file("${filePath}") - 成功写入${content.length}字节`,
      );
      return `文件写入成功:${filePath}`;
    } catch (error) {
      console.log(
        ` [工具调用] write_file("${filePath}") - 错误:${error.message}`,
      );
      return `写入文件失败:${error.message}`;
    }
  },
  {
    name: "write_file",
    description: "向指定路径写入文件内容，自动创建目录",
    schema: z.object({
      filePath: z.string().describe("文件路径"),
      content: z.string().describe("要写入的文件内容"),
    }),
  },
);
const tools = await mcpClient.getTools();

const modelWithTools = model.bindTools([...tools, writeFileTool]);

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个可以调用MCP工具的智能助手。"],
  new MessagesPlaceholder("messages"),
]);

const llmChain = prompt.pipe(modelWithTools);

const toolExecutor = new RunnableLambda({
  func: async (input) => {
    const { response, tools } = input;
    const toolResults = [];

    for (const toolCall of response.tool_calls ?? []) {
      const foundTool = tools.find((t) => t.name === toolCall.name);

      if (!foundTool) continue;

      const toolResult = await foundTool.invoke(toolCall.args);

      const contentstr =
        typeof toolResult === "string"
          ? toolResult
          : toolResult?.text || JSON.stringify(toolResult);

      toolResults.push(
        new ToolMessage({
          content: contentstr,
          tool_call_id: toolCall.id,
        }),
      );
    }

    return toolResults;
  },
});

const agentStepChain = RunnableSequence.from([
  // step1: 将 LLM 输出挂到 state.response 上
  RunnablePassthrough.assign({
    response: llmChain,
  }), // step2: 使用 RunnableBranch 根据是否有 tool_calls 走不同分支
  RunnableBranch.from([
    // 分支1：没有 tool_calls，认为本轮已经完成
    [
      (state) =>
        !state.response?.tool_calls || state.response.tool_calls.length === 0,
      new RunnableLambda({
        func: async (state) => {
          const { messages, response } = state;
          const newMessages = [...messages, response];
          return {
            ...state,
            messages: newMessages,
            done: true,
            final: response.content,
          };
        },
      }),
    ], // 默认分支：有 tool_calls，调用工具并把 ToolMessage 写回 messages
    RunnableSequence.from([
      new RunnableLambda({
        func: async (state) => {
          const { messages, response } = state;
          const newMessages = [...messages, response];

          console.log(
            chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`),
          );
          console.log(
            chalk.bgBlue(
              `🔍 工具调用: ${response.tool_calls
                .map((t) => t.name)
                .join(", ")}`,
            ),
          );

          return {
            ...state,
            messages: newMessages,
          };
        },
      }), // 调用工具执行器，得到 toolMessages
      RunnablePassthrough.assign({
        toolMessages: toolExecutor,
      }),
      new RunnableLambda({
        func: async (state) => {
          const { messages, toolMessages } = state;
          return {
            ...state,
            messages: [...messages, ...(toolMessages ?? [])],
            done: false,
          };
        },
      }),
    ]),
  ]),
]);
async function runAgentWithTools(query, maxIterations = 30) {
  let state = {
    messages: [new HumanMessage(query)],

    done: false,
    final: null,
    tools: [...tools, writeFileTool],
  };

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`⏳ 正在等待 AI 思考...`)); // 每一轮都通过一个完整的 Runnable chain（LLM + 工具调用处理）

    state = await agentStepChain.invoke(state);

    if (state.done) {
      console.log(`\n✨ AI 最终回复:\n${state.final}\n`);
      return state.final;
    }
  }

  return state.messages[state.messages.length - 1].content;
}

await runAgentWithTools(
  "北京南站附近的酒店，最近的 3 个酒店，拿到酒店图片，存下来",
);
