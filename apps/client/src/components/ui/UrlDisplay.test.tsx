import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UrlField, UrlText } from "./UrlDisplay";

describe("UrlDisplay", () => {
  const longUrl =
    "https://orange-waterfall.trycloudflare.com/share/super-long-token/abcdefghijklmnopqrstuvwxyz0123456789";

  it("renders a read-only field that truncates visually but preserves the full URL", () => {
    const markup = renderToStaticMarkup(<UrlField url={longUrl} valueClassName="font-mono text-sm" />);

    expect(markup).toContain('role="textbox"');
    expect(markup).toContain('aria-readonly="true"');
    expect(markup).toContain(`title="${longUrl}"`);
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("text-ellipsis");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain(longUrl);
  });

  it("renders plain link text with the same truncation guards", () => {
    const markup = renderToStaticMarkup(<UrlText url={longUrl} className="text-lg font-semibold" />);

    expect(markup).toContain(`title="${longUrl}"`);
    expect(markup).toContain("min-w-0");
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("text-ellipsis");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain(longUrl);
  });

  it("shows a placeholder without exposing a tooltip when no URL is available", () => {
    const markup = renderToStaticMarkup(<UrlField url={null} placeholder="Waiting for link" />);

    expect(markup).toContain("Waiting for link");
    expect(markup).not.toContain('title="');
  });
});
