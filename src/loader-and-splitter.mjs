import "dotenv/config";
import "cheerio";
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";

const model = new ChatOpenAI({
  temperature: 0,
  model: "qwen-plus",
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const cheerioLoader = new CheerioWebBaseLoader(
  "https://juejin.cn/post/7233327509919547452",
  {
    selector: ".main-area p",
  }
);

const documents = await cheerioLoader.load();

const testSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 400,
  chunkOverlap: 50,
  separators: ["。", "？", "！", "；"],
});

const splittedDocuments = await testSplitter.splitDocuments(documents);

const vectorStore = await MemoryVectorStore.fromDocuments(
  splittedDocuments,
  embeddings
);

const retriever = vectorStore.asRetriever({ k: 2 });

const question = "父亲的去世对作者有什么影响？";

const retrievedDocs = await retriever.invoke(question);

const scoredResults = await vectorStore.similaritySearchWithScore(question, 2);

retrievedDocs.forEach((doc, i) => {
  // 找到对应的评分
  const scoredResult = scoredResults.find(
    ([scoredDoc]) => scoredDoc.pageContent === doc.pageContent
  );
  const score = scoredResult ? scoredResult[1] : null;
  const similarity = score !== null ? (1 - score).toFixed(4) : "N/A";
  console.log(`\n[文档 ${i + 1}] 相似度: ${similarity}`);
  console.log(`内容: ${doc.pageContent}`);
  if (doc.metadata && Object.keys(doc.metadata).length > 0) {
    console.log(`元数据:`, doc.metadata);
  }
});

// 构建 prompt
const context = retrievedDocs
  .map((doc, i) => `[片段${i + 1}]\n${doc.pageContent}`)
  .join("\n\n━━━━━\n\n");

const prompt = `你是一个文章辅助阅读助手，根据文章内容来解答：
    
    文章内容：
    ${context}
    
    问题: ${question}
    
    你的回答:`;

console.log("\n【AI 回答】");
const response = await model.invoke(prompt);
console.log(response.content);
console.log("\n");
