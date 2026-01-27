import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import z from "zod";

const database = {
  users: {
    "001": {
      id: "001",
      name: "张三",
      email: "zhangsan@example.com",
      role: "admin",
    },
    "002": {
      id: "002",
      name: "李四",
      email: "liaasi@example.com",
      role: "user",
    },
    "003": {
      id: "003",
      name: "王五",
      email: "wu@example.com",
      role: "user",
    },
  },
};

const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "query_user",
  {
    description: "查询用户",
    inputSchema: { userId: z.string().describe("用户ID,例如 ：001") },
  },
  async ({ userId }) => {
    const user = database.users[userId];

    if (!user) {
      return {
        content: [
          {
            type: "text",
            text: `用户 ${userId} 不存在`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `用户信息：\n- ID: ${user.id}\n- 姓名: ${user.name}\n- 邮箱: ${user.email}\n- 角色: ${user.role}`,
        },
      ],
    };
  }
);

server.registerResource(
  "docs-guide", // ✅ 稳定的 resourceId
  "docs://guide", // ✅ MCP URI
  {
    description: "MCP Server 使用指南",
    mimeType: "text/plain",
  },
  async () => {
    return {
      contents: [
        {
          uri: "docs://guide",
          mimeType: "text/plain",
          text: `MCP Server 使用指南
  
  功能：
  - 提供用户查询等工具
  
  使用方式：
  - 在 Cursor 等 MCP Client 中通过自然语言对话
  - 客户端会自动选择并调用工具`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
console.log("MCP Server 正在启动...");
await server.connect(transport);
