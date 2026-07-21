-- Workspace-owned guest resources. The existing guest_resources table remains
-- the platform/public template catalog; private workspaces receive independent
-- snapshots which never live-sync back to their source template.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:workspace-guest-resources:v1', 0)
);

-- Provisioning inserts workspaces before the seed trigger below exists. Hold
-- the parent catalog against concurrent INSERT/UPDATE/DELETE for the complete
-- cutover so every pre-cutover workspace is present in the counter snapshot
-- and backfill, while every post-cutover workspace necessarily fires the
-- installed seed trigger.
LOCK TABLE public.workspaces IN SHARE ROW EXCLUSIVE MODE;

-- The client-transfer revocation trigger is strengthened later in this same
-- transaction. Prevent a workspace_id change from committing under the old
-- trigger and carrying a credential/session into the destination workspace.
-- This also stabilizes the composite client ownership key while assignment
-- foreign keys are installed.
LOCK TABLE public.clients IN SHARE ROW EXCLUSIVE MODE;

-- The legacy catalog remains the default-workspace portal source and is also
-- the seed input for every private workspace. Normalize only values whose
-- existing runtime meaning is already null/default, then fail before creating
-- tenant objects if any template would violate the shared response contract.
-- Fresh historical databases contain Markdown while the live catalog already
-- contains HTML. This temporary converter escapes every source character
-- before adding a deliberately small set of block/inline tags.
CREATE OR REPLACE FUNCTION public.workspace_guest_resource_markdown_to_html(
  p_markdown TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  source_line TEXT;
  trimmed_line TEXT;
  inline_html TEXT;
  result_html TEXT := '';
  block_kind TEXT;
  capture TEXT[];
  heading_level INTEGER;
BEGIN
  FOREACH source_line IN ARRAY regexp_split_to_array(
    replace(replace(p_markdown, E'\r\n', E'\n'), E'\r', E'\n'),
    E'\n'
  )
  LOOP
    trimmed_line := btrim(source_line);

    IF block_kind = 'pre' THEN
      IF trimmed_line ~ '^```' THEN
        result_html := result_html || '</code></pre>';
        block_kind := NULL;
      ELSE
        result_html := result_html
          || replace(
            replace(replace(source_line, '&', '&amp;'), '<', '&lt;'),
            '>',
            '&gt;'
          )
          || E'\n';
      END IF;
      CONTINUE;
    END IF;

    IF trimmed_line ~ '^```' THEN
      IF block_kind IS NOT NULL THEN
        result_html := result_html || CASE block_kind
          WHEN 'p' THEN '</p>'
          WHEN 'ul' THEN '</ul>'
          WHEN 'ol' THEN '</ol>'
          ELSE ''
        END;
      END IF;
      result_html := result_html || '<pre><code>';
      block_kind := 'pre';
      CONTINUE;
    END IF;

    IF trimmed_line = '' THEN
      IF block_kind IS NOT NULL THEN
        result_html := result_html || CASE block_kind
          WHEN 'p' THEN '</p>'
          WHEN 'ul' THEN '</ul>'
          WHEN 'ol' THEN '</ol>'
          ELSE ''
        END;
        block_kind := NULL;
      END IF;
      CONTINUE;
    END IF;

    capture := regexp_match(trimmed_line, '^(#{1,6})[[:space:]]+(.+)$');
    IF capture IS NOT NULL THEN
      IF block_kind IS NOT NULL THEN
        result_html := result_html || CASE block_kind
          WHEN 'p' THEN '</p>'
          WHEN 'ul' THEN '</ul>'
          WHEN 'ol' THEN '</ol>'
          ELSE ''
        END;
        block_kind := NULL;
      END IF;
      heading_level := char_length(capture[1]);
      inline_html := replace(
        replace(replace(capture[2], '&', '&amp;'), '<', '&lt;'),
        '>',
        '&gt;'
      );
      inline_html := regexp_replace(
        inline_html,
        '`([^`]+)`',
        '<code>\1</code>',
        'g'
      );
      inline_html := regexp_replace(
        inline_html,
        '\*\*([^*]+)\*\*',
        '<strong>\1</strong>',
        'g'
      );
      inline_html := regexp_replace(
        inline_html,
        '__([^_]+)__',
        '<strong>\1</strong>',
        'g'
      );
      result_html := result_html
        || '<h' || heading_level || '>'
        || inline_html
        || '</h' || heading_level || '>';
      CONTINUE;
    END IF;

    IF trimmed_line IN ('---', '***', '___') THEN
      IF block_kind IS NOT NULL THEN
        result_html := result_html || CASE block_kind
          WHEN 'p' THEN '</p>'
          WHEN 'ul' THEN '</ul>'
          WHEN 'ol' THEN '</ol>'
          ELSE ''
        END;
        block_kind := NULL;
      END IF;
      result_html := result_html || '<hr>';
      CONTINUE;
    END IF;

    capture := regexp_match(trimmed_line, '^[-*+][[:space:]]+(.+)$');
    IF capture IS NOT NULL THEN
      IF block_kind IS DISTINCT FROM 'ul' THEN
        IF block_kind IS NOT NULL THEN
          result_html := result_html || CASE block_kind
            WHEN 'p' THEN '</p>'
            WHEN 'ol' THEN '</ol>'
            ELSE ''
          END;
        END IF;
        result_html := result_html || '<ul>';
        block_kind := 'ul';
      END IF;
      inline_html := replace(
        replace(replace(capture[1], '&', '&amp;'), '<', '&lt;'),
        '>',
        '&gt;'
      );
      inline_html := regexp_replace(inline_html, '`([^`]+)`', '<code>\1</code>', 'g');
      inline_html := regexp_replace(inline_html, '\*\*([^*]+)\*\*', '<strong>\1</strong>', 'g');
      inline_html := regexp_replace(inline_html, '__([^_]+)__', '<strong>\1</strong>', 'g');
      result_html := result_html || '<li>' || inline_html || '</li>';
      CONTINUE;
    END IF;

    capture := regexp_match(trimmed_line, '^[0-9]+\.[[:space:]]+(.+)$');
    IF capture IS NOT NULL THEN
      IF block_kind IS DISTINCT FROM 'ol' THEN
        IF block_kind IS NOT NULL THEN
          result_html := result_html || CASE block_kind
            WHEN 'p' THEN '</p>'
            WHEN 'ul' THEN '</ul>'
            ELSE ''
          END;
        END IF;
        result_html := result_html || '<ol>';
        block_kind := 'ol';
      END IF;
      inline_html := replace(
        replace(replace(capture[1], '&', '&amp;'), '<', '&lt;'),
        '>',
        '&gt;'
      );
      inline_html := regexp_replace(inline_html, '`([^`]+)`', '<code>\1</code>', 'g');
      inline_html := regexp_replace(inline_html, '\*\*([^*]+)\*\*', '<strong>\1</strong>', 'g');
      inline_html := regexp_replace(inline_html, '__([^_]+)__', '<strong>\1</strong>', 'g');
      result_html := result_html || '<li>' || inline_html || '</li>';
      CONTINUE;
    END IF;

    capture := regexp_match(trimmed_line, '^>[[:space:]]?(.*)$');
    IF capture IS NOT NULL THEN
      IF block_kind IS NOT NULL THEN
        result_html := result_html || CASE block_kind
          WHEN 'p' THEN '</p>'
          WHEN 'ul' THEN '</ul>'
          WHEN 'ol' THEN '</ol>'
          ELSE ''
        END;
        block_kind := NULL;
      END IF;
      inline_html := replace(
        replace(replace(capture[1], '&', '&amp;'), '<', '&lt;'),
        '>',
        '&gt;'
      );
      inline_html := regexp_replace(inline_html, '`([^`]+)`', '<code>\1</code>', 'g');
      inline_html := regexp_replace(inline_html, '\*\*([^*]+)\*\*', '<strong>\1</strong>', 'g');
      inline_html := regexp_replace(inline_html, '__([^_]+)__', '<strong>\1</strong>', 'g');
      result_html := result_html
        || '<blockquote><p>' || inline_html || '</p></blockquote>';
      CONTINUE;
    END IF;

    IF block_kind IS DISTINCT FROM 'p' THEN
      IF block_kind IS NOT NULL THEN
        result_html := result_html || CASE block_kind
          WHEN 'ul' THEN '</ul>'
          WHEN 'ol' THEN '</ol>'
          ELSE ''
        END;
      END IF;
      result_html := result_html || '<p>';
      block_kind := 'p';
    ELSE
      result_html := result_html || '<br>';
    END IF;

    inline_html := replace(
      replace(replace(trimmed_line, '&', '&amp;'), '<', '&lt;'),
      '>',
      '&gt;'
    );
    inline_html := regexp_replace(inline_html, '`([^`]+)`', '<code>\1</code>', 'g');
    inline_html := regexp_replace(inline_html, '\*\*([^*]+)\*\*', '<strong>\1</strong>', 'g');
    inline_html := regexp_replace(inline_html, '__([^_]+)__', '<strong>\1</strong>', 'g');
    result_html := result_html || inline_html;
  END LOOP;

  IF block_kind IS NOT NULL THEN
    result_html := result_html || CASE block_kind
      WHEN 'p' THEN '</p>'
      WHEN 'ul' THEN '</ul>'
      WHEN 'ol' THEN '</ol>'
      WHEN 'pre' THEN '</code></pre>'
      ELSE ''
    END;
  END IF;

  RETURN NULLIF(result_html, '');
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_guest_resource_markdown_to_html(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;

UPDATE public.guest_resources
SET content = NULL
WHERE content IS NOT NULL
  AND NULLIF(btrim(content), '') IS NULL;

UPDATE public.guest_resources
SET content = btrim(content)
WHERE content IS NOT NULL
  AND content <> btrim(content);

UPDATE public.guest_resources
SET content = public.workspace_guest_resource_markdown_to_html(content)
WHERE content IS NOT NULL
  AND content !~* '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])';

DROP FUNCTION public.workspace_guest_resource_markdown_to_html(TEXT);

-- A canonical HTML shell is not sufficient for an article: `<p><br></p>`,
-- control/format characters, and sanitizer-dropped markup can render as
-- empty. The editor never emits comments or forbidden containers, so SQL
-- deliberately fails closed for any such start token instead of approximating
-- an HTML parser with regular expressions. Keep one immutable definition for
-- constraints, mutation validation, cloning, and defensive portal filtering.
CREATE OR REPLACE FUNCTION public.guest_resource_content_has_meaningful_text(
  p_content TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH forbidden_markup_detected AS (
    SELECT p_content ~* (
      '<!--|<(script|style|template|svg|math|iframe|audio|video|noscript|noembed|noframes|xmp|plaintext|title|frameset|annotation-xml|desc|foreignobject|mi|mn|mo|ms|mtext|selectedcontent)([[:space:]/>'
        || chr(160) || chr(5760)
        || chr(8192) || chr(8193) || chr(8194) || chr(8195)
        || chr(8196) || chr(8197) || chr(8198) || chr(8199)
        || chr(8200) || chr(8201) || chr(8202)
        || chr(8232) || chr(8233) || chr(8239) || chr(8287)
        || chr(12288) || chr(65279) || '])'
    )
      AS value
  ), legacy_named_whitespace_removed AS (
    SELECT regexp_replace(
      p_content,
      '&(nbsp|shy)(;|$|(?=[^[:alnum:]=]))',
      ' ',
      'g'
    ) AS value
  ), exact_named_whitespace_removed AS (
    SELECT regexp_replace(
      value,
      '&(Tab|NewLine|ZeroWidthSpace|zwnj|zwj|NoBreak|ApplyFunction|af|InvisibleTimes|it|InvisibleComma|ic|lrm|rlm|ensp|emsp|emsp13|emsp14|numsp|puncsp|thinsp|ThinSpace|hairsp|VeryThinSpace|MediumSpace|ThickSpace|NegativeMediumSpace|NegativeThickSpace|NegativeThinSpace|NegativeVeryThinSpace|NonBreakingSpace);',
      ' ',
      'g'
    ) AS value
    FROM legacy_named_whitespace_removed
  ), decimal_whitespace_removed AS (
    SELECT regexp_replace(
      value,
      '&#0*([1-9]|[12][0-9]|3[0-2]|127|129|141|143|144|157|160|173|847|153[6-9]|154[01]|1564|1757|1807|219[23]|2274|444[78]|5760|606[89]|615[5-9]|819[2-9]|820[0-7]|823[2-9]|8287|828[89]|829[0-9]|830[0-3]|10240|12288|12644|650(2[4-9]|3[0-9])|65279|65440|655(2[0-9]|3[01])|69821|69837|7889[6-9]|789(0[0-9]|1[01])|11382[4-7]|119(15[5-9]|16[0-2])|917(50[4-9]|5[1-9][0-9]|[6-9][0-9]{2})|91[89][0-9]{3}|920[0-9]{3}|921[0-5][0-9]{2})(;|$|(?=[^0-9]))',
      ' ',
      'g'
    ) AS value
    FROM exact_named_whitespace_removed
  ), hexadecimal_whitespace_removed AS (
    SELECT regexp_replace(
      value,
      '&#x0*([1-9a-f]|1[0-9a-f]|20|7f|81|8d|8f|90|9d|a0|ad|34f|60[0-5]|61c|6dd|70f|89[01]|8e2|115f|1160|1680|17b[45]|180[b-f]|200[0-9a-f]|202[89a-f]|205f|206[0-9a-f]|2800|3000|3164|fe0[0-9a-f]|feff|ffa0|fff[0-9a-b]|110bd|110cd|1343[0-9a-f]|1bca[0-3]|1d17[3-9a]|e0[0-9a-f]{3})(;|$|(?=[^0-9a-f]))',
      ' ',
      'gi'
    ) AS value
    FROM decimal_whitespace_removed
  ), actual_whitespace_removed AS (
    SELECT regexp_replace(
      translate(
        value,
        chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
          || chr(160) || chr(173) || chr(5760)
          || chr(8192) || chr(8193) || chr(8194) || chr(8195)
          || chr(8196) || chr(8197) || chr(8198) || chr(8199)
          || chr(8200) || chr(8201) || chr(8202)
          || chr(8203) || chr(8204) || chr(8205)
          || chr(8206) || chr(8207)
          || chr(8232) || chr(8233) || chr(8239) || chr(8287)
          || chr(8288) || chr(8289) || chr(8290) || chr(8291)
          || chr(8292) || chr(12288) || chr(65279),
        repeat(' ', 36)
      ) COLLATE "C",
      '[' || chr(1) || '-' || chr(8)
        || chr(14) || '-' || chr(31)
        || chr(127) || '-' || chr(159)
        || chr(847)
        || chr(1536) || '-' || chr(1541)
        || chr(1564) || chr(1757) || chr(1807)
        || chr(2192) || '-' || chr(2193) || chr(2274)
        || chr(4447) || '-' || chr(4448)
        || chr(6068) || '-' || chr(6069)
        || chr(6155) || '-' || chr(6159)
        || chr(8234) || '-' || chr(8238)
        || chr(8293) || '-' || chr(8303)
        || chr(10240)
        || chr(12644)
        || chr(65024) || '-' || chr(65039)
        || chr(65440)
        || chr(65520) || '-' || chr(65531)
        || chr(69821) || chr(69837)
        || chr(78896) || '-' || chr(78911)
        || chr(113824) || '-' || chr(113827)
        || chr(119155) || '-' || chr(119162)
        || chr(917504) || '-' || chr(921599) || ']',
      ' ',
      'g'
    ) AS value
    FROM hexadecimal_whitespace_removed
  ), tags_removed AS (
    SELECT regexp_replace(
      value,
      '<([^<>"'']|"[^"]*"|''[^'']*'')*>',
      ' ',
      'g'
    ) AS value
    FROM actual_whitespace_removed
  )
  SELECT NOT forbidden_markup_detected.value
    AND strpos(tags_removed.value, '<') = 0
    AND NULLIF(regexp_replace(tags_removed.value, '[[:space:]]+', '', 'g'), '')
      IS NOT NULL
  FROM tags_removed
  CROSS JOIN forbidden_markup_detected
$$;

REVOKE ALL ON FUNCTION public.guest_resource_content_has_meaningful_text(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guest_resource_content_has_meaningful_text(TEXT)
  TO authenticated, service_role;

-- JavaScript String.trim() recognizes more boundary whitespace than btrim().
-- Keep persisted titles/descriptions in the same normalized, nonempty subset
-- that browser and Edge DTOs accept. The explicit code-point list is the
-- ECMAScript WhiteSpace + LineTerminator set (including NBSP and BOM/FEFF).
CREATE OR REPLACE FUNCTION public.guest_resource_text_is_normalized_nonempty(
  p_value TEXT,
  p_max_length INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH normalized AS (
    SELECT btrim(
      p_value,
      chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(32)
        || chr(160) || chr(5760)
        || chr(8192) || chr(8193) || chr(8194) || chr(8195)
        || chr(8196) || chr(8197) || chr(8198) || chr(8199)
        || chr(8200) || chr(8201) || chr(8202)
        || chr(8232) || chr(8233) || chr(8239) || chr(8287)
        || chr(12288) || chr(65279)
    ) AS value
  )
  SELECT p_max_length BETWEEN 1 AND 100000
    AND char_length(p_value) BETWEEN 1 AND p_max_length
    AND normalized.value <> ''
    AND normalized.value = p_value
  FROM normalized
$$;

REVOKE ALL ON FUNCTION public.guest_resource_text_is_normalized_nonempty(
  TEXT,
  INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guest_resource_text_is_normalized_nonempty(
  TEXT,
  INTEGER
) TO authenticated, service_role;

-- Keep database URL acceptance inside the same safe subset consumed by the
-- browser and Edge DTOs. PostgreSQL has no WHATWG URL parser, so validate a
-- strict HTTP(S) authority: no credentials, a DNS/IPv4/IPv6 host, and an
-- optional numeric port in range. Path/query/fragment text must remain free of
-- whitespace and control characters.
CREATE OR REPLACE FUNCTION public.guest_resource_http_url_is_safe(
  p_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  authority TEXT;
  host_name TEXT;
  port_text TEXT;
  parsed_address INET;
BEGIN
  IF char_length(p_url) NOT BETWEEN 1 AND 2048
    OR p_url !~* '^https?://[^[:space:][:cntrl:]]+$'
  THEN
    RETURN false;
  END IF;

  authority := substring(
    p_url FROM '^[Hh][Tt][Tt][Pp][Ss]?://([^/?#]*)'
  );
  IF NULLIF(authority, '') IS NULL OR strpos(authority, '@') > 0 THEN
    RETURN false;
  END IF;

  IF left(authority, 1) = '[' THEN
    IF authority !~ '^\[([0-9A-Fa-f:.]+)\](:([0-9]{1,5}))?$' THEN
      RETURN false;
    END IF;

    host_name := substring(authority FROM '^\[([0-9A-Fa-f:.]+)\]');
    port_text := substring(authority FROM '\]:([0-9]{1,5})$');
    BEGIN
      parsed_address := host_name::INET;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN false;
    END;
    IF family(parsed_address) <> 6 THEN
      RETURN false;
    END IF;
  ELSE
    IF authority !~ '^([^:]+)(:([0-9]{1,5}))?$' THEN
      RETURN false;
    END IF;

    host_name := split_part(authority, ':', 1);
    port_text := substring(authority FROM ':([0-9]{1,5})$');
    IF host_name ~ '^[0-9.]+$' THEN
      IF host_name !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}$' THEN
        RETURN false;
      END IF;
      BEGIN
        parsed_address := host_name::INET;
      EXCEPTION WHEN invalid_text_representation THEN
        RETURN false;
      END;
      IF family(parsed_address) <> 4 THEN
        RETURN false;
      END IF;
    ELSIF char_length(host_name) > 253
      OR host_name !~*
        '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.?$'
    THEN
      RETURN false;
    END IF;
  END IF;

  IF port_text IS NOT NULL AND port_text::INTEGER > 65535 THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.guest_resource_http_url_is_safe(TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.guest_resource_http_url_is_safe(TEXT)
  TO authenticated, service_role;

UPDATE public.guest_resources
SET title = btrim(title)
WHERE title <> btrim(title);

UPDATE public.guest_resources
SET description = btrim(description)
WHERE description <> btrim(description);

UPDATE public.guest_resources
SET url = NULL
WHERE url IS NOT NULL
  AND NULLIF(btrim(url), '') IS NULL;

UPDATE public.guest_resources
SET file_url = NULL
WHERE file_url IS NOT NULL
  AND NULLIF(btrim(file_url), '') IS NULL;

UPDATE public.guest_resources
SET featured = false
WHERE featured IS NULL;

UPDATE public.guest_resources
SET display_order = 0
WHERE display_order IS NULL;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.guest_resources) > 1000 THEN
    RAISE EXCEPTION 'global guest resource catalog exceeds the 1000-resource quota'
      USING ERRCODE = '23514';
  END IF;

  IF (
    SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)
    FROM public.guest_resources
  ) > 5000000 THEN
    RAISE EXCEPTION 'global guest resource catalog exceeds the 5000000-character content quota'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.guest_resources AS template
    WHERE NOT public.guest_resource_text_is_normalized_nonempty(
        template.title,
        200
      )
      OR NOT public.guest_resource_text_is_normalized_nonempty(
        template.description,
        2000
      )
      OR (
        template.content IS NOT NULL
        AND (
          template.content <> btrim(template.content)
          OR char_length(template.content) NOT BETWEEN 1 AND 100000
          OR template.content !~*
            '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])'
          OR right(template.content, 1) <> '>'
        )
      )
      OR template.featured IS NULL
      OR template.display_order IS NULL
      OR template.display_order NOT BETWEEN 0 AND 1000000
      OR template.created_at IS NULL
      OR template.updated_at IS NULL
      OR (
        template.type IN ('video', 'link')
        AND template.url IS NULL
      )
      OR (
        template.type = 'download'
        AND template.file_url IS NULL
      )
      OR (
        template.type = 'article'
        AND NOT COALESCE(
          public.guest_resource_content_has_meaningful_text(template.content),
          false
        )
      )
      OR (
        template.url IS NOT NULL
        AND NOT public.guest_resource_http_url_is_safe(template.url)
      )
      OR (
        template.file_url IS NOT NULL
        AND NOT public.guest_resource_http_url_is_safe(template.file_url)
      )
  ) THEN
    RAISE EXCEPTION 'guest resource template catalog violates the portal contract'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

ALTER TABLE public.guest_resources
  ALTER COLUMN featured SET DEFAULT false,
  ALTER COLUMN featured SET NOT NULL,
  ALTER COLUMN display_order SET DEFAULT 0,
  ALTER COLUMN display_order SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.guest_resources
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_title_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_description_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_content_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_article_content_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_url_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_file_url_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_display_order_check,
  DROP CONSTRAINT IF EXISTS guest_resources_workspace_catalog_action_target_check;

ALTER TABLE public.guest_resources
  ADD CONSTRAINT guest_resources_workspace_catalog_title_check CHECK (
    public.guest_resource_text_is_normalized_nonempty(title, 200)
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_description_check CHECK (
    public.guest_resource_text_is_normalized_nonempty(description, 2000)
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_content_check CHECK (
    content IS NULL OR (
      content = btrim(content)
      AND char_length(content) BETWEEN 1 AND 100000
      AND content ~*
        '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])'
      AND right(content, 1) = '>'
    )
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_article_content_check CHECK (
    type <> 'article'
    OR COALESCE(
      public.guest_resource_content_has_meaningful_text(content),
      false
    )
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_url_check CHECK (
    url IS NULL OR public.guest_resource_http_url_is_safe(url)
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_file_url_check CHECK (
    file_url IS NULL OR public.guest_resource_http_url_is_safe(file_url)
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_display_order_check CHECK (
    display_order BETWEEN 0 AND 1000000
  ) NOT VALID,
  ADD CONSTRAINT guest_resources_workspace_catalog_action_target_check CHECK (
    (type NOT IN ('video', 'link') OR url IS NOT NULL)
    AND (type <> 'download' OR file_url IS NOT NULL)
  ) NOT VALID;

ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_title_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_description_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_content_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_article_content_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_url_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_file_url_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_display_order_check;
ALTER TABLE public.guest_resources
  VALIDATE CONSTRAINT guest_resources_workspace_catalog_action_target_check;

-- One atomic counter row per workspace enforces the portal's 1,000-resource
-- availability contract without a count-then-insert race. The default
-- workspace row counts the global template catalog; private rows count their
-- independent workspace resources.
CREATE TABLE public.workspace_guest_resource_quota_counters (
  workspace_id UUID PRIMARY KEY
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  resource_count INTEGER NOT NULL DEFAULT 0,
  content_char_count BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT workspace_guest_resource_quota_count_check CHECK (
    resource_count BETWEEN 0 AND 1000
  ),
  CONSTRAINT workspace_guest_resource_quota_content_check CHECK (
    content_char_count BETWEEN 0 AND 5000000
  )
);

ALTER TABLE public.workspace_guest_resource_quota_counters
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_guest_resource_quota_counters
  FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES
  ON TABLE public.workspace_guest_resource_quota_counters
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.workspace_guest_resource_quota_counters (
  workspace_id,
  resource_count,
  content_char_count
)
SELECT
  workspace.id,
  CASE
    WHEN workspace.is_default
      THEN (SELECT count(*)::INTEGER FROM public.guest_resources)
    ELSE 0
  END,
  CASE
    WHEN workspace.is_default THEN (
      SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)::BIGINT
      FROM public.guest_resources
    )
    ELSE 0
  END
FROM public.workspaces AS workspace;

CREATE OR REPLACE FUNCTION public.adjust_global_guest_resource_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  default_workspace_id UUID;
  resource_delta INTEGER;
  content_delta BIGINT;
  adjusted_count INTEGER;
  adjusted_content_count BIGINT;
  current_count INTEGER;
  current_content_count BIGINT;
BEGIN
  SELECT workspace.id
  INTO default_workspace_id
  FROM public.workspaces AS workspace
  WHERE workspace.is_default;

  IF default_workspace_id IS NULL THEN
    RAISE EXCEPTION 'default workspace quota counter is unavailable'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    resource_delta := 1;
    content_delta := char_length(COALESCE(NEW.content, ''));
  ELSIF TG_OP = 'DELETE' THEN
    resource_delta := -1;
    content_delta := -char_length(COALESCE(OLD.content, ''));
  ELSE
    resource_delta := 0;
    content_delta :=
      char_length(COALESCE(NEW.content, ''))
      - char_length(COALESCE(OLD.content, ''));
  END IF;

  UPDATE public.workspace_guest_resource_quota_counters AS quota
  SET
    resource_count = quota.resource_count + resource_delta,
    content_char_count = quota.content_char_count + content_delta
  WHERE quota.workspace_id = default_workspace_id
    AND quota.resource_count + resource_delta BETWEEN 0 AND 1000
    AND quota.content_char_count + content_delta BETWEEN 0 AND 5000000
  RETURNING quota.resource_count, quota.content_char_count
  INTO adjusted_count, adjusted_content_count;

  IF NOT FOUND THEN
    SELECT quota.resource_count, quota.content_char_count
    INTO current_count, current_content_count
    FROM public.workspace_guest_resource_quota_counters AS quota
    WHERE quota.workspace_id = default_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'global guest resource quota counter is missing'
        USING ERRCODE = '23514';
    ELSIF current_count + resource_delta > 1000 THEN
      RAISE EXCEPTION 'global guest resource count quota of 1000 exceeded'
        USING ERRCODE = '23514';
    ELSIF current_content_count + content_delta > 5000000 THEN
      RAISE EXCEPTION 'global guest resource content quota of 5000000 characters exceeded'
        USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'global guest resource quota counter is inconsistent'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_global_guest_resource_quota()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guest_resources_adjust_workspace_quota
  ON public.guest_resources;
CREATE TRIGGER guest_resources_adjust_workspace_quota
  AFTER INSERT OR DELETE OR UPDATE OF content ON public.guest_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.adjust_global_guest_resource_quota();

-- Composite client ownership is referenced by assignment rows so a resource
-- can never be assigned to a client from another workspace.
CREATE UNIQUE INDEX IF NOT EXISTS clients_id_workspace_id_uidx
  ON public.clients (id, workspace_id);

CREATE TABLE public.workspace_guest_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT,
  category public.resource_category NOT NULL,
  type public.resource_type NOT NULL,
  url TEXT,
  file_url TEXT,
  featured BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  visibility TEXT NOT NULL DEFAULT 'all_clients',
  source_template_id UUID
    REFERENCES public.guest_resources(id) ON DELETE SET NULL,
  -- Preserve actor identifiers as durable audit values even if an Auth user
  -- is later removed during account revocation.
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_guest_resources_id_workspace_key
    UNIQUE (id, workspace_id),
  CONSTRAINT workspace_guest_resources_title_check CHECK (
    public.guest_resource_text_is_normalized_nonempty(title, 200)
  ),
  CONSTRAINT workspace_guest_resources_description_check CHECK (
    public.guest_resource_text_is_normalized_nonempty(description, 2000)
  ),
  CONSTRAINT workspace_guest_resources_content_check CHECK (
    content IS NULL OR (
      content = btrim(content)
      AND char_length(content) BETWEEN 1 AND 100000
      AND content ~*
        '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])'
      AND right(content, 1) = '>'
    )
  ),
  CONSTRAINT workspace_guest_resources_url_check CHECK (
    url IS NULL OR public.guest_resource_http_url_is_safe(url)
  ),
  CONSTRAINT workspace_guest_resources_file_url_check CHECK (
    file_url IS NULL OR public.guest_resource_http_url_is_safe(file_url)
  ),
  CONSTRAINT workspace_guest_resources_display_order_check CHECK (
    display_order BETWEEN 0 AND 1000000
  ),
  CONSTRAINT workspace_guest_resources_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT workspace_guest_resources_published_at_check CHECK (
    (status = 'published' AND published_at IS NOT NULL)
    OR (status <> 'published' AND published_at IS NULL)
  ),
  CONSTRAINT workspace_guest_resources_visibility_check CHECK (
    visibility IN ('all_clients', 'selected_clients')
  ),
  CONSTRAINT workspace_guest_resources_action_target_check CHECK (
    status <> 'published'
    OR (
      (type NOT IN ('video', 'link') OR url IS NOT NULL)
      AND (type <> 'download' OR file_url IS NOT NULL)
    )
  ),
  CONSTRAINT workspace_guest_resources_published_article_content_check CHECK (
    status <> 'published'
    OR type <> 'article'
    OR COALESCE(
      public.guest_resource_content_has_meaningful_text(content),
      false
    )
  )
);

CREATE UNIQUE INDEX workspace_guest_resources_template_clone_uidx
  ON public.workspace_guest_resources (workspace_id, source_template_id)
  WHERE source_template_id IS NOT NULL;

CREATE INDEX workspace_guest_resources_workspace_listing_idx
  ON public.workspace_guest_resources (
    workspace_id,
    status,
    featured DESC,
    display_order,
    title,
    id
  );

CREATE INDEX workspace_guest_resources_source_template_idx
  ON public.workspace_guest_resources (source_template_id)
  WHERE source_template_id IS NOT NULL;

CREATE TABLE public.workspace_guest_resource_clients (
  workspace_id UUID NOT NULL,
  resource_id UUID NOT NULL,
  client_id UUID NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workspace_guest_resource_clients_pkey
    PRIMARY KEY (resource_id, client_id),
  CONSTRAINT workspace_guest_resource_clients_resource_workspace_fkey
    FOREIGN KEY (resource_id, workspace_id)
    REFERENCES public.workspace_guest_resources(id, workspace_id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_guest_resource_clients_client_workspace_fkey
    FOREIGN KEY (client_id, workspace_id)
    REFERENCES public.clients(id, workspace_id)
    ON DELETE CASCADE
);

CREATE INDEX workspace_guest_resource_clients_workspace_client_idx
  ON public.workspace_guest_resource_clients (workspace_id, client_id, resource_id);

-- A client workspace move is a portal-identity reassignment. Without this
-- boundary an already-issued bearer session would resolve the same client id
-- after the move and gain access to the destination workspace. Purge all
-- credentials and bearer artifacts before the ownership update completes.
-- Selected-resource assignments belong to the old workspace and are removed
-- fail-closed as part of the same transaction.
CREATE OR REPLACE FUNCTION public.revoke_client_portal_access_artifacts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  workspace_changed BOOLEAN :=
    NEW.workspace_id IS DISTINCT FROM OLD.workspace_id;
  email_changed BOOLEAN :=
    lower(btrim(COALESCE(OLD.email, '')))
      IS DISTINCT FROM lower(btrim(COALESCE(NEW.email, '')));
BEGIN
  IF workspace_changed OR email_changed THEN
    DELETE FROM public.client_portal_credentials
    WHERE client_id = OLD.id;

    NEW.portal_access_enabled := false;
    NEW.portal_password := NULL;
    NEW.password_set_at := NULL;
    NEW.password_set_by := NULL;
    NEW.portal_last_login_at := NULL;
    NEW.portal_invitation_sent_at := NULL;

    DELETE FROM public.client_portal_sessions
    WHERE client_id = OLD.id;

    DELETE FROM public.client_portal_tokens
    WHERE client_id = OLD.id;

    IF workspace_changed THEN
      DELETE FROM public.workspace_guest_resource_clients
      WHERE client_id = OLD.id
        AND workspace_id = OLD.workspace_id;
    END IF;
  ELSIF COALESCE(OLD.portal_access_enabled, false)
    AND NOT COALESCE(NEW.portal_access_enabled, false)
  THEN
    DELETE FROM public.client_portal_sessions
    WHERE client_id = OLD.id;

    DELETE FROM public.client_portal_tokens
    WHERE client_id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_client_portal_access_artifacts()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS clients_revoke_portal_access_artifacts
  ON public.clients;
CREATE TRIGGER clients_revoke_portal_access_artifacts
  BEFORE UPDATE OF portal_access_enabled, email, workspace_id ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_client_portal_access_artifacts();

-- These tables are server APIs, not browser APIs. FORCE RLS preserves the
-- default-deny boundary even if their ownership changes in a future restore.
ALTER TABLE public.workspace_guest_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_guest_resources FORCE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_guest_resource_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_guest_resource_clients FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.workspace_guest_resources
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_guest_resource_clients
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_guest_resources TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_guest_resource_clients TO service_role;

CREATE POLICY workspace_guest_resources_service_role_only
  ON public.workspace_guest_resources
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY workspace_guest_resource_clients_service_role_only
  ON public.workspace_guest_resource_clients
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Resource ownership, provenance, and creation metadata are immutable. The
-- action RPC may edit content/presentation fields and records the actor in
-- updated_by; template provenance can only be set by the clone helper.
CREATE OR REPLACE FUNCTION public.guard_workspace_guest_resource_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  workspace_is_default BOOLEAN;
  source_provenance_cleared BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    source_provenance_cleared :=
      OLD.source_template_id IS NOT NULL
      AND NEW.source_template_id IS NULL
      AND (
        to_jsonb(NEW) - 'source_template_id'
      ) = (
        to_jsonb(OLD) - 'source_template_id'
      );

    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
      OR (
        NEW.source_template_id IS DISTINCT FROM OLD.source_template_id
        AND NOT source_provenance_cleared
      )
      OR NEW.created_by IS DISTINCT FROM OLD.created_by
      OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'workspace guest resource ownership is immutable'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT workspace.is_default
  INTO workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = NEW.workspace_id
  FOR SHARE;

  IF NOT FOUND OR workspace_is_default THEN
    RAISE EXCEPTION 'workspace guest resources require a private workspace'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND NOT source_provenance_cleared THEN
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_guest_resources_guard_row
  ON public.workspace_guest_resources;
CREATE TRIGGER workspace_guest_resources_guard_row
  BEFORE INSERT OR UPDATE ON public.workspace_guest_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_workspace_guest_resource_row();

-- AFTER-row accounting means clone rows skipped by ON CONFLICT DO NOTHING do
-- not consume quota. Updating the single workspace counter row is the
-- serialization point for concurrent creates and content replacements.
CREATE OR REPLACE FUNCTION public.adjust_workspace_guest_resource_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_workspace_id UUID;
  resource_delta INTEGER;
  content_delta BIGINT;
  adjusted_count INTEGER;
  adjusted_content_count BIGINT;
  current_count INTEGER;
  current_content_count BIGINT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_workspace_id := NEW.workspace_id;
    resource_delta := 1;
    content_delta := char_length(COALESCE(NEW.content, ''));
  ELSIF TG_OP = 'DELETE' THEN
    target_workspace_id := OLD.workspace_id;
    resource_delta := -1;
    content_delta := -char_length(COALESCE(OLD.content, ''));
  ELSE
    target_workspace_id := NEW.workspace_id;
    resource_delta := 0;
    content_delta :=
      char_length(COALESCE(NEW.content, ''))
      - char_length(COALESCE(OLD.content, ''));
  END IF;

  UPDATE public.workspace_guest_resource_quota_counters AS quota
  SET
    resource_count = quota.resource_count + resource_delta,
    content_char_count = quota.content_char_count + content_delta
  WHERE quota.workspace_id = target_workspace_id
    AND quota.resource_count + resource_delta BETWEEN 0 AND 1000
    AND quota.content_char_count + content_delta BETWEEN 0 AND 5000000
  RETURNING quota.resource_count, quota.content_char_count
  INTO adjusted_count, adjusted_content_count;

  IF NOT FOUND THEN
    SELECT quota.resource_count, quota.content_char_count
    INTO current_count, current_content_count
    FROM public.workspace_guest_resource_quota_counters AS quota
    WHERE quota.workspace_id = target_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace guest resource quota counter is missing'
        USING ERRCODE = '23514';
    ELSIF current_count + resource_delta > 1000 THEN
      RAISE EXCEPTION 'workspace guest resource count quota of 1000 exceeded'
        USING ERRCODE = '23514';
    ELSIF current_content_count + content_delta > 5000000 THEN
      RAISE EXCEPTION 'workspace guest resource content quota of 5000000 characters exceeded'
        USING ERRCODE = '23514';
    ELSE
      RAISE EXCEPTION 'workspace guest resource quota counter is inconsistent'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_workspace_guest_resource_quota()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS workspace_guest_resources_adjust_quota
  ON public.workspace_guest_resources;
CREATE TRIGGER workspace_guest_resources_adjust_quota
  AFTER INSERT OR DELETE OR UPDATE OF content
  ON public.workspace_guest_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.adjust_workspace_guest_resource_quota();

-- Clone every current platform template exactly once for a private workspace.
-- A clone is a content snapshot: there is intentionally no trigger on the
-- global guest_resources table and later template edits never propagate.
CREATE OR REPLACE FUNCTION public.clone_workspace_guest_resource_templates(
  p_workspace_id UUID,
  p_actor_user_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  workspace_is_default BOOLEAN;
  cloned_count INTEGER := 0;
  cloned_template_ids JSONB := '[]'::JSONB;
BEGIN
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required' USING ERRCODE = '22023';
  END IF;

  SELECT workspace.is_default
  INTO workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF workspace_is_default THEN
    RETURN 0;
  END IF;

  IF (SELECT count(*) FROM public.guest_resources) > 1000
    OR (
      SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)
      FROM public.guest_resources
    ) > 5000000
  THEN
    RAISE EXCEPTION 'platform guest resource catalog exceeds workspace seed quotas'
      USING ERRCODE = '23514';
  END IF;

  -- Validate the complete platform catalog before inserting any snapshots.
  -- In particular, user-info URLs (https://user:pass@example.com) must never
  -- be copied into a tenant-visible resource.
  IF EXISTS (
    SELECT 1
    FROM public.guest_resources AS template
    WHERE NOT public.guest_resource_text_is_normalized_nonempty(
        template.title,
        200
      )
      OR NOT public.guest_resource_text_is_normalized_nonempty(
        template.description,
        2000
      )
      OR (
        template.content IS NOT NULL
        AND (
          template.content <> btrim(template.content)
          OR char_length(template.content) NOT BETWEEN 1 AND 100000
          OR template.content !~*
            '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])'
          OR right(template.content, 1) <> '>'
        )
      )
      OR template.featured IS NULL
      OR template.display_order IS NULL
      OR template.display_order NOT BETWEEN 0 AND 1000000
      OR template.created_at IS NULL
      OR template.updated_at IS NULL
      OR (
        template.type IN ('video', 'link')
        AND template.url IS NULL
      )
      OR (
        template.type = 'download'
        AND template.file_url IS NULL
      )
      OR (
        template.type = 'article'
        AND NOT COALESCE(
          public.guest_resource_content_has_meaningful_text(template.content),
          false
        )
      )
      OR (
        NULLIF(btrim(template.url), '') IS NOT NULL
        AND NOT public.guest_resource_http_url_is_safe(btrim(template.url))
      )
      OR (
        NULLIF(btrim(template.file_url), '') IS NOT NULL
        AND NOT public.guest_resource_http_url_is_safe(
          btrim(template.file_url)
        )
      )
  ) THEN
    RAISE EXCEPTION 'platform guest resource catalog violates the workspace seed contract'
      USING ERRCODE = '22023';
  END IF;

  WITH inserted_clone AS (
    INSERT INTO public.workspace_guest_resources (
      workspace_id,
      title,
      description,
      content,
      category,
      type,
      url,
      file_url,
      featured,
      display_order,
      status,
      published_at,
      visibility,
      source_template_id,
      created_by,
      updated_by
    )
    SELECT
      p_workspace_id,
      btrim(template.title),
      btrim(template.description),
      NULLIF(template.content, ''),
      template.category,
      template.type,
      NULLIF(btrim(template.url), ''),
      NULLIF(btrim(template.file_url), ''),
      COALESCE(template.featured, false),
      GREATEST(COALESCE(template.display_order, 0), 0),
      'published',
      now(),
      'all_clients',
      template.id,
      p_actor_user_id,
      p_actor_user_id
    FROM public.guest_resources AS template
    ORDER BY template.display_order, template.created_at, template.id
    ON CONFLICT (workspace_id, source_template_id)
      WHERE source_template_id IS NOT NULL
      DO NOTHING
    RETURNING source_template_id
  )
  SELECT
    count(*)::INTEGER,
    COALESCE(
      jsonb_agg(inserted_clone.source_template_id ORDER BY inserted_clone.source_template_id),
      '[]'::JSONB
    )
  INTO cloned_count, cloned_template_ids
  FROM inserted_clone;

  IF cloned_count > 0 THEN
    INSERT INTO public.workspace_audit_log (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.guest_resources.templates_cloned',
      'workspace_guest_resources',
      p_workspace_id,
      jsonb_build_object(
        'resource_count', cloned_count,
        'template_ids', cloned_template_ids
      )
    );
  END IF;

  RETURN cloned_count;
END;
$$;

-- Backfill each existing private workspace. The unique provenance index makes
-- this safe against a prior manual clone or a retried deployment transaction.
DO $$
DECLARE
  target_workspace RECORD;
BEGIN
  FOR target_workspace IN
    SELECT workspace.id, workspace.created_by
    FROM public.workspaces AS workspace
    WHERE NOT workspace.is_default
    ORDER BY workspace.id
  LOOP
    PERFORM public.clone_workspace_guest_resource_templates(
      target_workspace.id,
      target_workspace.created_by
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_workspace_guest_resources_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.workspace_guest_resource_quota_counters (
    workspace_id,
    resource_count,
    content_char_count
  )
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.is_default
        THEN (SELECT count(*)::INTEGER FROM public.guest_resources)
      ELSE 0
    END,
    CASE
      WHEN NEW.is_default THEN (
        SELECT COALESCE(sum(char_length(COALESCE(content, ''))), 0)::BIGINT
        FROM public.guest_resources
      )
      ELSE 0
    END
  )
  ON CONFLICT (workspace_id) DO NOTHING;

  IF NOT NEW.is_default THEN
    PERFORM public.clone_workspace_guest_resource_templates(
      NEW.id,
      NEW.created_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspaces_seed_guest_resources
  ON public.workspaces;
CREATE TRIGGER workspaces_seed_guest_resources
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_workspace_guest_resources_after_insert();

-- Edge-facing action API. The service role is trusted to pass the actor and
-- verified JWT iat; this function independently binds that actor to Auth,
-- checks the token epoch, serializes the workspace/resource rows, replaces
-- selected-client assignments atomically, and writes one audit event for every
-- mutation. Platform administrators may only use the list preview.
CREATE OR REPLACE FUNCTION public.workspace_guest_resource_operation_v1(
  p_action TEXT,
  p_workspace_id UUID,
  p_resource_id UUID,
  p_payload JSONB,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  actor_is_platform_admin BOOLEAN := false;
  actor_role TEXT;
  workspace_status TEXT;
  workspace_is_default BOOLEAN;
  expected_payload_keys CONSTANT TEXT[] := ARRAY[
    'title',
    'description',
    'content',
    'category',
    'type',
    'url',
    'file_url',
    'featured',
    'display_order',
    'status',
    'visibility',
    'client_ids'
  ];
  normalized_title TEXT;
  normalized_description TEXT;
  normalized_content TEXT;
  normalized_category public.resource_category;
  normalized_type public.resource_type;
  normalized_url TEXT;
  normalized_file_url TEXT;
  normalized_featured BOOLEAN;
  normalized_display_order INTEGER;
  normalized_status TEXT;
  normalized_visibility TEXT;
  normalized_client_ids UUID[] := ARRAY[]::UUID[];
  matching_client_count INTEGER := 0;
  target_resource public.workspace_guest_resources%ROWTYPE;
  previous_client_ids UUID[] := ARRAY[]::UUID[];
  result JSONB;
BEGIN
  IF normalized_action NOT IN ('list', 'create', 'update', 'delete')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace guest resource operation'
      USING ERRCODE = '22023';
  END IF;

  SELECT workspace.status, workspace.is_default
  INTO workspace_status, workspace_is_default
  FROM public.workspaces AS workspace
  WHERE workspace.id = p_workspace_id
  FOR SHARE;

  IF NOT FOUND OR workspace_is_default THEN
    RAISE EXCEPTION 'private workspace not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS auth_user
    JOIN public.admin_users AS admin_user
      ON lower(btrim(admin_user.email)) = lower(btrim(auth_user.email))
    JOIN public.workspace_memberships AS membership
      ON membership.user_id = auth_user.id
      AND membership.email_normalized = lower(btrim(auth_user.email))
      AND membership.status = 'active'
    JOIN public.workspaces AS workspace
      ON workspace.id = membership.workspace_id
      AND workspace.is_default
      AND workspace.status = 'active'
    WHERE auth_user.id = p_actor_user_id
      AND p_token_issued_at >= membership.workspace_access_not_before_epoch
  )
  INTO actor_is_platform_admin;

  IF actor_is_platform_admin THEN
    IF workspace_status <> 'active' THEN
      RAISE EXCEPTION 'active workspace access is required'
        USING ERRCODE = '42501';
    ELSIF normalized_action <> 'list' THEN
      RAISE EXCEPTION 'platform administrator preview is read-only'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT membership.role
    INTO actor_role
    FROM public.workspace_memberships AS membership
    JOIN auth.users AS auth_user
      ON auth_user.id = membership.user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = p_actor_user_id
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin')
      AND p_token_issued_at >= membership.workspace_access_not_before_epoch
    FOR SHARE OF membership;

    IF NOT FOUND OR workspace_status <> 'active' THEN
      RAISE EXCEPTION 'active workspace manager access is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF normalized_action = 'list' THEN
    IF p_resource_id IS NOT NULL
      OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'invalid list parameters' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', resource.id,
          'workspace_id', resource.workspace_id,
          'title', resource.title,
          'description', resource.description,
          'content', resource.content,
          'category', resource.category,
          'type', resource.type,
          'url', resource.url,
          'file_url', resource.file_url,
          'featured', resource.featured,
          'display_order', resource.display_order,
          'status', resource.status,
          'published_at', resource.published_at,
          'visibility', resource.visibility,
          'source_template_id', resource.source_template_id,
          'created_at', resource.created_at,
          'updated_at', resource.updated_at,
          'client_ids', COALESCE(assignment.client_ids, ARRAY[]::UUID[])
        )
        ORDER BY
          resource.featured DESC,
          resource.display_order,
          resource.title,
          resource.id
      ),
      '[]'::JSONB
    )
    INTO result
    FROM public.workspace_guest_resources AS resource
    LEFT JOIN LATERAL (
      SELECT array_agg(link.client_id ORDER BY link.client_id) AS client_ids
      FROM public.workspace_guest_resource_clients AS link
      WHERE link.workspace_id = resource.workspace_id
        AND link.resource_id = resource.id
    ) AS assignment ON true
    WHERE resource.workspace_id = p_workspace_id;

    RETURN result;
  END IF;

  IF normalized_action = 'delete' THEN
    IF p_resource_id IS NULL
      OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'invalid delete parameters' USING ERRCODE = '22023';
    END IF;

    SELECT resource.*
    INTO target_resource
    FROM public.workspace_guest_resources AS resource
    WHERE resource.id = p_resource_id
      AND resource.workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace guest resource not found'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(link.client_id ORDER BY link.client_id), ARRAY[]::UUID[])
    INTO previous_client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.resource_id = p_resource_id
      AND link.workspace_id = p_workspace_id;

    DELETE FROM public.workspace_guest_resources
    WHERE id = p_resource_id
      AND workspace_id = p_workspace_id;

    INSERT INTO public.workspace_audit_log (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.guest_resource.deleted',
      'workspace_guest_resource',
      p_resource_id,
      jsonb_build_object(
        'title', target_resource.title,
        'status', target_resource.status,
        'visibility', target_resource.visibility,
        'client_count', cardinality(previous_client_ids),
        'source_template_id', target_resource.source_template_id
      )
    );

    RETURN 'null'::JSONB;
  END IF;

  IF p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
    OR NOT p_payload ?& expected_payload_keys
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_payload) AS payload_key(key)
      WHERE payload_key.key <> ALL(expected_payload_keys)
    )
    OR jsonb_typeof(p_payload -> 'title') <> 'string'
    OR jsonb_typeof(p_payload -> 'description') <> 'string'
    OR jsonb_typeof(p_payload -> 'content') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'category') <> 'string'
    OR jsonb_typeof(p_payload -> 'type') <> 'string'
    OR jsonb_typeof(p_payload -> 'url') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'file_url') NOT IN ('string', 'null')
    OR jsonb_typeof(p_payload -> 'featured') <> 'boolean'
    OR jsonb_typeof(p_payload -> 'display_order') <> 'number'
    OR jsonb_typeof(p_payload -> 'status') <> 'string'
    OR jsonb_typeof(p_payload -> 'visibility') <> 'string'
    OR jsonb_typeof(p_payload -> 'client_ids') <> 'array'
  THEN
    RAISE EXCEPTION 'invalid workspace guest resource payload'
      USING ERRCODE = '22023';
  END IF;

  normalized_title := btrim(p_payload ->> 'title');
  normalized_description := btrim(p_payload ->> 'description');
  normalized_content := NULLIF(btrim(p_payload ->> 'content'), '');
  normalized_url := NULLIF(btrim(p_payload ->> 'url'), '');
  normalized_file_url := NULLIF(btrim(p_payload ->> 'file_url'), '');
  normalized_featured := (p_payload ->> 'featured')::BOOLEAN;
  normalized_status := btrim(p_payload ->> 'status');
  normalized_visibility := btrim(p_payload ->> 'visibility');

  IF (p_payload ->> 'display_order') !~ '^[0-9]+$'
    OR (p_payload ->> 'display_order')::NUMERIC > 1000000
    OR NOT public.guest_resource_text_is_normalized_nonempty(
      normalized_title,
      200
    )
    OR NOT public.guest_resource_text_is_normalized_nonempty(
      normalized_description,
      2000
    )
    OR char_length(COALESCE(normalized_content, '')) > 100000
    OR (
      normalized_content IS NOT NULL
      AND (
        normalized_content !~*
          '^<(p|h[1-6]|ul|ol|blockquote|pre|hr)([[:space:]>])'
        OR right(normalized_content, 1) <> '>'
      )
    )
    OR (
      normalized_url IS NOT NULL
      AND NOT public.guest_resource_http_url_is_safe(normalized_url)
    )
    OR (
      normalized_file_url IS NOT NULL
      AND NOT public.guest_resource_http_url_is_safe(normalized_file_url)
    )
    OR p_payload ->> 'category' NOT IN (
      'preparation',
      'technical_setup',
      'best_practices',
      'promotion',
      'examples',
      'templates'
    )
    OR p_payload ->> 'type' NOT IN ('article', 'video', 'download', 'link')
    OR normalized_status NOT IN ('draft', 'published', 'archived')
    OR normalized_visibility NOT IN ('all_clients', 'selected_clients')
    OR (
      normalized_status = 'published'
      AND (
        (
          p_payload ->> 'type' IN ('video', 'link')
          AND normalized_url IS NULL
        )
        OR (
          p_payload ->> 'type' = 'download'
          AND normalized_file_url IS NULL
        )
        OR (
          p_payload ->> 'type' = 'article'
          AND NOT COALESCE(
            public.guest_resource_content_has_meaningful_text(
              normalized_content
            ),
            false
          )
        )
      )
    )
    OR jsonb_array_length(p_payload -> 'client_ids') > 500
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_payload -> 'client_ids') AS client_id(value)
      WHERE jsonb_typeof(client_id.value) <> 'string'
        OR client_id.value #>> '{}' !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    OR jsonb_array_length(p_payload -> 'client_ids') <> (
      SELECT count(DISTINCT lower(client_id.value #>> '{}'))
      FROM jsonb_array_elements(p_payload -> 'client_ids') AS client_id(value)
    )
  THEN
    RAISE EXCEPTION 'invalid workspace guest resource fields'
      USING ERRCODE = '22023';
  END IF;

  normalized_display_order := (p_payload ->> 'display_order')::INTEGER;
  normalized_category := (p_payload ->> 'category')::public.resource_category;
  normalized_type := (p_payload ->> 'type')::public.resource_type;

  SELECT COALESCE(
    array_agg((client_id.value #>> '{}')::UUID ORDER BY client_id.value #>> '{}'),
    ARRAY[]::UUID[]
  )
  INTO normalized_client_ids
  FROM jsonb_array_elements(p_payload -> 'client_ids') AS client_id(value);

  IF (
      normalized_visibility = 'selected_clients'
      AND cardinality(normalized_client_ids) = 0
    ) OR (
      normalized_visibility = 'all_clients'
      AND cardinality(normalized_client_ids) <> 0
    )
  THEN
    RAISE EXCEPTION 'client_ids do not match resource visibility'
      USING ERRCODE = '22023';
  END IF;

  IF cardinality(normalized_client_ids) > 0 THEN
    PERFORM 1
    FROM public.clients AS client
    WHERE client.workspace_id = p_workspace_id
      AND client.id = ANY(normalized_client_ids)
    ORDER BY client.id
    FOR SHARE;
    GET DIAGNOSTICS matching_client_count = ROW_COUNT;

    IF matching_client_count <> cardinality(normalized_client_ids) THEN
      RAISE EXCEPTION 'one or more resource clients are outside the workspace'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF normalized_action = 'create' THEN
    IF p_resource_id IS NOT NULL THEN
      RAISE EXCEPTION 'resource_id is not accepted for create'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.workspace_guest_resources (
      workspace_id,
      title,
      description,
      content,
      category,
      type,
      url,
      file_url,
      featured,
      display_order,
      status,
      published_at,
      visibility,
      source_template_id,
      created_by,
      updated_by
    )
    VALUES (
      p_workspace_id,
      normalized_title,
      normalized_description,
      normalized_content,
      normalized_category,
      normalized_type,
      normalized_url,
      normalized_file_url,
      normalized_featured,
      normalized_display_order,
      normalized_status,
      CASE WHEN normalized_status = 'published' THEN now() ELSE NULL END,
      normalized_visibility,
      NULL,
      p_actor_user_id,
      p_actor_user_id
    )
    RETURNING * INTO target_resource;

    INSERT INTO public.workspace_guest_resource_clients (
      workspace_id,
      resource_id,
      client_id,
      created_by
    )
    SELECT
      p_workspace_id,
      target_resource.id,
      assigned_client.client_id,
      p_actor_user_id
    FROM unnest(normalized_client_ids) AS assigned_client(client_id);

    INSERT INTO public.workspace_audit_log (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.guest_resource.created',
      'workspace_guest_resource',
      target_resource.id,
      jsonb_build_object(
        'title', target_resource.title,
        'status', target_resource.status,
        'visibility', target_resource.visibility,
        'client_count', cardinality(normalized_client_ids),
        'source_template_id', NULL
      )
    );
  ELSE
    IF normalized_action <> 'update' OR p_resource_id IS NULL THEN
      RAISE EXCEPTION 'resource_id is required for update'
        USING ERRCODE = '22023';
    END IF;

    SELECT resource.*
    INTO target_resource
    FROM public.workspace_guest_resources AS resource
    WHERE resource.id = p_resource_id
      AND resource.workspace_id = p_workspace_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'workspace guest resource not found'
        USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(array_agg(link.client_id ORDER BY link.client_id), ARRAY[]::UUID[])
    INTO previous_client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.resource_id = p_resource_id
      AND link.workspace_id = p_workspace_id;

    UPDATE public.workspace_guest_resources AS resource
    SET
      title = normalized_title,
      description = normalized_description,
      content = normalized_content,
      category = normalized_category,
      type = normalized_type,
      url = normalized_url,
      file_url = normalized_file_url,
      featured = normalized_featured,
      display_order = normalized_display_order,
      status = normalized_status,
      published_at = CASE
        WHEN normalized_status <> 'published' THEN NULL
        WHEN target_resource.status = 'published' THEN target_resource.published_at
        ELSE now()
      END,
      visibility = normalized_visibility,
      updated_by = p_actor_user_id
    WHERE resource.id = p_resource_id
      AND resource.workspace_id = p_workspace_id
    RETURNING resource.* INTO target_resource;

    DELETE FROM public.workspace_guest_resource_clients
    WHERE resource_id = p_resource_id
      AND workspace_id = p_workspace_id;

    INSERT INTO public.workspace_guest_resource_clients (
      workspace_id,
      resource_id,
      client_id,
      created_by
    )
    SELECT
      p_workspace_id,
      p_resource_id,
      assigned_client.client_id,
      p_actor_user_id
    FROM unnest(normalized_client_ids) AS assigned_client(client_id);

    INSERT INTO public.workspace_audit_log (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.guest_resource.updated',
      'workspace_guest_resource',
      p_resource_id,
      jsonb_build_object(
        'title', target_resource.title,
        'status', target_resource.status,
        'visibility', target_resource.visibility,
        'client_count', cardinality(normalized_client_ids),
        'previous_client_count', cardinality(previous_client_ids),
        'source_template_id', target_resource.source_template_id
      )
    );
  END IF;

  SELECT jsonb_build_object(
    'id', resource.id,
    'workspace_id', resource.workspace_id,
    'title', resource.title,
    'description', resource.description,
    'content', resource.content,
    'category', resource.category,
    'type', resource.type,
    'url', resource.url,
    'file_url', resource.file_url,
    'featured', resource.featured,
    'display_order', resource.display_order,
    'status', resource.status,
    'published_at', resource.published_at,
    'visibility', resource.visibility,
    'source_template_id', resource.source_template_id,
    'created_at', resource.created_at,
    'updated_at', resource.updated_at,
    'client_ids', COALESCE(assignment.client_ids, ARRAY[]::UUID[])
  )
  INTO result
  FROM public.workspace_guest_resources AS resource
  LEFT JOIN LATERAL (
    SELECT array_agg(link.client_id ORDER BY link.client_id) AS client_ids
    FROM public.workspace_guest_resource_clients AS link
    WHERE link.workspace_id = resource.workspace_id
      AND link.resource_id = resource.id
  ) AS assignment ON true
  WHERE resource.id = target_resource.id
    AND resource.workspace_id = p_workspace_id;

  RETURN result;
END;
$$;

-- Portal-facing read helper. The calling Edge function must validate the
-- hashed portal session first; this service-only RPC still derives ownership
-- from the client row, checks active portal/workspace state, and never reveals
-- assignment lists or workspace/actor/provenance fields. Default-workspace
-- clients retain the existing global catalog for backward compatibility.
DROP FUNCTION IF EXISTS public.portal_guest_resources_for_client_v1(
  UUID, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER
);
CREATE OR REPLACE FUNCTION public.portal_guest_resources_for_client_v1(
  p_client_id UUID,
  p_session_token_hash TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_featured_only BOOLEAN DEFAULT false,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  client_workspace_id UUID;
  workspace_is_default BOOLEAN;
  normalized_category public.resource_category;
  normalized_type public.resource_type;
  result JSONB;
BEGIN
  IF p_client_id IS NULL
    OR (
      p_session_token_hash IS NOT NULL
      AND p_session_token_hash !~ '^sha256\$[A-Za-z0-9+/]{43}=$'
    )
    OR p_featured_only IS NULL
    OR p_limit IS NULL
    OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL
    OR p_offset < 0
    OR (
      p_category IS NOT NULL
      AND btrim(p_category) NOT IN (
        'preparation',
        'technical_setup',
        'best_practices',
        'promotion',
        'examples',
        'templates'
      )
    )
    OR (
      p_type IS NOT NULL
      AND btrim(p_type) NOT IN ('article', 'video', 'download', 'link')
    )
  THEN
    RAISE EXCEPTION 'invalid portal guest resource parameters'
      USING ERRCODE = '22023';
  END IF;

  IF p_category IS NOT NULL THEN
    normalized_category := btrim(p_category)::public.resource_category;
  END IF;
  IF p_type IS NOT NULL THEN
    normalized_type := btrim(p_type)::public.resource_type;
  END IF;

  IF p_session_token_hash IS NULL THEN
    -- The nullable branch is reserved for the service-only platform-admin
    -- preview. The function is not executable by browser roles.
    SELECT client.workspace_id, workspace.is_default
    INTO client_workspace_id, workspace_is_default
    FROM public.clients AS client
    JOIN public.workspaces AS workspace
      ON workspace.id = client.workspace_id
    WHERE client.id = p_client_id
      AND COALESCE(client.portal_access_enabled, false)
      AND workspace.status = 'active'
    FOR SHARE OF client, workspace;
  ELSE
    -- Revalidate the exact session inside the resource RPC and keep the
    -- session, client ownership, and workspace lifecycle rows locked until
    -- the listing statement completes. This closes the Edge lookup/RPC race.
    SELECT client.workspace_id, workspace.is_default
    INTO client_workspace_id, workspace_is_default
    FROM public.client_portal_sessions AS portal_session
    JOIN public.clients AS client
      ON client.id = portal_session.client_id
    JOIN public.workspaces AS workspace
      ON workspace.id = client.workspace_id
    WHERE portal_session.client_id = p_client_id
      AND portal_session.session_token = p_session_token_hash
      AND portal_session.expires_at > clock_timestamp()
      AND COALESCE(client.portal_access_enabled, false)
      AND workspace.status = 'active'
    FOR SHARE OF portal_session, client, workspace;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active client portal access is required'
      USING ERRCODE = '42501';
  END IF;

  IF workspace_is_default THEN
    WITH visible_resource AS MATERIALIZED (
      SELECT
        resource.id,
        resource.title,
        COALESCE(resource.featured, false) AS featured,
        COALESCE(resource.display_order, 0) AS display_order
      FROM public.guest_resources AS resource
      WHERE (
          normalized_category IS NULL
          OR resource.category = normalized_category
        )
        AND (normalized_type IS NULL OR resource.type = normalized_type)
        AND (NOT p_featured_only OR COALESCE(resource.featured, false))
    ),
    paged_resource AS MATERIALIZED (
      SELECT *
      FROM visible_resource
      ORDER BY featured DESC, display_order, title, id
      LIMIT p_limit
      OFFSET p_offset
    ),
    resource_page AS (
      SELECT
        resource.id,
        resource.title,
        resource.description,
        NULLIF(resource.content, '') AS content,
        resource.category,
        resource.type,
        resource.url,
        resource.file_url,
        resource.featured,
        resource.display_order,
        resource.created_at AS published_at,
        resource.updated_at
      FROM paged_resource AS page
      JOIN public.guest_resources AS resource
        ON resource.id = page.id
        AND (
          resource.type <> 'article'
          OR COALESCE(
            public.guest_resource_content_has_meaningful_text(
              resource.content
            ),
            false
          )
        )
    )
    SELECT jsonb_build_object(
      'resources', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', resource.id,
            'title', resource.title,
            'description', resource.description,
            'content', resource.content,
            'category', resource.category,
            'type', resource.type,
            'url', resource.url,
            'file_url', resource.file_url,
            'featured', resource.featured,
            'display_order', resource.display_order,
            'published_at', resource.published_at,
            'updated_at', resource.updated_at
          )
          ORDER BY
            resource.featured DESC,
            resource.display_order,
            resource.title,
            resource.id
        )
        FROM resource_page AS resource
      ), '[]'::JSONB),
      'total', (SELECT count(*) FROM visible_resource)
    )
    INTO result;
  ELSE
    WITH visible_resource AS MATERIALIZED (
      SELECT
        resource.id,
        resource.title,
        resource.featured,
        resource.display_order
      FROM public.workspace_guest_resources AS resource
      WHERE resource.workspace_id = client_workspace_id
        AND resource.status = 'published'
        AND (
          resource.visibility = 'all_clients'
          OR EXISTS (
            SELECT 1
            FROM public.workspace_guest_resource_clients AS assignment
            WHERE assignment.workspace_id = client_workspace_id
              AND assignment.resource_id = resource.id
              AND assignment.client_id = p_client_id
          )
        )
        AND (
          normalized_category IS NULL
          OR resource.category = normalized_category
        )
        AND (normalized_type IS NULL OR resource.type = normalized_type)
        AND (NOT p_featured_only OR resource.featured)
    ),
    paged_resource AS MATERIALIZED (
      SELECT *
      FROM visible_resource
      ORDER BY featured DESC, display_order, title, id
      LIMIT p_limit
      OFFSET p_offset
    ),
    resource_page AS (
      SELECT
        resource.id,
        resource.title,
        resource.description,
        resource.content,
        resource.category,
        resource.type,
        resource.url,
        resource.file_url,
        resource.featured,
        resource.display_order,
        resource.published_at,
        resource.updated_at
      FROM paged_resource AS page
      JOIN public.workspace_guest_resources AS resource
        ON resource.id = page.id
        AND resource.workspace_id = client_workspace_id
        AND (
          resource.type <> 'article'
          OR COALESCE(
            public.guest_resource_content_has_meaningful_text(
              resource.content
            ),
            false
          )
        )
    )
    SELECT jsonb_build_object(
      'resources', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', resource.id,
            'title', resource.title,
            'description', resource.description,
            'content', resource.content,
            'category', resource.category,
            'type', resource.type,
            'url', resource.url,
            'file_url', resource.file_url,
            'featured', resource.featured,
            'display_order', resource.display_order,
            'published_at', resource.published_at,
            'updated_at', resource.updated_at
          )
          ORDER BY
            resource.featured DESC,
            resource.display_order,
            resource.title,
            resource.id
        )
        FROM resource_page AS resource
      ), '[]'::JSONB),
      'total', (SELECT count(*) FROM visible_resource)
    )
    INTO result;
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_workspace_guest_resource_row()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.clone_workspace_guest_resource_templates(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seed_workspace_guest_resources_after_insert()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

REVOKE ALL ON FUNCTION public.portal_guest_resources_for_client_v1(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_guest_resources_for_client_v1(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER
) TO service_role;

COMMENT ON TABLE public.workspace_guest_resources IS
  'Private-workspace guest resource snapshots managed only through the audited service action API.';
COMMENT ON TABLE public.workspace_guest_resource_clients IS
  'Same-workspace selected-client visibility assignments for workspace guest resources.';
COMMENT ON FUNCTION public.workspace_guest_resource_operation_v1(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Service-only, token-epoch-gated and audited workspace guest resource CRUD with atomic assignment replacement.';
COMMENT ON FUNCTION public.portal_guest_resources_for_client_v1(
  UUID, TEXT, TEXT, TEXT, BOOLEAN, INTEGER, INTEGER
) IS
  'Service-only least-privilege resource listing with in-transaction portal-session revalidation and client-derived workspace scope.';

COMMIT;
