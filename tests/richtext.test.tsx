import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "@/components/dm/RichText";

describe("RichText", () => {
  it("renders bold, italic and lists", () => {
    const html = renderToStaticMarkup(<RichText text={"**At Will:** Mage Hand\n- _Fireball_\n- Shield"} />);
    expect(html).toContain("<strong");
    expect(html).toContain("At Will:</strong>");
    expect(html).toContain("<em>Fireball</em>");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("never turns text into markup", () => {
    const html = renderToStaticMarkup(<RichText text={'<img src=x onerror="alert(1)"> **<script>x</script>**'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });
});
