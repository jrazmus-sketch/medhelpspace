import { NextResponse } from "next/server";
import { getBellFeed } from "@/lib/notifications-feed";

// Polled by the notification bell for near-real-time updates. getBellFeed handles
// auth + mock-mode internally and returns an empty feed when there's no user.
export async function GET() {
  const feed = await getBellFeed();
  return NextResponse.json(feed);
}
