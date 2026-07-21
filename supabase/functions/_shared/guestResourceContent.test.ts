import {
  hasMeaningfulGuestResourceContent,
  isCanonicalGuestResourceContent,
  optionalCanonicalGuestResourceContent,
} from "./guestResourceContent.ts";

Deno.test("guest resource content accepts editor HTML and normalizes blanks", () => {
  if (optionalCanonicalGuestResourceContent("   ") !== null) {
    throw new Error("blank content must normalize to null");
  }
  const html = "  <h2>Prepare</h2><p>Bring notes.</p>  ";
  if (
    optionalCanonicalGuestResourceContent(html) !==
      "<h2>Prepare</h2><p>Bring notes.</p>"
  ) {
    throw new Error("canonical editor HTML was not normalized");
  }
});

Deno.test("guest resource content rejects Markdown and incomplete HTML", () => {
  for (const value of ["# Prepare", "Plain text", "<p>Unclosed"] as const) {
    let rejected = false;
    try {
      optionalCanonicalGuestResourceContent(value);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`expected content to be rejected: ${value}`);
  }
});

Deno.test("guest resource response marker rejects inline-only roots", () => {
  if (isCanonicalGuestResourceContent("<strong>Inline only</strong>")) {
    throw new Error("inline-only content must not satisfy the stored contract");
  }
});

Deno.test("published article content must contain visible text", () => {
  for (
    const value of [
      null,
      "<p></p>",
      "<p><br></p>",
      "<p>&nbsp;</p>",
      "<p>&#8203;</p>",
      "<p>&#xFEFF;</p>",
      "<p>&#32;&#x20;&#9;&Tab;&NewLine;</p>",
      "<p>&#5760;&#x200A;&#8205;&#x202F;&#65279;</p>",
      "<p>&#32&#x20&Tab;&NewLine;</p>",
      "<p>&ZeroWidthSpace;&zwnj;&zwj;&NoBreak;&InvisibleTimes;&InvisibleComma;</p>",
      "<p>&NonBreakingSpace;</p>",
      "<p>&shy;&lrm;&rlm;&ApplyFunction;&NegativeThinSpace;</p>",
      `<p>${String.fromCodePoint(0x00ad, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064)}</p>`,
      "<p>&#173;&#xAD;&#8288;&#8289;&#8290;&#8291;&#8292;</p>",
      "<p>&#x061C;&#x180E;&#x202A;&#x2069;</p>",
      "<p>&#65024;&#xFE0F;&#847;&#xE0100;</p>",
      "<p>&#x2800;</p>",
      '<p title=">"> </p>',
      '<p title=">Visible</p>',
      "<p><!-- > still a comment --> </p>",
      "<p><script>not portal copy</script></p>",
      "<p><style>not portal copy</style></p>",
      "<p><template>not portal copy</template></p>",
      "<p><svg><text>not portal copy</text></svg></p>",
      "<p><annotation-xml>not portal copy</annotation-xml></p>",
      "<p><desc>not portal copy</desc></p>",
      "<p><foreignobject>not portal copy</foreignobject></p>",
      "<p><mi>not portal copy</mi><mn>1</mn><mo>+</mo><ms>x</ms><mtext>y</mtext></p>",
      "<p><selectedcontent>not portal copy</selectedcontent></p>",
      '<p><svg><text data-x="</svg>">not portal copy</text></svg></p>',
      "<p><svg/\u00A0>not portal copy</p>",
      "<p><svg/ >not portal copy</p>",
      "<p><svg foo=bar/>not portal copy</p>",
      "<p><svg/>Visible copy</p>",
      "<p><script/>not portal copy</script></p>",
      "<p><script>hidden</script_foo>fake-visible</p>",
      "<p><script>hidden< /script>fake-visible</p>",
      "<p><frameset>hidden</frameset>fake-visible</p>",
      "<p><plaintext/>hidden</plaintext>fake-visible</p>",
      "<p><script>not portal copy</p>",
      "<p><script>hidden</script>Visible copy</p>",
      "<p><svg>hidden</svg>Visible copy</p>",
      "<p><script>hidden</script>Visible copy<script>hidden</script></p>",
      "<p><!-- hidden -->Visible copy</p>",
      '<p title="<script>">Visible copy</p>',
      '<p title="<!--">Visible copy</p>',
    ]
  ) {
    if (hasMeaningfulGuestResourceContent(value)) {
      throw new Error(`visually empty content was accepted: ${value}`);
    }
  }
  if (!hasMeaningfulGuestResourceContent("<p>Prepare carefully.</p>")) {
    throw new Error("visible article copy was rejected");
  }
  if (!hasMeaningfulGuestResourceContent("<p>&#65;&#x5A;&#90;</p>")) {
    throw new Error("visible character references were rejected");
  }
  if (!hasMeaningfulGuestResourceContent('<p title=">">Visible copy</p>')) {
    throw new Error("visible copy after a quoted attribute was rejected");
  }
  for (
    const value of [
      "<p>&NBSP;&Tab&tab;&NewLine</p>",
      "<p>&#0;&#128;&#130;</p>",
    ]
  ) {
    if (!hasMeaningfulGuestResourceContent(value)) {
      throw new Error(`visible browser copy was rejected: ${value}`);
    }
  }
});

Deno.test("resource length uses Unicode code points like PostgreSQL", () => {
  if (!isCanonicalGuestResourceContent(`<p>${"😀".repeat(99_993)}</p>`)) {
    throw new Error("100000 Unicode code points must be accepted");
  }
  if (isCanonicalGuestResourceContent(`<p>${"😀".repeat(99_994)}</p>`)) {
    throw new Error("100001 Unicode code points must be rejected");
  }
});
