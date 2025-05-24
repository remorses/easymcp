"use client";

import type React from "react";

import { useState } from "react";

interface Generation {
  id: string;
  title: string;
  timestamp: Date;
  packageName: string;
}

export default function OpenAPIMCPLanding() {
  const [schema, setSchema] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [packageName, setPackageName] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [generations, setGenerations] = useState<Generation[]>([
    {
      id: "1",
      title: "Petstore API",
      timestamp: new Date(Date.now() - 86400000),
      packageName: "mcp-petstore-1234",
    },
    {
      id: "2",
      title: "Weather API",
      timestamp: new Date(Date.now() - 172800000),
      packageName: "mcp-weather-5678",
    },
    {
      id: "3",
      title: "User Management API",
      timestamp: new Date(Date.now() - 259200000),
      packageName: "mcp-users-9012",
    },
  ]);

  const handleSubmit = () => {
    if (schema.trim()) {
      const generatedName = `mcp-${Date.now()}`;
      setPackageName(generatedName);

      // Add to generations history
      const newGeneration: Generation = {
        id: Date.now().toString(),
        title: schema.slice(0, 30) + (schema.length > 30 ? "..." : ""),
        timestamp: new Date(),
        packageName: generatedName,
      };
      setGenerations((prev) => [newGeneration, ...prev]);
      setSubmitted(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const mcpConfig = {
    mcpServers: {
      [packageName]: {
        command: "npx",
        args: [packageName],
      },
    },
  };

  const CodeBlock = ({
    code,
    language,
  }: {
    code: string;
    language: string;
  }) => (
    <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto border border-gray-200">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-500 text-xs font-medium uppercase tracking-wide">
          {language}
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="text-gray-500 hover:text-gray-900 text-xs px-3 py-1.5 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-1.5"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        </button>
      </div>
      <pre className="text-gray-900 text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 flex">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-80" : "w-0"} transition-all duration-200 overflow-hidden bg-gray-50 border-r border-gray-200 flex flex-col`}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-medium">OpenAPI to MCP</h1>
                <p className="text-xs text-gray-500">Past generations</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => {
              setSubmitted(false);
              setSchema("");
              setPackageName("");
            }}
            className="w-full p-3 text-left rounded-md border border-gray-200 hover:bg-white transition-colors mb-4 flex items-center gap-3"
          >
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="text-sm text-gray-600">New conversion</span>
          </button>

          <div className="space-y-1">
            {generations.map((gen) => (
              <button
                key={gen.id}
                onClick={() => {
                  setPackageName(gen.packageName);
                  setSubmitted(true);
                }}
                className="w-full p-3 text-left rounded-md hover:bg-white transition-colors border border-transparent hover:border-gray-200 group"
              >
                <div className="text-sm font-medium text-gray-900 truncate mb-1">
                  {gen.title}
                </div>
                <div className="text-xs text-gray-500">
                  {formatTime(gen.timestamp)}
                </div>
                <div className="text-xs text-gray-400 font-mono mt-1 truncate">
                  {gen.packageName}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Toggle Sidebar Button */}
        <div className="p-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-md hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-3xl">
            {!submitted ? (
              <>
                {/* Welcome Message */}
                <div className="text-center mb-12">
                  <div className="mb-6"></div>
                  <h2 className="text-4xl md:text-5xl font-semibold mb-4 text-black">
                    Transform your OpenAPI schema
                  </h2>
                  <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
                    Convert any OpenAPI specification into a Model Context
                    Protocol package that works seamlessly with Claude, Cursor,
                    and other AI tools.
                  </p>
                </div>

                {/* Input Area */}
                <div className="relative mb-8">
                  <div className="relative bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <textarea
                      value={schema}
                      onChange={(e) => setSchema(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Paste your OpenAPI schema or URL here..."
                      className="w-full h-40 px-4 py-4 bg-transparent text-gray-900 placeholder-gray-400 resize-none focus:outline-none text-base leading-relaxed pr-16"
                    />
                    <button
                      onClick={handleSubmit}
                      disabled={!schema.trim()}
                      className="absolute bottom-3 right-3 flex items-center justify-center w-8 h-8 bg-black text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="mt-3 text-center text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      Press
                      <kbd className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 font-mono">
                        Enter
                      </kbd>
                      to convert or
                      <kbd className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 font-mono">
                        Shift
                      </kbd>
                      <kbd className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 font-mono">
                        Enter
                      </kbd>
                      for new line
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div className="p-6 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-5 h-5 text-gray-700"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <h3 className="font-medium mb-2 text-gray-900">
                      Lightning Fast
                    </h3>
                    <p className="text-sm text-gray-600">
                      Convert schemas in seconds with our optimized parser
                    </p>
                  </div>
                  <div className="p-6 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-5 h-5 text-gray-700"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="font-medium mb-2 text-gray-900">
                      Fully Compatible
                    </h3>
                    <p className="text-sm text-gray-600">
                      Works with Claude, Cursor, and all MCP-enabled tools
                    </p>
                  </div>
                  <div className="p-6 bg-gray-50 rounded-lg border border-gray-100">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
                      <svg
                        className="w-5 h-5 text-gray-700"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                        />
                      </svg>
                    </div>
                    <h3 className="font-medium mb-2 text-gray-900">
                      Open Source
                    </h3>
                    <p className="text-sm text-gray-600">
                      Free, open-source, and community-driven
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Success State */}
                <div className="text-center mb-10">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-black rounded-lg mb-6">
                    <svg
                      className="w-6 h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h2 className="text-3xl font-semibold mb-3 text-black">
                    Package Generated Successfully!
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Your MCP package{" "}
                    <code className="bg-gray-100 px-3 py-1 rounded-md text-black font-mono text-sm border border-gray-200">
                      {packageName}
                    </code>{" "}
                    is ready to use
                  </p>
                </div>

                {/* Installation Steps */}
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white font-medium text-xs">
                        1
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Install the package
                      </h3>
                    </div>
                    <CodeBlock
                      code={`npm install ${packageName}`}
                      language="bash"
                    />
                  </div>

                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white font-medium text-xs">
                        2
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Configure Claude Desktop
                      </h3>
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                      Add this configuration to your{" "}
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs border border-gray-200 font-mono">
                        claude_desktop_config.json
                      </code>{" "}
                      file:
                    </p>
                    <CodeBlock
                      code={JSON.stringify(mcpConfig, null, 2)}
                      language="json"
                    />
                  </div>

                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white font-medium text-xs">
                        3
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Restart and enjoy
                      </h3>
                    </div>
                    <p className="text-gray-600">
                      Restart Claude Desktop to load your new MCP server. Your
                      API tools will be available in any conversation.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-6">
                    <button
                      onClick={() => {
                        setSubmitted(false);
                        setSchema("");
                        setPackageName("");
                      }}
                      className="flex-1 px-6 py-3 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors border border-gray-200 font-medium"
                    >
                      Convert Another Schema
                    </button>
                    <button className="flex-1 px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 transition-colors font-medium">
                      View Documentation
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
