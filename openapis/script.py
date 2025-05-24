import requests 
import xml.etree.ElementTree as ET
import re
import yaml
import json
import argparse
import sys
import os
from datetime import datetime
from urllib.parse import urlparse

def validate_url(url):
    """
    Validate if the URL is properly formatted.
    
    Args:
        url (str): URL to validate
        
    Returns:
        str: Validated URL with protocol
    """
    if not url:
        raise argparse.ArgumentTypeError("URL cannot be empty")
    
    # Add https:// if no protocol specified
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    # Basic URL validation
    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            raise argparse.ArgumentTypeError(f"Invalid URL format: {url}")
    except Exception:
        raise argparse.ArgumentTypeError(f"Invalid URL format: {url}")
    
    return url

def extract_links_from_sitemap(sitemap_url):
    """
    Extract all URLs from a sitemap XML file.
    
    Args:
        sitemap_url (str): URL of the sitemap XML file
        
    Returns:
        list: List of extracted URLs
    """
    try:
        print(f"Fetching sitemap from: {sitemap_url}")
        response = requests.get(sitemap_url, timeout=30)
        response.raise_for_status()

        root = ET.fromstring(response.content)
        
        # Handle different sitemap formats
        namespaces = {
            'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
            'sitemap': 'http://www.sitemaps.org/schemas/sitemap/0.9'
        }
        
        urls = []
        
        # Try different namespace patterns
        for ns_prefix, ns_uri in namespaces.items():
            namespace = {ns_prefix: ns_uri}
            url_elements = root.findall(f'.//{ns_prefix}:url', namespace)
            
            if url_elements:
                for url_element in url_elements:
                    loc_element = url_element.find(f'{ns_prefix}:loc', namespace)
                    if loc_element is not None:
                        urls.append(loc_element.text)
                break
        
        # Fallback: try without namespace
        if not urls:
            for url_element in root.findall('.//url'):
                loc_element = url_element.find('loc')
                if loc_element is not None:
                    urls.append(loc_element.text)
        
        return urls
        
    except requests.RequestException as e:
        print(f"Error fetching sitemap: {e}")
        return []
    except ET.ParseError as e:
        print(f"Error parsing XML: {e}")
        return []
    except Exception as e:
        print(f"Unexpected error: {e}")
        return []

def extract_openapi_yaml_from_markdown(content):
    """
    Extract OpenAPI YAML content from markdown.
    
    Args:
        content (str): The markdown content
        
    Returns:
        str: The extracted YAML content or None if not found
    """
    # Look for YAML code blocks that contain OpenAPI content
    yaml_pattern = r'```+yaml[^`]*?(?:GET|POST|PUT|DELETE|PATCH) /.*?\n(.*?)```+'
    
    match = re.search(yaml_pattern, content, re.DOTALL)
    if match:
        yaml_content = match.group(1).strip()
        return yaml_content
    
    # Alternative pattern - look for content after "## OpenAPI" heading
    openapi_pattern = r'## OpenAPI\s*```+yaml[^`]*?\n(.*?)```+'
    match = re.search(openapi_pattern, content, re.DOTALL)
    if match:
        yaml_content = match.group(1).strip()
        return yaml_content
    
    return None

def yaml_to_json(yaml_content):
    """
    Convert YAML content to JSON.
    
    Args:
        yaml_content (str): YAML string
        
    Returns:
        dict: Parsed JSON object or None if parsing fails
    """
    try:
        return yaml.safe_load(yaml_content)
    except yaml.YAMLError as e:
        print(f"Error parsing YAML: {e}")
        return None

def process_url_for_openapi(url):
    """
    Process a URL to extract OpenAPI content and convert to JSON.
    
    Args:
        url (str): The original URL
        
    Returns:
        dict: Result information
    """
    md_url = url + ".md"
    
    try:
        response = requests.get(md_url, timeout=10)
        response.raise_for_status()
        
        content = response.text
        
        # Check if content contains openapi
        if "openapi" not in content.lower():
            return {
                'url': url,
                'md_url': md_url,
                'has_openapi': False,
                'openapi_json': None,
                'error': None
            }
        
        # Extract YAML content
        yaml_content = extract_openapi_yaml_from_markdown(content)
        
        if not yaml_content:
            return {
                'url': url,
                'md_url': md_url,
                'has_openapi': True,
                'openapi_json': None,
                'error': 'Could not extract YAML content'
            }
        
        # Convert to JSON
        json_data = yaml_to_json(yaml_content)
        
        return {
            'url': url,
            'md_url': md_url,
            'has_openapi': True,
            'openapi_json': json_data,
            'error': None if json_data else 'Failed to parse YAML'
        }
        
    except requests.RequestException as e:
        return {
            'url': url,
            'md_url': md_url,
            'has_openapi': False,
            'openapi_json': None,
            'error': f"Request error: {str(e)}"
        }

