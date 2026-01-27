import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import chalk from "chalk";
import "dotenv/config";

const model = new ChatOpenAI({
  modelName: "qwen-plus",
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    basePath: process.env.OPENAI_BASE_URL,
  },
});
const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "my-mcp-server": {
      command: "node",
      args: ["D:\\Code\\AiAgent\\tooltest\\src\\my-mcp-server.mjs"],
    },
  },
});

const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 10) {
  const message = [new HumanMessage(query)];

  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`正在等待Ai思考`));
    const response = await modelWithTools.invoke(message);
    message.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n✨ AI 最终回复:\n${response.content}\n`);
      return response.content;
    }

    console.log(
      chalk.bgBlue(`🔍 检测到 ${response.tool_calls.length} 个工具调用`)
    );
    console.log(
      chalk.bgBlue(
        `🔍 工具调用: ${response.tool_calls.map((t) => t.name).join(", ")}`
      )
    );
    for (const toolCall of response.tool_calls) {
      const foundTool = tools.find((tool) => tool.name === toolCall.name);
      if (foundTool) {
        const toolResponse = await foundTool.invoke(toolCall.args);
        message.push(
          new ToolMessage({
            content: toolResponse,
            tool_call_id: toolCall.id,
          })
        );
      } else {
        console.log(chalk.bgRed(`未找到工具: ${toolCall.name}`));
      }
    }
  }
  return message[message.length - 1].content;
}

const res = await mcpClient.listResources();

for (const [serverName, resources] of Object.entries(res)) {
  for (const resource of resources) {
    const content = await mcpClient.readResource(serverName, resource.uri);
    console.log(content);
  }
}
await runAgentWithTools("查一下用户 002 的信息");

await mcpClient.close();
