import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const promptSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});

export async function GET() {
  try {
    const prompts = await prisma.prompt.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(prompts);
  } catch (error) {
    console.error("GET Prompts Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = promptSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { title, content } = parsed.data;

    const prompt = await prisma.prompt.create({
      data: {
        title,
        content,
      },
    });

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error("POST Prompt Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
