"use client";
import "prismjs/themes/prism.css";
import "prismjs";
import Prism from "prismjs";


import { useEffect, useState, useRef } from "react";
import { Form, useActionData, useNavigation } from "react-router";

interface Generation {
  id: string;
  title: string;
  timestamp: Date;
  packageName: string;
}
import { publishNpmPackage } from "modelcontextutils/src/lib/npm-publish";

// Add type definition for publishNpmPackage
interface PublishNpmPackageParams {
  packageName: string;
  openapiSchema: string;
  version?: string;
  npmUser?: string;
}

function generatePackageName(schema: any): string {
  try {
    const title = schema?.info?.title || "openapi-mcp";
    // Convert to lowercase, replace spaces and special chars with hyphens, remove multiple hyphens
    const safeName = title
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    // Ensure it starts with a letter or number
    const validName = safeName.match(/^[a-z0-9]/)
      ? safeName
      : `mcp-${safeName}`;

    // Add mcp prefix if not present
    return validName;
  } catch {
    return "mcp-openapi-package";
  }
}

function safeJsonParse(jsonString: string): any | null {
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}
export async function action({ request }: { request: Request }) {
  console.log("Received request:", request.method, request.url);
  const formData = await request.formData();
  const schema = formData.get("schema") as string;
  const npmUser = formData.get("npmUser") as string;
  const npmApiKey = formData.get("npmApiKey") as string;
  console.log("Received schema:", schema?.slice(0, 100) + (schema?.length > 100 ? "..." : ""));
  if (!schema?.trim()) {
    return { error: "Schema required" };
  }
  const parsed = safeJsonParse(schema);
  console.log("Parsed schema:", parsed);
  if (!parsed) {
    throw new Error("Invalid JSON");
  }
  const packageName = generatePackageName(parsed);
  console.log("Generated package name:", packageName);
  const res = await publishNpmPackage({
    openapiSchema: schema,
    packageName,
    npmUser,
    npmApiKey,
  });
  console.log("publishNpmPackage result:", res);

  return {
    packageName: res.packageName,
    schemaTitle: schema.slice(0, 30) + (schema.length > 30 ? "..." : ""),
    requiresApiToken: true,
    timestamp: Date.now(),
  };
}

