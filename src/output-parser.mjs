import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import {
  JsonOutputParser,
  StructuredOutputParser,
} from "@langchain/core/output_parsers";

const model = new ChatOpenAI({
  temperature: 0,
  model: "qwen-plus",
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const parser = StructuredOutputParser.fromNamesAndDescriptions({
  name: "姓名",
  birth_year: "出生年份",
  nationality: "国籍",
  major_achievements: "主要成就，用逗号分隔的字符串",
  famous_theory: "著名理论",
});

// 简单的问题，要求 JSON 格式返回

const question = `请介绍一下爱因斯坦的信息。

${parser.getFormatInstructions()}`;

try {
  console.log("🤔 正在调用大模型...\n");

  console.log("问题:", question);

  const response = await model.stream(question);

  for await (const chunk of response) {
    console.log(chunk.content);
  }
} catch (error) {
  console.error("❌ 错误:", error.message);
}
