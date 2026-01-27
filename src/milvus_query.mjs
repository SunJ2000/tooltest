import "dotenv/config";
import "cheerio";
import { OpenAIEmbeddings } from "@langchain/openai";
import {
  DataType,
  IndexType,
  MetricType,
  MilvusClient,
} from "@zilliz/milvus2-sdk-node";

const COLLECTION_NAME = "ai_diary";
const VECTOR_DIM = 1024;

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EMBEDDINGS_MODEL_NAME,
  configuration: {
    baseURL: process.env.OPENAI_BASE_URL,
  },
});

const client = new MilvusClient({
  address: "106.14.136.223:19530",
});

async function insert() {
  try {
    console.log("Connecting to Milvus...");
    await client.connectPromise;
    console.log("Connected to Milvus!\n  ");

    console.log("Searching for similar diary entries...");
    const query = "我想看看关于户外活动的日记";
    console.log(`Query: "${query}"\n`);

    const queryEmbedding = await embeddings.embedQuery(query);
    const searchResult = await client.search({
      collection_name: COLLECTION_NAME,
      limit: 2,
      metric_type: MetricType.COSINE,
      vector: queryEmbedding,
      output_fields: ["id", "content", "date", "mood", "tags"],
    });

    console.log(`Found ${searchResult.results.length} results:\n`);
    searchResult.results.forEach((item, index) => {
      console.log(`${index + 1}. [Score: ${item.score.toFixed(4)}]`);
      console.log(`   ID: ${item.id}`);
      console.log(`   Date: ${item.date}`);
      console.log(`   Mood: ${item.mood}`);
      console.log(`   Tags: ${item.tags?.join(", ")}`);
      console.log(`   Content: ${item.content}\n`);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

insert();
