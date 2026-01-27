import "dotenv/config";
import "cheerio";
import { parse } from "path";
import { OpenAIEmbeddings } from "@langchain/openai";
import {
  DataType,
  IndexType,
  MetricType,
  MilvusClient,
} from "@zilliz/milvus2-sdk-node";
import { EPubLoader } from "@langchain/community/document_loaders/fs/epub";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const COLLECTION_NAME = "ebook_collection";
const VECTOR_DIM = 1024;
const EPUB_FILE = "./天龙八部.epub";

const BOOK_NAME = parse(EPUB_FILE).name;

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

async function ensureCollection() {
  try {
    const hasCollection = await client.hasCollection({
      collection_name: COLLECTION_NAME,
    });
    if (!hasCollection.value) {
      await client.createCollection({
        collection_name: COLLECTION_NAME,
        fields: [
          {
            name: "id",
            data_type: DataType.VarChar,
            max_length: 50,
            is_primary_key: true,
          },
          {
            name: "book_id",
            data_type: DataType.VarChar,
            max_length: 50,
          },
          {
            name: "book_name",
            data_type: DataType.VarChar,
            max_length: 50,
          },
          {
            name: "chapter_num",
            data_type: DataType.Int32,
          },
          {
            name: "index",
            data_type: DataType.Int32,
          },
          {
            name: "content",
            data_type: DataType.VarChar,
            max_length: 5000,
          },
          {
            name: "vector",
            data_type: DataType.FloatVector,
            dim: VECTOR_DIM,
          },
        ],
      });
      console.log("Collection created!");
      await client.createIndex({
        collection_name: COLLECTION_NAME,
        field_name: "vector",
        index_type: IndexType.IVF_FLAT,
        metric_type: MetricType.COSINE,
        params: {
          nlist: 1024,
        },
      });
      console.log("Index created!");
    }

    try {
      await client.loadCollection({ collection_name: COLLECTION_NAME });
      console.log("Collection loaded!");
    } catch (error) {
      console.log(error);
    }
  } catch (error) {
    console.log(error);
  }
}

async function insertChunsks(chunks, bookId, chapterIndex) {
  try {
    if (chunks.length < 0) {
      return 0;
    }
    const insertData = await Promise.all(
      chunks.map(async (chunk, chunkIndex) => {
        const vector = await embeddings.embedQuery(chunk);
        return {
          id: `${bookId}_${chapterIndex}_${chunkIndex}`,
          book_id: bookId,
          book_name: BOOK_NAME,
          chapter_num: chapterIndex,
          index: chunkIndex,
          content: chunk,
          vector: vector,
        };
      })
    ); // 批量插入到 Milvus
    const insertResult = await client.insert({
      collection_name: COLLECTION_NAME,
      data: insertData,
    });

    return Number(insertResult.insert_cnt) || 0;
  } catch (error) {
    console.error(`插入章节 ${chapterIndex} 的数据时出错:`, error.message);
    console.error("错误详情:", error);
    throw error;
  }
}

async function loadAndProcessEpubStreaming(bookId) {
  try {
    console.log(`Loading book ${EPUB_FILE}... `);
    const loader = new EPubLoader(EPUB_FILE, {
      splitChapters: true,
    });

    const documents = await loader.load();
    console.log(`Loaded ${documents.length} documents from ${EPUB_FILE}`);

    const textsplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chounkOverlap: 50,
    });

    let totalInserted = 0;

    for (
      let chapterIndex = 0;
      chapterIndex < documents.length;
      chapterIndex++
    ) {
      const chapter = documents[chapterIndex];
      const chaptContent = chapter.pageContent;
      console.log(`Processing chapter ${chapterIndex + 1}... `);

      const chunks = await textsplitter.splitText(chaptContent);
      console.log(`Splitted into ${chunks.length} chunks.`);

      if (chunks.length < 0) {
        console.log(
          `Skipping chapter ${chapterIndex + 1} because it has no content.`
        );
        continue;
      }

      console.log(`  vectorizing ${chunks.length} chunks...`);

      const insertedCounte = await insertChunsks(chunks, bookId, chapterIndex);
      totalInserted += insertedCounte;
      console.log(`  inserted ${insertedCounte} chunks.`);
    }
    console.log(`Total inserted ${totalInserted} chunks.`);
    return totalInserted;
  } catch (error) {
    console.error("Error:", error);
  }
}
async function main() {
  try {
    console.log("=".repeat(80));
    console.log("Milvus Ebook Writer");
    console.log("=".repeat(80));

    console.log("Connecting to Milvus...");
    await client.connectPromise;
    console.log("Connected to Milvus!\n  ");

    const bookId = 1;

    await ensureCollection();
    await loadAndProcessEpubStreaming(bookId);

    console.log("Data inserted!\n  ");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();
