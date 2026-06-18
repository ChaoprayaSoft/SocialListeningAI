import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApifyClient } from "apify-client";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const { runId, jobId, secret } = body;

    // 1. Webhook Security Verification
    if (secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!jobId || !runId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 2. Update Job Status
    const job = await prisma.job.update({
      where: { id: jobId },
      data: { status: "ANALYZING" },
    });

    // 3. Fetch Data from Apify
    const apifyClient = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });
    const run = await apifyClient.run(runId).get();
    
    if (!run || !run.defaultDatasetId) {
       await prisma.job.update({ where: { id: jobId }, data: { status: "FAILED" } });
       return NextResponse.json({ error: "Apify run invalid" }, { status: 400 });
    }

    const dataset = await apifyClient.dataset(run.defaultDatasetId).listItems();
    
    // Extract textual content for Gemini
    const extractedData = dataset.items.map((item: any) => ({
      postText: item.text,
      comments: item.comments?.map((c: any) => c.text) || [],
    }));

    const rawDataString = JSON.stringify(extractedData, null, 2);

    // 4. Send to Gemini
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

    // 5. Save Report to DB
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
    // Attempt to mark as failed
    try {
      const body = await req.json();
      if (body.jobId) {
        await prisma.job.update({ where: { id: body.jobId }, data: { status: "FAILED" } });
      }
    } catch(e) {}
    
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
