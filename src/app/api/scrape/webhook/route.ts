import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApifyClient } from "apify-client";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  let jobId: string | undefined;

  try {
    const body = await req.json();
    jobId = body.jobId;

    const { runId, secret } = body;

    // 1. Webhook Security Verification
    if (secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!jobId || !runId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 2. Fetch Data from Apify
    const apifyClient = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    const run = await apifyClient.run(runId).get();
    
    if (!run || !run.defaultDatasetId) {
       await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED", resultReport: "Apify run invalid or has no dataset." } });
       return NextResponse.json({ error: "Apify run invalid" }, { status: 400 });
    }

    const dataset = await apifyClient.dataset(run.defaultDatasetId).listItems();
    
    if (!dataset.items || dataset.items.length === 0) {
      await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED", resultReport: "No data scraped from the URL." } });
      return NextResponse.json({ error: "Empty dataset" }, { status: 400 });
    }

    // Extract textual content
    const extractedData = dataset.items.map((item: any) => ({
      postText: item.text || item.message || "",
      comments: item.comments?.map((c: any) => c.text || c.message || "") || [],
    }));

    const rawDataString = JSON.stringify(extractedData, null, 2);

    // Fetch Job to check type
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    // Update with raw data
    await prisma.job.update({
      where: { id: jobId },
      data: { rawScrapeData: rawDataString },
    });

    if (job.type === "SCRAPE") {
      // Just Scraping, no AI needed
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "COMPLETED" },
      });
      return NextResponse.json({ status: "success" });
    }

    // Otherwise, SCRAPE_AND_ANALYZE
    await prisma.job.update({ where: { id: jobId }, data: { status: "ANALYZING" } });

    // Send to Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const promptText = `
      You are an AI Social Listening Analyst.
      User Prompt/Instructions: ${job.promptContent}
      
      Analyze the following social media data (posts and comments) and generate a detailed Markdown report:
      ---
      ${rawDataString}
      ---
    `;

    const result = await model.generateContent(promptText);
    const response = await result.response;
    const reportMarkdown = response.text();

    // Save Report to DB
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        resultReport: reportMarkdown,
      },
    });

    return NextResponse.json({ status: "success" });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    if (jobId) {
      try {
        await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED", resultReport: `System Error: ${error.message || "Unknown"}` } });
      } catch(e) {}
    }
    
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
