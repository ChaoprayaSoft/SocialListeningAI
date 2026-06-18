import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const urlSchema = z.object({
  title: z.string().min(1, "Title is required"),
  url: z.string().url("Valid URL is required"),
});

export async function GET() {
  try {
    const urls = await prisma.savedUrl.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(urls);
  } catch (error) {
    console.error("GET SavedUrls Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = urlSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { title, url } = parsed.data;

    const savedUrl = await prisma.savedUrl.create({
      data: {
        title,
        url,
      },
    });

    return NextResponse.json(savedUrl, { status: 201 });
  } catch (error) {
    console.error("POST SavedUrl Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