def convert_to_openapi_format(openapi_data_list, base_url):
    """
    Convert extracted OpenAPI data to valid OpenAPI 3.0 format.
    
    Args:
        openapi_data_list (list): List of extracted OpenAPI data
        base_url (str): Base URL for the API server
        
    Returns:
        dict: Valid OpenAPI 3.0 specification
    """
    # Extract domain from sitemap URL for API base
    parsed_url = urlparse(base_url)
    api_base = f"{parsed_url.scheme}://api.{parsed_url.netloc.replace('docs.', '').replace('www.', '')}"
    
    openapi_spec = {
        "openapi": "3.0.0",
        "info": {
            "title": f"API Documentation",
            "description": f"API documentation extracted from {base_url}",
            "version": "1.0.0",
            "contact": {
                "url": base_url.replace('sitemap.xml', '')
            }
        },
        "servers": [
            {
                "url": api_base,
                "description": "Production server"
            }
        ],
        "paths": {},
        "components": {
            "schemas": {},
            "securitySchemes": {
                "APIKeyHeader": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "x-api-key",
                    "description": "API Key for authentication"
                }
            }
        }
    }
    
    for data in openapi_data_list:
        openapi_json = data['openapi_json']
        
        if not openapi_json:
            continue
            
        # Extract path information
        if 'paths' in openapi_json:
            path_info = openapi_json['paths']
            path = path_info.get('path', '')
            method = path_info.get('method', 'get').lower()
            
            # Initialize path in spec if not exists
            if path not in openapi_spec['paths']:
                openapi_spec['paths'][path] = {}
            
            # Convert the custom format to OpenAPI format
            operation = {}
            
            # Add operation ID and tags
            operation['operationId'] = f"{method}_{path.replace('/', '_').replace('-', '_').strip('_')}"
            operation['tags'] = [path.split('/')[2] if len(path.split('/')) > 2 else 'default']
            
            # Add security
            if 'request' in path_info and 'security' in path_info['request']:
                operation['security'] = [{"APIKeyHeader": []}]
            
            # Add parameters
            if 'request' in path_info and 'parameters' in path_info['request']:
                params = path_info['request']['parameters']
                operation['parameters'] = []
                
                # Add query parameters
                if 'query' in params and params['query']:
                    for param_name, param_info in params['query'].items():
                        operation['parameters'].append({
                            'name': param_name,
                            'in': 'query',
                            'schema': {'type': param_info.get('type', 'string')},
                            'description': param_info.get('description', '')
                        })
                
                # Add path parameters
                if 'path' in params and params['path']:
                    for param_name, param_info in params['path'].items():
                        operation['parameters'].append({
                            'name': param_name,
                            'in': 'path',
                            'required': True,
                            'schema': {'type': param_info.get('type', 'string')},
                            'description': param_info.get('description', '')
                        })
            
            # Add responses
            if 'response' in path_info:
                operation['responses'] = {}
                for status_code, response_info in path_info['response'].items():
                    operation['responses'][status_code] = {
                        'description': response_info.get('description', 'Success')
                    }
                    
                    if 'application/json' in response_info:
                        operation['responses'][status_code]['content'] = {
                            'application/json': {
                                'schema': {}
                            }
                        }
                        
                        # Handle schema array
                        if 'schemaArray' in response_info['application/json']:
                            schema_array = response_info['application/json']['schemaArray']
                            if schema_array and len(schema_array) > 0:
                                operation['responses'][status_code]['content']['application/json']['schema'] = schema_array[0]
                        
                        # Add examples
                        if 'examples' in response_info['application/json']:
                            operation['responses'][status_code]['content']['application/json']['examples'] = response_info['application/json']['examples']
            
            openapi_spec['paths'][path][method] = operation
        
        # Extract components/schemas
        if 'components' in openapi_json and 'schemas' in openapi_json['components']:
            openapi_spec['components']['schemas'].update(openapi_json['components']['schemas'])
    
    return openapi_spec

