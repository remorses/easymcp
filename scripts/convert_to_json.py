#!/usr/bin/env python3

import json
import yaml
import os
import glob
from pathlib import Path

def ensure_directory(directory):
    """Create directory if it doesn't exist"""
    Path(directory).mkdir(parents=True, exist_ok=True)

def convert_to_json(input_file, output_dir):
    """Convert YAML or JSON file to JSON"""
    # Get the base filename without extension
    base_name = os.path.splitext(os.path.basename(input_file))[0]
    output_file = os.path.join(output_dir, f"{base_name}.json")
    
    print(f"Converting {input_file} to {output_file}")
    
    try:
        # Read the input file
        with open(input_file, 'r') as f:
            if input_file.endswith('.yml') or input_file.endswith('.yaml'):
                data = yaml.safe_load(f)
            else:
                data = json.load(f)
        
        # Write to JSON
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)
            
        print(f"Successfully converted {input_file}")
            
    except Exception as e:
        print(f"Error processing {input_file}: {str(e)}")

def main():
    input_dir = "data/openapis/inputs"
    output_dir = "data/openapis/jsons"
    
    # Ensure output directory exists
    ensure_directory(output_dir)
    
    # Process all yaml, yml, and json files
    input_files = glob.glob(os.path.join(input_dir, "*.yml"))
    input_files.extend(glob.glob(os.path.join(input_dir, "*.yaml")))
    input_files.extend(glob.glob(os.path.join(input_dir, "*.json")))
    
    for input_file in input_files:
        convert_to_json(input_file, output_dir)

if __name__ == "__main__":
    main() 