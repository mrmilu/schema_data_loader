#!/bin/bash

# Default package path (current directory)
package_path="./"

# Function to display script usage
usage() {
  echo "Usage: $0 [-p|--path path/to/package.json]"
  exit 1
}

# Parse command-line arguments
while getopts ":p:-:" opt; do
  case $opt in
    p) package_path="$OPTARG" ;;
    -)
      case "${OPTARG}" in
        path=*) package_path="${OPTARG#*=}" ;;
        path) package_path="${!OPTIND}"; OPTIND=$((OPTIND + 1)) ;;
        *) echo "Invalid option: --$OPTARG" >&2; usage ;;
      esac
      ;;
    *) echo "Invalid option: -$opt" >&2; usage ;;
  esac
done

# Check if the specified package.json file exists
if [ -f "$package_path/package.json" ]; then
  # Use jq to extract the version field from package.json
  version=$(jq -r .version "$package_path/package.json")

  if [ ! -z "$version" ]; then
    echo $version
  else
    echo "Version not found in $package_path/package.json"
    exit 1;
  fi
else
  echo "package.json not found at $package_path"
  exit 1;
fi
