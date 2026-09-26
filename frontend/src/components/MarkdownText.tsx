import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Somebody's text, formatted. Markdown only - `react-markdown` escapes raw
 * HTML rather than rendering it, and we deliberately do not add `rehype-raw`,
 * so a description cannot smuggle markup into the page. Link hrefs go through
 * its default transform, which drops `javascript:`, and images render as
 * links rather than loading on sight.
 *
 * Styled to the app rather than to a document: the same body size as the text
 * around it, tight spacing, and no headings large enough to compete with the
 * panel's own.
 */
export default function MarkdownText({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {children}
          </Typography>
        ),
        a: ({ href, children }) => (
          <Link
            href={href}
            target="_blank"
            // Opening somebody else's link must not hand them this tab.
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            sx={{ wordBreak: "break-word" }}
          >
            {children}
          </Link>
        ),
        // An image would load from wherever its author pointed it the
        // moment anyone opened the trip - a tracking pixel for every
        // member's address. It shows as a link instead, opened by choice.
        img: ({ src, alt }) =>
          typeof src === "string" ? (
            <Link
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              sx={{ wordBreak: "break-word" }}
            >
              {alt || "Image"}
            </Link>
          ) : null,
        ul: ({ children }) => (
          <Typography
            component="ul"
            variant="body2"
            color="text.secondary"
            sx={{ pl: 2.5, my: 0.5 }}
          >
            {children}
          </Typography>
        ),
        ol: ({ children }) => (
          <Typography
            component="ol"
            variant="body2"
            color="text.secondary"
            sx={{ pl: 2.5, my: 0.5 }}
          >
            {children}
          </Typography>
        ),
        li: ({ children }) => <li>{children}</li>,
        // A description is not a document, so its headings stay body-sized
        // and only gain weight.
        h1: ({ children }) => (
          <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
            {children}
          </Typography>
        ),
        h2: ({ children }) => (
          <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
            {children}
          </Typography>
        ),
        h3: ({ children }) => (
          <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>
            {children}
          </Typography>
        ),
        code: ({ children }) => (
          <Typography
            component="code"
            sx={{ fontFamily: "monospace", fontSize: "0.8125rem" }}
          >
            {children}
          </Typography>
        ),
      }}
    >
      {children}
    </Markdown>
  );
}
