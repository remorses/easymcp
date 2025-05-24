# OpenAPI Documentation Extractor

A Python tool that extracts OpenAPI documentation from sitemap URLs and converts it into valid OpenAPI 3.0 specifications.

## Features

- ✅ Extract URLs from XML sitemaps
- ✅ Process markdown files for OpenAPI YAML content
- ✅ Convert custom OpenAPI formats to standard OpenAPI 3.0
- ✅ Generate both JSON and YAML output formats
- ✅ Command-line interface with multiple options
- ✅ Automatic URL validation and protocol handling
- ✅ Comprehensive error handling and logging
- ✅ Verbose mode for detailed processing information

## Installation

1. Clone or download this repository
2. Install the required dependencies:

```bash
pip install -r requirements.txt
``` 

## Usage 

### Basic Usage 

```bash 
python openapi_extractor.py [site_map_url]
``` 

### Command Line Options
```bash
python openapi_extractor.py [SITEMAP_URL] [OPTIONS]
``` 

#### Arguments

- **SITEMAP_URL** - URL of the sitemap XML file (required)

#### Options

- **-o, --output PREFIX** - Custom output filename prefix
- **--json-only** - Save only JSON format (skip YAML)
- **--yaml-only** - Save only YAML format (skip JSON)
- **-v, --verbose** - Enable verbose output for detailed processing information
- **-h, --help** - Show help message and exit