def main():
    parser = argparse.ArgumentParser(
        description='Extract OpenAPI documentation from sitemap URLs',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python script.py https://docs.bey.dev/sitemap.xml
  python script.py docs.example.com/sitemap.xml
  python script.py https://api-docs.company.com/sitemap.xml --output my_api
        '''
    )
    
    parser.add_argument(
        'sitemap_url',
        type=validate_url,
        help='URL of the sitemap XML file'
    )
    
    parser.add_argument(
        '-o', '--output',
        type=str,
        default=None,
        help='Output filename prefix (default: auto-generated based on domain)'
    )
    
    parser.add_argument(
        '--json-only',
        action='store_true',
        help='Save only JSON format (skip YAML)'
    )
    
    parser.add_argument(
        '--yaml-only',
        action='store_true',
        help='Save only YAML format (skip JSON)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Enable verbose output'
    )
    
    args = parser.parse_args()
    
    # Validate conflicting arguments
    if args.json_only and args.yaml_only:
        print("❌ Error: Cannot specify both --json-only and --yaml-only")
        sys.exit(1)
    
    sitemap_url = args.sitemap_url
    
    print("=" * 80)
    print("OpenAPI Documentation Extractor")
    print("=" * 80)
    print(f"Sitemap URL: {sitemap_url}")
    
    # Extract URLs from sitemap
    urls = extract_links_from_sitemap(sitemap_url)
    
    if not urls:
        print("❌ No URLs found or error occurred.")
        sys.exit(1)
    
    print(f"Found {len(urls)} URLs. Processing each for OpenAPI content...")
    print("-" * 80)
    
    all_openapi_data = []
    
    for i, url in enumerate(urls, 1):
        if args.verbose:
            print(f"Processing {i}/{len(urls)}: {url}")
        else:
            print(f"Processing {i}/{len(urls)}...", end='\r')
        
        result = process_url_for_openapi(url)
        
        if result['error']:
            if args.verbose:
                print(f"  ❌ Error: {result['error']}")
        elif result['has_openapi'] and result['openapi_json']:
            if args.verbose:
                print(f"  ✅ OpenAPI content extracted")
            all_openapi_data.append(result)
        elif result['has_openapi']:
            if args.verbose:
                print(f"  ⚠️  Contains OpenAPI but failed to extract/parse")
    
    print()  # Clear the progress line
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    
    print(f"Total URLs processed: {len(urls)}")
    print(f"URLs with valid OpenAPI JSON: {len(all_openapi_data)}")
    
    if not all_openapi_data:
        print("❌ No OpenAPI content found to generate specification.")
        sys.exit(1)
    
    # Convert to valid OpenAPI format
    openapi_spec = convert_to_openapi_format(all_openapi_data, sitemap_url)
    
    print(f"Generated OpenAPI spec with {len(openapi_spec['paths'])} paths")
    print(f"Components schemas: {len(openapi_spec['components']['schemas'])}")
    
    # Determine output filename
    if args.output:
        base_filename = args.output
    else:
        # Generate filename from domain
        parsed_url = urlparse(sitemap_url)
        domain = parsed_url.netloc.replace('docs.', '').replace('www.', '').replace('.', '_')
        base_filename = f"{domain}_api"
    
    # Save files
    saved_files = []

    os.makedirs('results')
    
    if not args.yaml_only:
        # Save as JSON
        json_filename = f"results/{base_filename}.json"
        try:
            with open(json_filename, 'w') as f:
                json.dump(openapi_spec, f, indent=2)
            print(f"✅ OpenAPI JSON saved to: {json_filename}")
            saved_files.append(json_filename)
        except Exception as e:
            print(f"❌ Error saving JSON file: {e}")
    
    if not args.json_only:
        # Save as YAML
        yaml_filename = f"results/{base_filename}.yaml"
        try:
            with open(yaml_filename, 'w') as f:
                yaml.dump(openapi_spec, f, default_flow_style=False, indent=2)
            print(f"✅ OpenAPI YAML saved to: {yaml_filename}")
            saved_files.append(yaml_filename)
        except Exception as e:
            print(f"❌ Error saving YAML file: {e}")
    
    if saved_files:
        print(f"\n🎉 Successfully generated OpenAPI documentation!")
        print(f"📁 Files saved: {', '.join(saved_files)}")
        
        if args.verbose:
            # Display a preview
            print("\n" + "=" * 80)
            print("OPENAPI SPEC PREVIEW")
            print("=" * 80)
            print(json.dumps({
                "openapi": openapi_spec["openapi"],
                "info": openapi_spec["info"],
                "servers": openapi_spec["servers"],
                "paths": list(openapi_spec["paths"].keys()),
                "schemas": list(openapi_spec["components"]["schemas"].keys())
            }, indent=2))

if __name__ == "__main__":
    main()