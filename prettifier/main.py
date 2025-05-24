import yaml
import os
import json
from pathlib import Path
from typing import Dict, List, Any, Union
from anthropic import Anthropic, Client
import json_repair

SYSTEM_PROMPT = """You are an expert API designer specializing in enhancing OpenAPI specifications for Model Context Protocol (MCP) server conversion. Your task is to improve the specification by:

1. Enhancing descriptions:
   - Add detailed, clear descriptions for all endpoints
   - Include usage examples where relevant
   - Document error cases and their handling
   - Add parameter validation rules and constraints

2. Adding MCP-specific improvements:
   - Ensure all endpoints have proper authentication schemes
   - Add rate limiting information
   - Include pagination details where applicable
   - Document response caching strategies
   - Add proper error response schemas

3. Structural improvements:
   - Organize endpoints logically
   - Add proper tags and grouping
   - Ensure consistent naming conventions
   - Add proper security schemes
   - Include proper versioning information

4. Documentation enhancements:
   - Add proper summary fields
   - Include operation IDs
   - Document all possible response codes
   - Add proper schema references
   - Include proper examples

Your output should be a valid OpenAPI specification that is ready for MCP server conversion. Focus on making the API more robust, well-documented, and easier to implement.
RETURN ONLY THE FINAL JSON.

"""

CONTENT_PROMPT = """OpenAPI file:
{CONTENT}
"""

# Global variable for data directory
PROJECT_DIR = Path(__file__).parent.parent
DATA_SOURCE_PATH = PROJECT_DIR / "openapis/results"

MAXIMUM_CHUNK_SIZE = 20000
MAX_OUTPUT = 8000

# Initialize Anthropic client
client = Anthropic()

CLAUDE = "claude-sonnet-4-20250514"
GEMINI = "gemini-2.5-flash-preview-05-20"


def call_gemini(content:str) -> str:
    print(f"Calling {GEMINI}!")
    from google import genai
    
    api_key = os.getenv("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model=GEMINI, contents=SYSTEM_PROMPT + CONTENT_PROMPT.format(CONTENT=content)
    )

    print("Gemini: Calling finshed!")
    return response.text

def call_claude(content: str) -> str:
    """Call Claude to prettify the content."""
    print(f"Calling {CLAUDE}!")
    response = client.messages.create(
        model=CLAUDE,
        messages=[{"role": "user", "content": SYSTEM_PROMPT + CONTENT_PROMPT.format(CONTENT=content)}],
        max_tokens=MAX_OUTPUT
    )
    print("Claude: Calling finshed!")
    return response.content[0].text

def count_tokens(content: str) -> int:
    response = client.messages.count_tokens(
        model=CLAUDE,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    tokens = json.loads(response.model_dump_json())["input_tokens"]

    return tokens

def prettify(input_file: str) -> None:
    """
    Split a file into smaller chunks that fit within the specified token limit.
    
    Args:
        file_path: Path to the input file
        max_chunk_size: Maximum number of tokens per chunk (default: 4000)
    """
    if not input_file.endswith(".json"):
        raise ValueError(f"{input_file} is not a json file.")

    # Get domain from filename
    file_path = DATA_SOURCE_PATH / input_file
    file_name = file_path.stem
    
    with open(file_path, 'r') as f:
        content = json.load(f)
        content = json.dumps(content)
    
    num_tokens = count_tokens(content)
    
    if num_tokens <= MAXIMUM_CHUNK_SIZE:
        prettified_content = call_claude(content)
    else:
        prettified_content = call_gemini(content)
    
    # Remove markdown code block markers if present
    prettified_content = prettified_content.strip()
    if prettified_content.startswith('```json'):
        prettified_content = prettified_content[7:]
    if prettified_content.endswith('```'):
        prettified_content = prettified_content[:-3]
    prettified_content = prettified_content.strip()

    with open(DATA_SOURCE_PATH / f"{file_name}_debug.txt", 'w') as f:
        f.write(prettified_content)
    
    try:
        extracted_content = json.loads(prettified_content)
    except:
        extracted_content = json_repair.repair_json(prettified_content, return_objects=True)

    with open(DATA_SOURCE_PATH / f"{file_name}_pretty.json", 'w') as f:
        json.dump(extracted_content, f)
            
    return


if __name__ == "__main__":
    prettify("cal.json")