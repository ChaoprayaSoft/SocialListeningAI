import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApifyClient } from "apify-client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const startScrapeSchema = z.object({
  type: z.enum(["SCRAPE", "ANALYZE", "SCRAPE_AND_ANALYZE"]).default("SCRAPE_AND_ANALYZE"),
  url: z.string().url("Invalid URL").optional().or(z.literal("")),
  promptContent: z.string().optional().or(z.literal("")),
  aiModel: z.string().default("gemini-1.5-pro"),
  sourceJobIds: z.array(z.string()).optional(),
  resultsLimit: z.number().min(1).max(100).default(20),
  viewOption: z.string().default("CHRONOLOGICAL"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = startScrapeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { type, url, promptContent, aiModel, sourceJobIds, resultsLimit, viewOption } = parsed.data;

    const titlePrefix = type === "ANALYZE" ? "Analysis" : type === "SCRAPE" ? "Scrape" : "Scrape & Analyze";
    const title = `${titlePrefix} ${new Date().toLocaleString('en-GB')}`;

    const job = await prisma.job.create({
      data: {
        title,
        type,
        url: url || null,
        promptContent: promptContent || null,
        aiModel,
        sourceJobIds: sourceJobIds || [],
        status: type === "ANALYZE" ? "ANALYZING" : "SCRAPING",
      },
    });

    if (type === "ANALYZE") {
      // Run Gemini immediately (Inline)
      if (!sourceJobIds || sourceJobIds.length === 0) {
        throw new Error("Missing source jobs for analysis");
      }
      
      // Fetch raw data from selected jobs
      const sourceJobs = await prisma.job.findMany({
        where: { id: { in: sourceJobIds } }
      });
      
      const combinedRawData = sourceJobs
        .filter(j => j.rawScrapeData)
        .map(j => JSON.parse(j.rawScrapeData!))
        .flat();

      if (combinedRawData.length === 0) {
        await prisma.job.update({ where: { id: job.id }, data: { status: "FAILED", resultReport: "No raw data found in selected jobs." }});
        return NextResponse.json({ jobId: job.id, status: "success" });
      }

      // Do not await the analysis to prevent Vercel timeout - run it asynchronously if possible
      // In standard Node (local), this works. On Vercel, it might get killed after response.
      // But we will try to run it inline and just return the result because returning a response kills the lambda.
      // We will await it inline.
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: aiModel });

      const promptText = `
        You are an AI Social Listening Analyst.
        User Prompt/Instructions: ${promptContent}
        
        Analyze the following social media data (posts and comments) from multiple scraping runs and generate a detailed Markdown report:
        ---
        ${JSON.stringify(combinedRawData, null, 2)}
        ---
      `;

      try {
        const result = await model.generateContent(promptText);
        const reportMarkdown = result.response.text();
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "COMPLETED", resultReport: reportMarkdown },
        });
      } catch (aiError: any) {
        console.error("Gemini Error:", aiError);
        await prisma.job.update({
          where: { id: job.id },
          data: { status: "FAILED", resultReport: `AI Analysis failed: ${aiError.message || "Unknown Error"}` },
        });
      }
      
      return NextResponse.json({ jobId: job.id, status: "success" });
    }

    // For SCRAPE and SCRAPE_AND_ANALYZE, trigger Apify
    const apifyClient = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
    const actorId = process.env.APIFY_ACTOR_ID || "apify/facebook-groups-scraper";
    
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`;
    }
    const webhookUrl = `${baseUrl}/api/scrape/webhook`;

    const run = await apifyClient.actor(actorId).start(
      {
        startUrls: [{ url, method: "GET" }],
        resultsLimit,
        viewOption,
      },
      {
        webhooks: [
          {
            eventTypes: ["ACTOR.RUN.SUCCEEDED"],
            requestUrl: webhookUrl,
            payloadTemplate: `{"runId": "{{resource.id}}", "jobId": "${job.id}", "secret": "${process.env.WEBHOOK_SECRET}"}`,
            shouldInterpolateStrings: true,
          },
        ],
      }
    );

    await prisma.job.update({
      where: { id: job.id },
      data: { apifyRunId: run.id },
    });

    return NextResponse.json({ jobId: job.id, status: "success" });
  } catch (error: any) {
    console.error("Start Scrape Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
