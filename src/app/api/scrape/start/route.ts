import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApifyClient } from "apify-client";

// Input validation schema
const startScrapeSchema = z.object({
  url: z.string().url("Invalid Facebook URL"),
  promptContent: z.string().min(1, "Prompt cannot be empty").max(2000, "Prompt is too long"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Validate Input
    const parsed = startScrapeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { url, promptContent } = parsed.data;

    // 2. Create Job in DB
    const job = await prisma.job.create({
      data: {
        url,
        promptContent,
        status: "SCRAPING",
      },
    });

    // 3. Trigger Apify Actor
    const apifyClient = new ApifyClient({
      token: process.env.APIFY_API_TOKEN,
    });

    // We use the Facebook Pages Scraper Actor (e.g. apify/facebook-pages-scraper or similar)
    // Note: The specific actor ID depends on your Apify setup.
    const actorId = process.env.APIFY_ACTOR_ID || "apify/facebook-pages-scraper";
    
    // Construct Webhook URL (must be absolute)
    let baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
      baseUrl = `https://${baseUrl}`;
    }
    const webhookUrl = `${baseUrl}/api/scrape/webhook`;

    const run = await apifyClient.actor(actorId).start(
      {
        startUrls: [{ url, method: "GET" }],
        resultsLimit: 20,
        viewOption: "CHRONOLOGICAL",
      },
      {
        webhooks: [
          {
            eventTypes: ["ACTOR.RUN.SUCCEEDED"],
            requestUrl: webhookUrl,
            payloadTemplate: `{"runId": "{{resource.id}}", "jobId": "${job.id}", "secret": "${process.env.WEBHOOK_SECRET}"}`,
          },
        ],
      }
    );

    // 4. Update Job with Apify Run ID
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
