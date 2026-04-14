import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { NextRequest, NextResponse } from "next/server";

const voices: Record<string, string> = {
  "cfo-finn": "ru-RU-DmitryNeural",
  "supply-stas": "ru-RU-SvetlanaNeural",
  "accountant-tanya": "ru-RU-SvetlanaNeural",
  "buyer-nova": "ru-RU-SvetlanaNeural",
  "content-max": "ru-RU-DmitryNeural",
  "chief-of-staff-alex": "ru-RU-DmitryNeural",
};

const DEFAULT_VOICE = "ru-RU-DmitryNeural";

function cleanForSpeech(text: string): string {
  let t = text;
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/`[^`]*`/g, "");
  t = t.replace(/[*#~`|]/g, "");
  t = t.replace(/[\u{1F600}-\u{1F9FF}]/gu, "");
  t = t.replace(/https?:\/\/\S+/g, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  t = t.replace(/─+|—+/g, ".");
  return t.trim();
}

export async function POST(req: NextRequest) {
  try {
    const { text, agentId } = await req.json();

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    const cleaned = cleanForSpeech(text);

    if (!cleaned) {
      return NextResponse.json({ error: "Nothing to speak" }, { status: 400 });
    }

    const voice = voices[agentId] ?? DEFAULT_VOICE;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(cleaned);

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);

    return new NextResponse(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": audioBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error("TTS error:", error);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }
}