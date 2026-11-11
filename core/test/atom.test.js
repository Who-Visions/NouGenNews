import test from "node:test";
import assert from "node:assert/strict";
import { feedItems } from "../atom.js";

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Example</title>
  <link rel="self" href="https://ex.test/feed.atom"/>
  <entry>
    <title type="html">Kotaku &amp;amp; friends: &lt;b&gt;big&lt;/b&gt; news</title>
    <link rel="replies" href="https://ex.test/post/1#comments"/>
    <link rel="alternate" type="text/html" href="https://ex.test/post/1"/>
    <link rel="enclosure" type="image/jpeg" href="https://img.test/1.jpg"/>
    <id>tag:ex.test,2026:1</id>
    <published>2026-10-29T18:00:00Z</published>
    <updated>2026-10-29T19:00:00Z</updated>
    <author><name>Sarah Druhan</name></author>
    <category term="Gaming"/>
    <summary>Short summary</summary>
    <content type="html">&lt;p&gt;Full &lt;em&gt;story&lt;/em&gt; text&lt;/p&gt;</content>
    <media:thumbnail url="https://img.test/thumb.jpg" width="640" height="360"/>
  </entry>
  <entry>
    <title>Second</title>
    <link href="https://ex.test/post/2"/>
    <id>tag:ex.test,2026:2</id>
    <updated>2026-10-29T17:00:00Z</updated>
    <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Inline <b>markup</b></p></div></content>
  </entry>
</feed>`;

test("an Atom feed's entries become RSS-shaped items", () => {
  const items = feedItems(ATOM);
  assert.equal(items.length, 2);
  assert.ok(items.every((i) => i.startsWith("<item>") && i.endsWith("</item>")));
});

test("the story's own address is the alternate link, never replies or self; a bare link is the fallback", () => {
  const [a, b] = feedItems(ATOM);
  assert.match(a, /<link>https:\/\/ex\.test\/post\/1<\/link>/);
  assert.doesNotMatch(a, /#comments/);
  assert.match(b, /<link>https:\/\/ex\.test\/post\/2<\/link>/);
});

test("text, date, author, category, enclosure and media tags carry over", () => {
  const [a] = feedItems(ATOM);
  assert.match(a, /<pubDate>2026-10-29T18:00:00Z<\/pubDate>/); // published wins over updated
  assert.match(a, /<dc:creator>Sarah Druhan<\/dc:creator>/);
  assert.match(a, /<category>Gaming<\/category>/);
  assert.match(a, /<enclosure url="https:\/\/img\.test\/1\.jpg" type="image\/jpeg" \/>/);
  assert.match(a, /<media:thumbnail url="https:\/\/img\.test\/thumb\.jpg"/);
  assert.match(a, /<content:encoded><!\[CDATA\[<p>Full <em>story<\/em> text<\/p>\]\]><\/content:encoded>/);
  assert.match(a, /<description><!\[CDATA\[Short summary\]\]><\/description>/);
});

test("an html title is unescaped once, and xhtml content keeps its markup; a missing date falls back to updated", () => {
  const [a, b] = feedItems(ATOM);
  assert.match(a, /<title><!\[CDATA\[Kotaku &amp; friends: <b>big<\/b> news\]\]><\/title>/);
  assert.match(b, /<content:encoded><!\[CDATA\[<p>Inline <b>markup<\/b><\/p>\]\]><\/content:encoded>/);
  assert.match(b, /<pubDate>2026-10-29T17:00:00Z<\/pubDate>/);
});

test("RSS passes through unchanged, including items with attributes, and junk gives nothing", () => {
  const rss = `<rss><channel><item><title>A</title><link>https://a.test/1</link></item><item rdf:about="x"><title>B</title></item></channel></rss>`;
  assert.equal(feedItems(rss).length, 2);
  assert.equal(feedItems("<html>nope</html>").length, 0);
  assert.equal(feedItems(null).length, 0);
});

test("a CDATA end marker inside an entry cannot break out of its wrapper", () => {
  const [a] = feedItems(`<feed><entry><title>x</title><link href="https://a.test/1"/><summary type="text">a ]]> b</summary></entry></feed>`);
  assert.equal((a.match(/<!\[CDATA\[/g) || []).length, (a.match(/\]\]>/g) || []).length);
});
