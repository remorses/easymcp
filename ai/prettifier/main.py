import yaml
import os
import json
from pathlib import Path
from typing import Dict, List, Any, Union
from anthropic import Anthropic, Client

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

Your output should be a valid OpenAPI specification that is ready for MCP server conversion. Focus on making the API more robust, well-documented, and easier to implement."""


# Global variable for data directory
DATA_SPLIT_DIR = Path("ai/data")
DATA_SOURCE_PATH = Path("openapis/results")

MAXIMUM_CHUNK_SIZE = 4000

# Initialize Anthropic client
client = Anthropic()

MODEL = "claude-sonnet-4-20250514"

def call_claude(content: str) -> str:
    """Call Claude to prettify the content."""
    response = client.messages.create(
        model=MODEL,
        messages=[{"role": "user", "content": content}],
        max_tokens=MAXIMUM_CHUNK_SIZE
    )
    return response.content[0].text

def count_tokens(content: str) -> int:
    response = client.messages.count_tokens(
        model=MODEL,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    tokens = json.loads(response.json())["input_tokens"]

    return tokens

def split(filename: str) -> None:
    """
    Split a file into smaller chunks that fit within the specified token limit.
    
    Args:
        file_path: Path to the input file
        max_chunk_size: Maximum number of tokens per chunk (default: 4000)
    """
    if file_name.endswith(".json"):
        raise ValueError(f"{file_name} is not a json file. Provide json file.")

    # Get domain from filename
    file_path = DATA_SOURCE_PATH / filename
    file_name = file_path.stem
    
    # Create output directory
    output_dir = DATA_SPLIT_DIR / file_name
    output_dir.mkdir(parents=True, exist_ok=True)
    
    content = json.load(f)
    # transform content to string
    content = json.dumps(content)
    num_tokens = count_tokens(content)
    
    # If content is small enough, write it directly
    if num_tokens <= MAXIMUM_CHUNK_SIZE:
        prettified_content = call_claude(content)
        with open(output_dir / f"{file_name}.json", 'w') as f:
            if is_json:
                json.dump(prettified_content, f, indent=2)
            else:
                yaml.dump(prettified_content, f, sort_keys=False)
        return


    print(f"Large context {num_tokens}: not yet implemented")
    return

if __name__ == "__main__":
    split("/Users/andrea/Desktop/modelcontext/openapis/results/bey_dev_api.yaml")