export default function OpenAPIMCPLanding() {
  const actionData = useActionData() as
    | {
        packageName: string;
        schemaTitle: string;
        requiresApiToken?: boolean;
        timestamp: number;
      }
    | undefined;

  const navigation = useNavigation();

  const schemaTextAreaRef = useRef<HTMLTextAreaElement>(null);

  const handleSchemaDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (
        schemaTextAreaRef.current &&
        typeof event.target?.result === "string"
      ) {
        // schemaTextAreaRef.current.value = event.target.result;
        setSchemaInput(event.target.result);
      }
    };
    reader.readAsText(file);
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
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

  // Add action result to history if present and not there yet
  useEffect(() => {
    if (
      actionData?.packageName &&
      !generations.find((g) => g.packageName === actionData.packageName)
    ) {
      setGenerations([
        {
          id: String(actionData.timestamp),
          title: actionData.schemaTitle,
          timestamp: new Date(actionData.timestamp),
          packageName: actionData.packageName,
        },
        ...generations,
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData?.packageName]);

  const [showToolSelect, setShowToolSelect] = useState(false);
  const [toolChoices, setToolChoices] = useState<any[]>([]);
  const [selectedTools, setSelectedTools] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [parsedSchema, setParsedSchema] = useState<any | null>(null);
  const [schemaInput, setSchemaInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isContinueLoading, setIsContinueLoading] = useState(false);
  const [dotCount, setDotCount] = useState(1);

  // Animate dots for loading
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isContinueLoading) {
      interval = setInterval(() => {
        setDotCount((prev) => (prev % 3) + 1);
      }, 500);
    } else {
      setDotCount(1);
    }
    return () => clearInterval(interval);
  }, [isContinueLoading]);

  // Extract tools from OpenAPI schema
  function extractTools(schema: any) {
    if (!schema?.paths) return [];
    const tools: any[] = [];
    const tagSet = new Set<string>();
    for (const [apiPath, methods] of Object.entries(schema.paths)) {
      for (const [method, operation] of Object.entries(methods as any)) {
        if (method === "parameters") continue;
        const op = operation as any;
        const functionName = op.operationId || `${method.toUpperCase()} ${apiPath}`;
        const description = op.summary || op.description || "";
        const tags = op.tags || [];
        tags.forEach((tag: string) => tagSet.add(tag));
        tools.push({
          key: `${method.toUpperCase()} ${apiPath}`,
          value: { path: apiPath, method: method.toLowerCase() },
          label: functionName,
          description,
          tags,
        });
      }
    }
    setAllTags(Array.from(tagSet));
    return tools;
  }

  // Handle schema input change
  const handleSchemaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSchemaInput(e.target.value);
    setError(null);
  };

  // Handle "Generate MCP Server" click
  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let parsed: any;
    try {
      parsed = JSON.parse(schemaInput);
    } catch {
      setError("Invalid JSON");
      return;
    }
    setParsedSchema(parsed);
    const tools = extractTools(parsed);
    if (tools.length === 0) {
      setError("No tools found in schema");
      return;
    }
    setToolChoices(tools);
    setSelectedTools(tools.map((t) => t.key)); // default: all selected
    setShowToolSelect(true);
  };

  // Handle tool selection change
  const handleToolCheckbox = (key: string) => {
    setSelectedTools((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Handle tag click
  const handleTagClick = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) {
        // Remove tag
        const newTags = prev.filter((t) => t !== tag);
        // Deselect all tools with this tag
        setSelectedTools((prevTools) => {
          const toolsWithTag = toolChoices.filter((tool) => tool.tags.includes(tag)).map((tool) => tool.key);
          return prevTools.filter((key) => !toolsWithTag.includes(key));
        });
        return newTags;
      } else {
        // Add tag
        // Select all tools with this tag
        setSelectedTools((prevTools) => {
          const toolsWithTag = toolChoices.filter((tool) => tool.tags.includes(tag)).map((tool) => tool.key);
          return Array.from(new Set([...prevTools, ...toolsWithTag]));
        });
        return [...prev, tag];
      }
    });
  };

  // When toolChoices changes, update selectedTags to include tags of all selected tools
  useEffect(() => {
    // If no tags are selected, select all tags by default
    if (toolChoices.length > 0 && selectedTags.length === 0 && allTags.length > 0) {
      setSelectedTags(allTags);
    }
  }, [toolChoices, allTags]);

  // Sort tools: first those with selected tags, then the rest
  const sortedToolChoices = [
    ...toolChoices.filter((tool) => tool.tags.some((tag: string) => selectedTags.includes(tag))),
    ...toolChoices.filter((tool) => !tool.tags.some((tag: string) => selectedTags.includes(tag))),
  ].filter((tool, idx, arr) => arr.findIndex(t => t.key === tool.key) === idx); // remove duplicates

  const CodeBlock = ({
    code,
    language,
  }: {
    code: string;
    language: string;
  }) => {
    const codeRef = useRef<HTMLElement>(null);

    useEffect(() => {
      if (codeRef.current) {
        Prism.highlightElement(codeRef.current);
      }
    }, [code, language]);

    return (
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
        <pre className={`language-${language} text-gray-900 text-sm leading-relaxed`}>
          <code
            ref={codeRef}
            className={`language-${language}`}
          >
            {code}
          </code>
        </pre>
      </div>
    );
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  const AccountModal = ({
    isOpen,
    onClose,
    onSave,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (npmUser: string, npmApiKey: string) => void;
  }) => {
    const [npmUser, setNpmUser] = useState("");
    const [npmApiKey, setNpmApiKey] = useState("");

    useEffect(() => {
      if (isOpen) {
        setNpmUser(localStorage.getItem("npmUser") || "");
        setNpmApiKey(localStorage.getItem("npmApiKey") || "");
      }
    }, [isOpen]);

    const handleSave = () => {
      localStorage.setItem("npmUser", npmUser);
      localStorage.setItem("npmApiKey", npmApiKey);
      onSave(npmUser, npmApiKey);
      onClose();
    };

    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center z-50">
        <div className="p-8 border w-96 shadow-lg rounded-md bg-white">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-900">Account Settings</h3>
            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="npmUser"
                  className="block text-sm font-medium text-gray-700 text-left mb-1"
                >
                  NPM Username
                </label>
                <input
                  type="text"
                  name="npmUser"
                  id="npmUser"
                  value={npmUser}
                  onChange={(e) => setNpmUser(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-black focus:border-black sm:text-sm"
                  placeholder="your-npm-username"
                />
              </div>
              <div>
                <label
                  htmlFor="npmApiKey"
                  className="block text-sm font-medium text-gray-700 text-left mb-1"
                >
                  NPM API Key
                </label>
                <input
                  type="password" /* Use password type for API keys */
                  name="npmApiKey"
                  id="npmApiKey"
                  value={npmApiKey}
                  onChange={(e) => setNpmApiKey(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-black focus:border-black sm:text-sm"
                  placeholder="your-npm-api-key"
                />
              </div>
            </div>
            <div className="mt-8 flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
          <Form method="post" replace>
            <button
              type="submit"
              name="_reset"
              value="1"
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
          </Form>
          <div className="space-y-1">
            {generations.map((gen) => (
              <div
                key={gen.id}
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
              </div>
            ))}
          </div>
        </div>
        {/* Account Button */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => setShowAccountModal(true)}
            className="w-full p-3 text-left rounded-md border border-gray-200 hover:bg-white transition-colors flex items-center gap-3"
          >
            {/* You can replace this SVG with a more appropriate icon for "Account" */}
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
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <span className="text-sm text-gray-600">Account</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Account Modal */}
        <AccountModal
          isOpen={showAccountModal}
          onClose={() => setShowAccountModal(false)}
          onSave={(npmUser, npmApiKey) => {
            console.log("NPM User:", npmUser);
            console.log("NPM API Key:", npmApiKey);
            // Later, we will use these to update the README or other logic
          }}
        />
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
            {!actionData?.packageName ? (
              <>
                {/* Welcome Message */}
                <div className="text-center mb-12">
                  <div className="mb-6"></div>
                  <img src="/logo.png" alt="Logo" className="mx-auto mb-4" style={{ maxWidth: 400, height: "auto" }} />
                  <p className="text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
                    Convert any OpenAPI specification into a Model Context
                    Protocol (MCP) package that works seamlessly with Cursor,
                    Claude, MCP Client, and other AI tools.
                  </p>
                </div>
                {/* Input Area */}
                {!showToolSelect ? (
                  <form onSubmit={handlePreSubmit}>
                    <div className="relative mb-8">
                      <div className="relative bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                        <textarea
                          name="schema"
                          ref={schemaTextAreaRef}
                          value={schemaInput}
                          onChange={handleSchemaChange}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              (e.currentTarget.form as any)?.requestSubmit();
                            }
                          }}
                          onDrop={handleSchemaDrop}
                          onDragOver={(e) => e.preventDefault()}
                          placeholder="Paste your OpenAPI schema or URL here or drop your schema file…"
                          className="w-full h-40 px-4 py-4 bg-transparent text-gray-900 placeholder-gray-400 resize-none focus:outline-none text-base leading-relaxed pr-16"
                          required
                        />
                        <button
                          type="submit"
                          className="absolute bottom-3 right-3 flex items-center justify-center px-2 h-8 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                          disabled={navigation.state === "submitting" || navigation.state === "loading"}
                        >
                          {navigation.state === "submitting" || navigation.state === "loading"
                            ? "Loading..."
                            : "Generate MCP Server"}
                        </button>
                      </div>
                      {error && <div className="text-red-600 mt-2 text-sm">{error}</div>}
                      <div className="mt-3 text-center text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          Press
                          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 font-mono">Enter</kbd>
                          to convert or
                          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 font-mono">Shift</kbd>
                          <kbd className="px-2 py-1 bg-gray-100 rounded text-xs border border-gray-200 font-mono">Enter</kbd>
                          for new line
                        </span>
                      </div>
                    </div>
                  </form>
                ) : (
                  <Form method="post" replace>
                    {/* Hidden input to pass the filtered schema data to the action */}
                    <input type="hidden" name="schema" value={JSON.stringify({
                       ...parsedSchema,
                       paths: Object.fromEntries(
                         toolChoices
                           .filter(tool => selectedTools.includes(tool.key))
                           .map(tool => [tool.value.path, { ...parsedSchema.paths[tool.value.path], [tool.value.method]: parsedSchema.paths[tool.value.path][tool.value.method] }])
                           .reduce((acc, [path, methods]) => {
                              if (!acc.has(path)) acc.set(path, {});
                              Object.assign(acc.get(path), methods);
                              return acc;
                           }, new Map())
                           )
                    })} />
                    <input type="hidden" name="npmUser" value={localStorage.getItem("npmUser") || ""} />
                    <input type="hidden" name="npmApiKey" value={localStorage.getItem("npmApiKey") || ""} />
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
                      <h3 className="text-lg font-semibold mb-4">Select tools to include</h3>
                      {/* Tag filter bar */}
                      {allTags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                          {allTags.map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${selectedTags.includes(tag) ? 'bg-black text-white border-black' : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'}`}
                              onClick={() => handleTagClick(tag)}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="max-h-64 overflow-y-auto mb-6">
                        {sortedToolChoices.map((tool) => (
                          <label key={tool.key} className="flex items-start gap-2 py-2 cursor-pointer border-b border-gray-100 last:border-b-0">
                            <input
                              type="checkbox"
                              checked={selectedTools.includes(tool.key)}
                              onChange={() => handleToolCheckbox(tool.key)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-sm text-gray-900 flex items-center gap-2">
                                {tool.label}
                                {tool.tags && tool.tags.length > 0 && (
                                  <span className="flex flex-wrap gap-1 ml-2">
                                    {tool.tags.map((tag: string) => (
                                      <span key={tag} className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs font-medium">
                                        {tag}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </div>
                              {tool.description && (
                                <div className="text-xs text-gray-500 mt-0.5">{tool.description}</div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-4">
                        <button
                          type="submit"
                          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 flex items-center justify-center min-w-[120px]"
                          disabled={selectedTools.length === 0 || isContinueLoading}
                        >
                          {isContinueLoading
                            ? `Continue${'.'.repeat(dotCount)}`
                            : 'Continue'}
                        </button>
                        <button
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          onClick={() => setShowToolSelect(false)}
                        >
                          Back
                        </button>
                      </div>
                      {selectedTools.length === 0 && (
                        <div className="text-red-600 mt-2 text-sm">Select at least one tool.</div>
                      )}
                    </div>
                  </Form>
                )}
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
                      {actionData.packageName}
                    </code>{" "}
                    is ready to use!
                  </p>
                </div>

                {/* Usage Steps */}
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white font-medium text-xs">
                        1
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Add to your MCP tool config
                      </h3>
                    </div>
                    <p className="text-gray-600 text-sm mb-4">
                      Add this configuration to your{" "}
                      <code className="bg-gray-100 px-2 py-1 rounded text-xs border border-gray-200 font-mono">
                        claude_desktop_config.json
                      </code>{" "}
                      or your MCP tool's equivalent config:
                    </p>
                    <CodeBlock
                      code={JSON.stringify(
                        {
                          mcpServers: {
                            [actionData.packageName]: {
                              command: "npx",
                              args: ["-y", actionData.packageName],
                              env: {
                                API_TOKEN: "<your api token>",
                              },
                            },
                          },
                        },
                        null,
                        2,
                      )}
                      language="js"
                    />
                    {actionData.requiresApiToken && (
                      <div className="mt-4 text-sm text-blue-700">
                        <strong>Note:</strong> This package could require an API
                        token. Set the appropriate <code>API_TOKEN</code> value
                        in your MCP server's environment
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-6 h-6 bg-black rounded-full flex items-center justify-center text-white font-medium text-xs">
                        2
                      </div>
                      <h3 className="text-lg font-medium text-gray-900">
                        Supported in many tools
                      </h3>
                    </div>
                    <p className="text-gray-600">
                      The MCP package works with Cursor, Claude, MCP Client
                      (open source), and any other MCP-enabled tools.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <Form method="post" replace>
                    <div className="flex flex-col sm:flex-row gap-3 pt-6">
                      <button
                        type="submit"
                        name="_reset"
                        value="1"
                        className="flex-1 px-6 py-3 bg-white text-gray-700 rounded-md hover:bg-gray-50 transition-colors border border-gray-200 font-medium"
                      >
                        Convert Another Schema
                      </button>
                      <button
                        type="button"
                        className="flex-1 px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800 transition-colors font-medium"
                      >
                        View Documentation
                      </button>
                    </div>
                  </Form>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
