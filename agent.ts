import { randomUUID } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";
import { init, Scanner, Content, AISecSDKException } from "@cdot65/prisma-airs-sdk";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const endpoint = requireEnv("AZURE_AI_ENDPOINT");
const agentName = requireEnv("AZURE_AI_AGENT_NAME");
const agentVersion = requireEnv("AZURE_AI_AGENT_VERSION");
const airsProfile = requireEnv("PANW_AI_SEC_PROFILE_NAME");

const userPrompt = process.env.AGENT_PROMPT ?? "How do I make a classic French baguette at home?";

// Initialize AIRS (reads PANW_AI_SEC_API_KEY + PANW_AI_SEC_API_ENDPOINT from env)
init();

const userEmail = process.env.GIT_USER_EMAIL || "unknown";
const execId = randomUUID();
// SDK caps sessionId at 100 chars; email + ":" + uuid (36) fits comfortably
const sessionId = `${userEmail}:${execId}`.slice(0, 100);
console.error(`AIRS session: ${sessionId}`);

const scanner = new Scanner();
const scanMetadata = {
  app_name: "prisma-airs-recipe-agent-azure-foundry",
  app_user: userEmail,
  ai_model: `${agentName}:${agentVersion}`,
};

const projectClient = new AIProjectClient(endpoint, new DefaultAzureCredential());

async function scan(content: Content, stage: "prompt" | "response"): Promise<void> {
  try {
    const result = await scanner.syncScan(
      { profile_name: airsProfile },
      content,
      { metadata: scanMetadata, sessionId },
    );
    console.error(`AIRS ${stage} scan: category=${result.category} action=${result.action} scan_id=${result.scan_id} report_id=${result.report_id}`);
    if (result.action === "block") {
      console.error(`\nBlocked by AIRS at ${stage} stage. scan_id=${result.scan_id}`);
      process.exit(2);
    }
  } catch (err) {
    if (err instanceof AISecSDKException) {
      console.error(`AIRS SDK error at ${stage} stage: ${err.message} (${err.errorType})`);
    } else {
      console.error(`Unexpected AIRS error at ${stage} stage:`, err);
    }
    process.exit(3);
  }
}

async function main() {
  // 1. Scan the prompt before it ever reaches the model
  await scan(new Content({ prompt: userPrompt }), "prompt");

  const openAIClient = projectClient.getOpenAIClient();

  console.log("\nGenerating response (single-turn, no conversation)...");
  const response = await openAIClient.responses.create(
    { input: userPrompt },
    { body: { agent_reference: { type: "agent_reference", name: agentName, version: agentVersion } } },
  );

  // 2. Scan the response before showing it to the user
  await scan(new Content({ prompt: userPrompt, response: response.output_text }), "response");

  console.log("Response output: ");
  console.log(response.output_text);
}

main();
