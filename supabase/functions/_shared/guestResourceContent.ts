import { HttpError } from "./workspaceAuth.ts";

export const MAX_GUEST_RESOURCE_CONTENT_LENGTH = 100_000;

const CANONICAL_RESOURCE_CONTENT =
  /^<(?:p|h[1-6]|ul|ol|blockquote|pre|hr)(?:\s|>)/i;

const NUMERIC_CHARACTER_REFERENCE =
  /&#(?:x([0-9a-f]+)(?:;|(?![0-9a-f]))|([0-9]+)(?:;|(?![0-9])))/gi;

const LEGACY_INVISIBLE_NAMED_CHARACTER_REFERENCE =
  /&(?:nbsp|shy)(?:;|(?=[^0-9a-z=]|$))/g;
const INVISIBLE_NAMED_CHARACTER_REFERENCE =
  /&(?:af|ApplyFunction|emsp13|emsp14|emsp|ensp|hairsp|ic|InvisibleComma|InvisibleTimes|it|lrm|MediumSpace|NegativeMediumSpace|NegativeThickSpace|NegativeThinSpace|NegativeVeryThinSpace|NewLine|NoBreak|NonBreakingSpace|numsp|puncsp|rlm|Tab|ThickSpace|thinsp|ThinSpace|VeryThinSpace|ZeroWidthSpace|zwj|zwnj);/g;

const HTML_NUMERIC_CHARACTER_REFERENCE_REPLACEMENTS: Readonly<Record<number, number>> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

const REMOVED_CONTENT_CONTAINERS = new Set([
  "annotation-xml",
  "audio",
  "desc",
  "foreignobject",
  "frameset",
  "iframe",
  "math",
  "mi",
  "mn",
  "mo",
  "ms",
  "mtext",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "selectedcontent",
  "style",
  "svg",
  "template",
  "title",
  "video",
  "xmp",
]);
const FORBIDDEN_MARKUP_TOKEN =
  /<!--|<(?:annotation-xml|audio|desc|foreignobject|frameset|iframe|math|mi|mn|mo|ms|mtext|noembed|noframes|noscript|plaintext|script|selectedcontent|style|svg|template|title|video|xmp)(?=[\s/>])/i;

function markupEnd(value: string, start: number): number {
  let quote: '"' | "'" | null = null;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }

  return -1;
}

function potentiallyVisibleGuestResourceText(value: string): string {
  if (FORBIDDEN_MARKUP_TOKEN.test(value)) return "";

  const output: string[] = [];

  for (let index = 0; index < value.length;) {
    if (value.startsWith("<!--", index)) {
      return "";
    }

    if (value[index] !== "<") {
      output.push(value[index]);
      index += 1;
      continue;
    }

    const end = markupEnd(value, index);
    if (end < 0) break;

    const markup = value.slice(index, end + 1);
    const tag = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\t\n\f\r />])/i.exec(markup);
    if (tag && tag[1] !== "/") {
      const name = tag[2].toLowerCase();
      if (REMOVED_CONTENT_CONTAINERS.has(name)) return "";
    }

    index = end + 1;
  }

  return output.join("");
}

function decodeNumericCharacterReference(
  reference: string,
  hexadecimal: string | undefined,
  decimal: string | undefined,
): string {
  const codePoint = Number.parseInt(
    hexadecimal ?? decimal ?? "",
    hexadecimal ? 16 : 10,
  );
  if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return reference;
  }
  if (codePoint === 0 || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return "\ufffd";
  }

  try {
    return String.fromCodePoint(
      HTML_NUMERIC_CHARACTER_REFERENCE_REPLACEMENTS[codePoint] ?? codePoint,
    );
  } catch {
    return reference;
  }
}

export function guestResourceCharacterLength(value: string): number {
  return Array.from(value).length;
}

export function isCanonicalGuestResourceContent(
  value: unknown,
): value is string {
  return typeof value === "string" &&
    guestResourceCharacterLength(value) > 0 &&
    guestResourceCharacterLength(value) <= MAX_GUEST_RESOURCE_CONTENT_LENGTH &&
    CANONICAL_RESOURCE_CONTENT.test(value) &&
    value.endsWith(">");
}

export function hasMeaningfulGuestResourceContent(
  value: string | null | undefined,
): boolean {
  if (!value) return false;

  return potentiallyVisibleGuestResourceText(value)
    .replace(LEGACY_INVISIBLE_NAMED_CHARACTER_REFERENCE, " ")
    .replace(INVISIBLE_NAMED_CHARACTER_REFERENCE, " ")
    .replace(NUMERIC_CHARACTER_REFERENCE, decodeNumericCharacterReference)
    .replace(
      /[\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu,
      "",
    )
    .replace(/\u2800/g, "")
    .length > 0;
}

export function optionalCanonicalGuestResourceContent(
  value: unknown,
  field = "content",
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "INVALID_FIELD", `${field} must be a string`);
  }

  const normalized = value.trim();
  if (!normalized) return null;
  if (guestResourceCharacterLength(normalized) > MAX_GUEST_RESOURCE_CONTENT_LENGTH) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must be 100000 characters or fewer`,
    );
  }
  if (!isCanonicalGuestResourceContent(normalized)) {
    throw new HttpError(
      400,
      "INVALID_FIELD",
      `${field} must be block-formatted HTML from the resource editor`,
    );
  }
  return normalized;
}
