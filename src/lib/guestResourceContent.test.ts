import { describe, expect, it } from 'vitest'
import {
  hasMeaningfulGuestResourceContent,
  isCanonicalGuestResourceContent,
  normalizeGuestResourceContent,
} from '@/lib/guestResourceContent'

describe('guest resource content contract', () => {
  it('accepts canonical editor HTML and rejects ambiguous plain text', () => {
    expect(isCanonicalGuestResourceContent('<p>Prepare carefully.</p>')).toBe(true)
    expect(isCanonicalGuestResourceContent('Prepare carefully.')).toBe(false)
    expect(() => normalizeGuestResourceContent('Prepare carefully.')).toThrow(
      'Content must be formatted with the resource editor.',
    )
  })

  it.each([
    null,
    undefined,
    '',
    '<p></p>',
    '<p><br></p>',
    '<p>&nbsp;</p>',
    '<p>&#8203;</p>',
    '<p>&#xFEFF;</p>',
    '<p>&#32;&#x20;&#9;&Tab;&NewLine;</p>',
    '<p>&#5760;&#x200A;&#8205;&#x202F;&#65279;</p>',
    '<p>&#32&#x20&Tab;&NewLine;</p>',
    '<p>&ZeroWidthSpace;&zwnj;&zwj;&NoBreak;&InvisibleTimes;&InvisibleComma;</p>',
    '<p>&NonBreakingSpace;</p>',
    '<p>&shy;&lrm;&rlm;&ApplyFunction;&NegativeThinSpace;</p>',
    `<p>${String.fromCodePoint(0x00ad, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064)}</p>`,
    '<p>&#173;&#xAD;&#8288;&#8289;&#8290;&#8291;&#8292;</p>',
    '<p>&#x061C;&#x180E;&#x202A;&#x2069;</p>',
    '<p>&#65024;&#xFE0F;&#847;&#xE0100;</p>',
    '<p>&#x2800;</p>',
    '<p title=">"> </p>',
    '<p title=">Visible</p>',
    '<p><!-- > still a comment --> </p>',
    '<p><script>not portal copy</script></p>',
    '<p><style>not portal copy</style></p>',
    '<p><template>not portal copy</template></p>',
    '<p><svg><text>not portal copy</text></svg></p>',
    '<p><annotation-xml>not portal copy</annotation-xml></p>',
    '<p><desc>not portal copy</desc></p>',
    '<p><foreignobject>not portal copy</foreignobject></p>',
    '<p><mi>not portal copy</mi><mn>1</mn><mo>+</mo><ms>x</ms><mtext>y</mtext></p>',
    '<p><selectedcontent>not portal copy</selectedcontent></p>',
    '<p><svg><text data-x="</svg>">not portal copy</text></svg></p>',
    '<p><svg/\u00A0>not portal copy</p>',
    '<p><svg/ >not portal copy</p>',
    '<p><svg foo=bar/>not portal copy</p>',
    '<p><svg/>Visible copy</p>',
    '<p><script/>not portal copy</script></p>',
    '<p><script>hidden</script_foo>fake-visible</p>',
    '<p><script>hidden< /script>fake-visible</p>',
    '<p><frameset>hidden</frameset>fake-visible</p>',
    '<p><plaintext/>hidden</plaintext>fake-visible</p>',
    '<p><script>not portal copy</p>',
    '<p><script>hidden</script>Visible copy</p>',
    '<p><svg>hidden</svg>Visible copy</p>',
    '<p><script>hidden</script>Visible copy<script>hidden</script></p>',
    '<p><!-- hidden -->Visible copy</p>',
    '<p title="<script>">Visible copy</p>',
    '<p title="<!--">Visible copy</p>',
    '<p>\u200B</p>',
  ])(
    'treats visually empty content as not meaningful: %s',
    (value) => {
      expect(hasMeaningfulGuestResourceContent(value)).toBe(false)
    },
  )

  it('recognizes visible client-facing copy', () => {
    expect(hasMeaningfulGuestResourceContent('<h2>Prepare</h2><p>Bring notes.</p>')).toBe(true)
    expect(hasMeaningfulGuestResourceContent('<p>&#65;&#x5A;&#90;</p>')).toBe(true)
    expect(hasMeaningfulGuestResourceContent('<p title=">">Visible copy</p>')).toBe(true)
    expect(hasMeaningfulGuestResourceContent('<p>&NBSP;&Tab&tab;&NewLine</p>')).toBe(true)
    expect(hasMeaningfulGuestResourceContent('<p>&#0;&#128;&#130;</p>')).toBe(true)
  })

  it('counts Unicode code points consistently with PostgreSQL char_length', () => {
    expect(isCanonicalGuestResourceContent(`<p>${'😀'.repeat(99_993)}</p>`)).toBe(true)
    expect(isCanonicalGuestResourceContent(`<p>${'😀'.repeat(99_994)}</p>`)).toBe(false)
  })
})
