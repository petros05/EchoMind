import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Function to extract code blocks from markdown content
const extractCodeBlocks = (content) => {
  const codeBlocks = [];
  const lines = content.split("\n");
  let currentBlock = null;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for start of code block
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End of code block
        if (currentBlock) {
          currentBlock.code = currentBlock.code.join("\n");
          currentBlock.endLine = i;
          codeBlocks.push(currentBlock);
          currentBlock = null;
        }
        inCodeBlock = false;
      } else {
        // Start of code block
        const language = line.slice(3).trim() || "text";
        currentBlock = {
          language: language,
          code: [],
          startLine: i,
          endLine: i,
        };
        inCodeBlock = true;
      }
    } else if (inCodeBlock && currentBlock) {
      currentBlock.code.push(line);
    }
  }

  // Handle case where code block doesn't end properly
  if (inCodeBlock && currentBlock) {
    currentBlock.code = currentBlock.code.join("\n");
    currentBlock.endLine = lines.length - 1;
    codeBlocks.push(currentBlock);
  }

  return codeBlocks;
};

// Copy button component
const CopyButton = ({ code, language }) => {
  const [copyText, setCopyText] = useState("copy");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyText("copied");
      setTimeout(() => {
        setCopyText("copy");
      }, 2000);
    } catch (err) {
      console.error("Failed to copy code: ", err);
      setCopyText("error");
      setTimeout(() => {
        setCopyText("copy");
      }, 2000);
    }
  };

  return (
    <button
      className="copy-button"
      onClick={handleCopy}
      title="Copy code to clipboard"
    >
      {copyText}
    </button>
  );
};

// Function to render content with code blocks
const renderContentWithCode = (content) => {
  const codeBlocks = extractCodeBlocks(content);

  if (codeBlocks.length === 0) {
    // No markdown code blocks found, use ReactMarkdown for regular content
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    );
  }

  // Split content by code blocks and render
  const lines = content.split("\n");
  const elements = [];
  let currentTextLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let isInCodeBlock = false;

    // Check if current line is part of a code block
    for (const block of codeBlocks) {
      if (i >= block.startLine && i <= block.endLine) {
        isInCodeBlock = true;
        break;
      }
    }

    if (isInCodeBlock) {
      // If we have accumulated text lines, render them first
      if (currentTextLines.length > 0) {
        const textContent = currentTextLines.join("\n");
        if (textContent.trim()) {
          elements.push(
            <div key={`text-${i}`} className="text-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {textContent}
              </ReactMarkdown>
            </div>
          );
        }
        currentTextLines = [];
      }

      // Find the code block this line belongs to and render it
      const block = codeBlocks.find((b) => i >= b.startLine && i <= b.endLine);
      if (block && i === block.startLine) {
        elements.push(
          <div key={`code-${i}`} className="code-block-container">
            <div className="code-block-header">
              <span>{block.language.toLowerCase()}</span>
              <CopyButton code={block.code} language={block.language} />
            </div>
            <SyntaxHighlighter
              language={block.language}
              style={tomorrow}
              customStyle={{
                margin: 0,
                borderRadius: "0 0 8px 8px",
                fontSize: "0.9rem",
                lineHeight: "1.4",
              }}
              showLineNumbers={false}
              wrapLines={true}
              wrapLongLines={true}
            >
              {block.code}
            </SyntaxHighlighter>
          </div>
        );
      }
    } else {
      // This line is not part of a code block, add it to text lines
      currentTextLines.push(line);
    }
  }

  // Render any remaining text lines
  if (currentTextLines.length > 0) {
    const textContent = currentTextLines.join("\n");
    if (textContent.trim()) {
      elements.push(
        <div key="text-final" className="text-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {textContent}
          </ReactMarkdown>
        </div>
      );
    }
  }

  return <div className="mixed-content">{elements}</div>;
};

const CodeBlock = ({ content }) => {
  return renderContentWithCode(content);
};

export default CodeBlock;
