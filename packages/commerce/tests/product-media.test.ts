import { describe, expect, it } from "vitest";
import { classifyStoryMedia, isVideoFileUrl, youtubeId } from "../src/product-media";

describe("youtubeId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads %s", (url, id) => expect(youtubeId(url)).toBe(id));

  it.each(["https://evil.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=short", "javascript:alert(1)", "not a url", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"])(
    "rejects %s", (url) => expect(youtubeId(url)).toBeNull());
});

describe("classifyStoryMedia", () => {
  const imageOk = (u: string) => u.startsWith("https://images.example.com/") || /^\/media\/[0-9a-f-]{36}$/.test(u);
  it("detects each kind", () => {
    expect(classifyStoryMedia("https://youtu.be/dQw4w9WgXcQ", imageOk)).toEqual({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind: "youtube" });
    expect(classifyStoryMedia("https://cdn.example.com/a/demo.mp4", imageOk)?.kind).toBe("video");
    expect(classifyStoryMedia("https://images.example.com/x.jpg", imageOk)?.kind).toBe("image");
    expect(classifyStoryMedia("", imageOk)).toBeNull();
    expect(classifyStoryMedia("https://other.example.com/x.jpg", imageOk)).toBeNull();
    expect(isVideoFileUrl("http://cdn.example.com/a.mp4")).toBe(false);
  });
});
