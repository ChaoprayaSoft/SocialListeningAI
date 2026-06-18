import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Return only jobs that are SCRAPE or SCRAPE_AND_ANALYZE and COMPLETED
    const jobs = await prisma.job.findMany({
      where: {
        status: "COMPLETED",
        type: { in: ["SCRAPE", "SCRAPE_AND_ANALYZE"] },
        rawScrapeData: { not: null }, // Must have raw data to be analyzed
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("GET Jobs Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
